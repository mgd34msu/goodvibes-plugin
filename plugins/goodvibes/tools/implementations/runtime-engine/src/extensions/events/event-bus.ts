/**
 * EventBus
 *
 * Central publish-subscribe bus for the runtime engine event system.
 *
 * Key behaviors:
 * - Pattern matching supports exact type, namespace wildcard (`hook:*`), and global wildcard (`*`)
 * - Sync handlers execute in registration order. Async handlers are fire-and-forget (errors caught and logged)
 * - Every emitted event receives an auto-incremented sequence number and metadata defaults
 * - An in-memory ring buffer retains the last `maxHistorySize` events for fast replay
 * - Optional event log integration is set post-construction by the process-manager
 * - Subscriptions support optional backpressure (maxConcurrent), timeout, dead-letter callback, and ordered delivery
 */

import { generateEventId, timestamp, toErrorMessage } from '../../shared/utils.js';
import { createLogger } from '../../shared/logger.js';
import type {
  RuntimeEvent,
  EventTypePattern,
  EventHandler,
  EventFilter,
  Unsubscribe,
  EventType,
} from '../../shared/events.js';

const logger = createLogger('event-bus');

/**
 * Minimal interface for the persistent event log.
 * Injected by the process-manager to decouple the EventBus from file I/O.
 */
export interface EventLogLike {
  /** Append a single event to the persistent log. */
  append(event: RuntimeEvent): void;
}

/**
 * Error thrown when a handler exceeds its configured `timeout` limit.
 */
export class TimeoutError extends Error {
  readonly code = 'HANDLER_TIMEOUT';
  constructor(timeoutMs: number) {
    super(`Handler timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * Options that can be passed when subscribing to an event pattern.
 *
 * All fields are optional and default to unrestricted / parallel / no-timeout.
 */
export interface SubscriptionOptions {
  /**
   * Maximum number of concurrent handler executions for this subscription.
   *
   * When set, uses a semaphore to limit parallelism. If the limit is reached,
   * new invocations are queued until a running invocation completes.
   *
   * Default: unlimited (no semaphore).
   */
  maxConcurrent?: number;

  /**
   * Timeout in milliseconds for each handler invocation.
   *
   * If the handler (or its returned Promise) does not resolve within this
   * period, a `TimeoutError` is raised and the invocation is treated as
   * failed (routed to `onError` if provided, otherwise logged as a warning).
   *
   * Default: no timeout.
   */
  timeout?: number;

  /**
   * Dead-letter callback invoked when the handler throws or rejects.
   *
   * Receives the error and the event that triggered the handler.
   * If omitted, errors are logged as warnings (previous default behavior).
   *
   * Default: log warning.
   */
  onError?: (error: Error, event: RuntimeEvent) => void;

  /**
   * When `true`, handler invocations for this subscription are serialised:
   * each invocation awaits completion before the next starts.
   *
   * When `false` (default), all matching handlers fire in parallel.
   *
   * Default: `false`.
   */
  ordered?: boolean;
}

/** Internal subscription record stored per registered handler. */
interface SubscriptionEntry {
  handler: EventHandler;
  options: SubscriptionOptions;
  /** Semaphore state, allocated lazily when maxConcurrent is set. */
  semaphore?: SemaphoreState;
  /**
   * Queue tail Promise used for ordered delivery.
   * Each invocation chains onto this tail so executions are sequential.
   */
  orderedTail?: Promise<void>;
}

/** Semaphore state for maxConcurrent limiting. */
interface SemaphoreState {
  /** Number of currently executing invocations. */
  running: number;
  /** Maximum allowed concurrent invocations. */
  max: number;
  /** Queue of resolvers waiting for a slot to become available. */
  queue: Array<() => void>;
}

/**
 * Acquire one slot from the semaphore.
 * If at capacity, waits until a slot is released.
 */
function semaphoreAcquire(sem: SemaphoreState): Promise<void> {
  if (sem.running < sem.max) {
    sem.running++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    sem.queue.push(resolve);
  });
}

/**
 * Release one slot back to the semaphore.
 * If waiters are queued, the next one is resolved immediately.
 */
function semaphoreRelease(sem: SemaphoreState): void {
  const next = sem.queue.shift();
  if (next) {
    // Slot transferred directly to waiter — running count stays the same
    next();
  } else {
    sem.running--;
  }
}

/**
 * Wraps `handler(event)` in a timeout race if `timeoutMs` is set.
 * Always returns a Promise regardless of whether the handler is sync or async.
 */
function invokeWithTimeout(
  handler: EventHandler,
  event: RuntimeEvent,
  timeoutMs?: number,
): Promise<void> {
  let resultPromise: Promise<void>;
  try {
    const result = handler(event);
    resultPromise = result instanceof Promise ? result : Promise.resolve();
  } catch (err) {
    return Promise.reject(err);
  }

  if (timeoutMs === undefined || timeoutMs <= 0) {
    return resultPromise;
  }

  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(timeoutMs)), timeoutMs);
  });

  return Promise.race([resultPromise, timeoutPromise]).finally(() => {
    clearTimeout(timer!);
  });
}

/**
 * Dispatches a single event to one subscription entry, respecting all options.
 *
 * Errors are routed to `onError` when configured, otherwise logged as warnings.
 * This function never throws — all rejections are swallowed after routing.
 */
function dispatchToEntry(
  entry: SubscriptionEntry,
  event: RuntimeEvent,
  pattern: EventTypePattern,
): void {
  const { handler, options } = entry;

  const handleError = (err: unknown): void => {
    const error = err instanceof Error ? err : new Error(String(err));
    if (options.onError) {
      try {
        options.onError(error, event);
      } catch (cbErr) {
        logger.warn('onError callback threw', { pattern, error: toErrorMessage(cbErr) });
      }
    } else {
      logger.warn('Async handler error', { pattern, error: toErrorMessage(err) });
    }
  };

  const execute = async (): Promise<void> => {
    const sem = entry.semaphore;
    if (sem) {
      await semaphoreAcquire(sem);
    }
    try {
      await invokeWithTimeout(handler, event, options.timeout);
    } catch (err) {
      handleError(err);
    } finally {
      if (sem) {
        semaphoreRelease(sem);
      }
    }
  };

  if (options.ordered) {
    // Chain onto the ordered tail so invocations are sequential
    const prev = entry.orderedTail ?? Promise.resolve();
    const current = prev.then(execute).catch(() => {
      // errors already handled inside execute(); swallow chain rejection
    });
    entry.orderedTail = current;
    current.then(() => {
      // Reset tail when chain is idle to allow GC
      if (entry.orderedTail === current) {
        entry.orderedTail = undefined;
      }
    });
  } else {
    // Fire-and-forget (parallel)
    execute().catch(() => {
      // errors already handled inside execute(); swallow here
    });
  }
}

/**
 * Publish-subscribe bus for all runtime events.
 *
 * Instantiate once per engine instance and share via dependency injection.
 *
 * @example
 * ```ts
 * const bus = new EventBus();
 *
 * const off = bus.on('hook:*', (event) => {
 *   logger.info('Hook fired:', event.type);
 * });
 *
 * // Subscription with backpressure, timeout, and dead-letter handling
 * bus.on(
 *   'agent:*',
 *   async (event) => { await processAgent(event); },
 *   { maxConcurrent: 3, timeout: 5000, onError: (err, ev) => dlq.push({ err, ev }) },
 * );
 *
 * // Ordered delivery (sequential processing)
 * bus.on(
 *   'hook:post_tool_use',
 *   async (event) => { await writeLog(event); },
 *   { ordered: true },
 * );
 *
 * bus.emit({
 *   id: generateEventId(),
 *   timestamp: timestamp(),
 *   type: 'hook:pre_tool_use',
 *   source: { kind: 'hook', hook_name: 'pre_tool_use' },
 *   payload: { type: 'hook:pre_tool_use', data: { hook_name: 'pre_tool_use', duration_ms: 0 } },
 * });
 *
 * off(); // unsubscribe
 * ```
 */
export class EventBus {
  /**
   * Registered handlers keyed by subscription pattern.
   * Each pattern maps to a Map of (unique symbol → SubscriptionEntry).
   * Using a symbol key preserves insertion order and supports O(1) deletion.
   */
  private readonly handlers: Map<EventTypePattern, Map<symbol, SubscriptionEntry>>;

  /** Monotonically increasing sequence counter. Starts at 1 for the first event. */
  private sequence: number = 0;

  /** Ring buffer storage for history events. */
  private historyBuffer: (RuntimeEvent | undefined)[];
  /** Write index into the circular history buffer. */
  private historyWriteIndex: number = 0;
  /** Number of events currently in the history buffer. */
  private historyCount: number = 0;

  /** Maximum events to retain in the history ring buffer. */
  private readonly maxHistorySize: number;

  /** Optional persistent event log. Set by the process-manager after construction. */
  private eventLog?: EventLogLike;

  /**
   * Creates a new EventBus instance.
   *
   * @param maxHistorySize - Maximum number of events to retain in the in-memory
   *   ring buffer. Older events are evicted when the buffer is full.
   *   Defaults to 10,000.
   *
   * @remarks
   * When `maxHistorySize` is `0`, the ring buffer is disabled entirely: events
   * are still emitted and dispatched to subscribers, but no history is retained.
   * `getHistory()` will always return an empty array. This is a valid
   * configuration when in-memory history is not needed.
   *
   * Negative values are treated identically to `0` (no history). Passing a
   * fractional value is coerced to an integer via `Math.max(0, Math.floor(...))`.
   */
  constructor(maxHistorySize = 10_000) {
    this.handlers = new Map();
    const safeSize = Math.max(0, Math.floor(maxHistorySize));
    this.historyBuffer = safeSize > 0 ? new Array(safeSize) : [];
    this.maxHistorySize = safeSize;
  }

  /**
   * Injects a persistent event log.
   *
   * Called by the process-manager once the persistence layer is initialised.
   * After this point every emitted event is also appended to the log.
   *
   * @param log - An object with an `append` method.
   */
  setEventLog(log: EventLogLike): void {
    this.eventLog = log;
  }

  /**
   * Emits a runtime event.
   *
   * Automatically fills in missing metadata fields and assigns the next
   * sequence number. Matching handlers execute synchronously in registration
   * order; async handlers are fire-and-forget with errors logged via structured logger.
   *
   * @param event - Partial event. The `id`, `timestamp`, and full `metadata`
   *   may be omitted — the bus will generate or backfill them.
   * @returns The fully-formed RuntimeEvent as stored in history.
   */
  emit(
    event: Omit<RuntimeEvent, 'metadata'> & { metadata?: Partial<RuntimeEvent['metadata']> },
  ): RuntimeEvent {
    const seq = ++this.sequence;

    const full: RuntimeEvent = {
      id: event.id ?? generateEventId(),
      timestamp: event.timestamp ?? timestamp(),
      source: event.source,
      type: event.type,
      payload: event.payload,
      metadata: {
        session_id:
          event.metadata?.session_id ??
          process.env['CLAUDE_SESSION_ID'] ??
          process.env['SESSION_ID'] ??
          'unknown',
        correlation_id: event.metadata?.correlation_id,
        causation_id: event.metadata?.causation_id,
        sequence: seq,
        version: 1,
      },
    };

    // Persist to event log if available
    if (this.eventLog) {
      try {
        this.eventLog.append(full);
      } catch (err) {
        logger.error('Event log append failed', { error: toErrorMessage(err) });
      }
    }

    // Maintain ring buffer (O(1) circular buffer)
    // Skip if history is disabled (maxHistorySize=0)
    if (this.maxHistorySize > 0) {
      this.historyBuffer[this.historyWriteIndex % this.maxHistorySize] = full;
      this.historyWriteIndex++;
      // Prevent integer overflow on long-running processes
      if (this.historyWriteIndex >= Number.MAX_SAFE_INTEGER - this.maxHistorySize) {
        this.historyWriteIndex = this.historyWriteIndex % this.maxHistorySize;
      }
      if (this.historyCount < this.maxHistorySize) this.historyCount++;
    }

    // Dispatch to matching handlers
    for (const [pattern, entryMap] of this.handlers) {
      if (this.matchPattern(full.type, pattern)) {
        for (const entry of entryMap.values()) {
          dispatchToEntry(entry, full, pattern);
        }
      }
    }

    return full;
  }

  /**
   * Subscribes to events matching `pattern`.
   *
   * @param pattern - Exact event type, namespace wildcard (`hook:*`), or global wildcard (`*`).
   * @param handler - Callback invoked for each matching event.
   * @param options - Optional subscription options (backpressure, timeout, dead-letter, ordering).
   * @returns An unsubscribe function; call it to stop receiving events.
   */
  on(pattern: EventTypePattern, handler: EventHandler, options?: SubscriptionOptions): Unsubscribe {
    if (!this.handlers.has(pattern)) {
      this.handlers.set(pattern, new Map());
    }

    const key = Symbol();
    const opts = options ?? {};

    const entry: SubscriptionEntry = {
      handler,
      options: opts,
      semaphore:
        opts.maxConcurrent !== undefined && opts.maxConcurrent > 0
          ? { running: 0, max: opts.maxConcurrent, queue: [] }
          : undefined,
    };

    this.handlers.get(pattern)?.set(key, entry);

    return () => {
      const entryMap = this.handlers.get(pattern);
      if (entryMap) {
        entryMap.delete(key);
        if (entryMap.size === 0) {
          this.handlers.delete(pattern);
        }
      }
    };
  }

  /**
   * Subscribes to the next single event matching `pattern`.
   *
   * The subscription is automatically removed after the first delivery.
   *
   * @param pattern - Exact event type, namespace wildcard, or global wildcard.
   * @param handler - Callback invoked once for the next matching event.
   * @param options - Optional subscription options (backpressure, timeout, dead-letter, ordering).
   * @returns An unsubscribe function; call it to cancel before the event fires.
   */
  once(
    pattern: EventTypePattern,
    handler: EventHandler,
    options?: SubscriptionOptions,
  ): Unsubscribe {
    const off = this.on(
      pattern,
      (event) => {
        off();
        return handler(event);
      },
      options,
    );
    return off;
  }

  /**
   * Returns a snapshot of the in-memory event history, optionally filtered.
   *
   * This operates on the ring buffer only — events evicted from the buffer
   * are not available here. For full historical replay, use the persistent
   * event log via the process-manager.
   *
   * @param filter - Optional filter criteria.
   * @returns Filtered and (optionally) limited array of events in emission order.
   */
  getHistory(filter?: EventFilter): RuntimeEvent[] {
    // Read from circular buffer in chronological order
    const events: RuntimeEvent[] = [];
    if (this.historyCount > 0) {
      const startIndex = this.historyCount < this.maxHistorySize
        ? 0
        : this.historyWriteIndex % this.maxHistorySize;
      for (let i = 0; i < this.historyCount; i++) {
        const entry = this.historyBuffer[(startIndex + i) % this.maxHistorySize];
        if (entry !== undefined) events.push(entry);
      }
    }
    let filteredEvents = events;

    if (filter) {
      if (filter.types && filter.types.length > 0) {
        const typeSet = new Set<string>(filter.types);
        filteredEvents = filteredEvents.filter((e) => typeSet.has(e.type));
      }

      if (filter.source) {
        const src = filter.source;
        filteredEvents = filteredEvents.filter((e) => {
          // Partial match: every defined key in filter.source must match
          for (const key of Object.keys(src) as (keyof typeof src)[]) {
            if (src[key] !== undefined && e.source[key as keyof typeof e.source] !== src[key]) {
              return false;
            }
          }
          return true;
        });
      }

      if (filter.since) {
        const since = new Date(filter.since).getTime();
        filteredEvents = filteredEvents.filter((e) => new Date(e.timestamp).getTime() >= since);
      }

      if (filter.until) {
        const until = new Date(filter.until).getTime();
        filteredEvents = filteredEvents.filter((e) => new Date(e.timestamp).getTime() <= until);
      }

      if (filter.correlation_id) {
        const cid = filter.correlation_id;
        filteredEvents = filteredEvents.filter((e) => e.metadata.correlation_id === cid);
      }

      if (filter.limit && filter.limit > 0) {
        filteredEvents = filteredEvents.slice(-filter.limit);
      }
    }

    return filteredEvents;
  }

  /**
   * Returns the total number of registered handler functions.
   *
   * @param pattern - If provided, returns the count only for that pattern.
   *   If omitted, returns the total across all patterns.
   * @returns Handler count.
   */
  listenerCount(pattern?: EventTypePattern): number {
    if (pattern !== undefined) {
      return this.handlers.get(pattern)?.size ?? 0;
    }
    let total = 0;
    for (const entryMap of this.handlers.values()) {
      total += entryMap.size;
    }
    return total;
  }

  /**
   * Removes all registered handlers.
   *
   * Should be called during engine shutdown to prevent memory leaks.
   */
  removeAllListeners(): void {
    this.handlers.clear();
    this.historyBuffer = new Array(this.maxHistorySize);
    this.historyWriteIndex = 0;
    this.historyCount = 0;
  }

  /**
   * Tests whether `eventType` matches the given subscription `pattern`.
   *
   * Rules:
   * - `'*'` matches any event type
   * - `'namespace:*'` matches any event whose type starts with `namespace:`
   * - An exact string matches only that specific type
   *
   * @param eventType - The event type to test (e.g. `'hook:pre_tool_use'`).
   * @param pattern - The subscription pattern to test against.
   * @returns `true` if the event type matches the pattern.
   */
  private matchPattern(eventType: EventType, pattern: EventTypePattern): boolean {
    if (pattern === '*') {
      return true;
    }
    if (pattern.endsWith(':*')) {
      const namespace = pattern.slice(0, -2); // strip ':*'
      return eventType.startsWith(`${namespace}:`);
    }
    return eventType === pattern;
  }
}
