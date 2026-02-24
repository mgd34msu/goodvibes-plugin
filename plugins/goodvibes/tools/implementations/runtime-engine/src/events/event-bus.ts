/**
 * EventBus
 *
 * Central publish-subscribe bus for the runtime engine event system.
 *
 * Key behaviors:
 * - Pattern matching supports exact type, namespace wildcard (`hook:*`), and global wildcard (`*`)
 * - Sync handlers execute in registration order. Async handlers are fire-and-forget (errors caught and logged)
 * - Async handlers are fire-and-forget: errors are caught and logged via structured logger
 * - Every emitted event receives an auto-incremented sequence number and metadata defaults
 * - An in-memory ring buffer retains the last `maxHistorySize` events for fast replay
 * - Optional event log integration is set post-construction by the process-manager
 */

import { generateEventId, timestamp, toErrorMessage } from '../shared/utils.js';
import { createLogger } from '../shared/logger.js';
import type {
  RuntimeEvent,
  EventTypePattern,
  EventHandler,
  EventFilter,
  Unsubscribe,
  EventType,
} from './types.js';

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
 * Publish-subscribe bus for all runtime events.
 *
 * Instantiate once per engine instance and share via dependency injection.
 *
 * @example
 * ```ts
 * const bus = new EventBus();
 *
 * const off = bus.on('hook:*', (event) => {
 *   console.log('Hook fired:', event.type);
 * });
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
  /** Registered handlers keyed by subscription pattern. */
  private readonly handlers: Map<EventTypePattern, Set<EventHandler>>;

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
    for (const [pattern, handlerSet] of this.handlers) {
      if (this.matchPattern(full.type, pattern)) {
        for (const handler of handlerSet) {
          try {
            const result = handler(full);
            if (result instanceof Promise) {
              result.catch((err: unknown) => {
                logger.warn('Async handler error', { pattern, error: toErrorMessage(err) });
              });
            }
          } catch (err) {
            logger.warn('Sync handler error', { pattern, error: toErrorMessage(err) });
          }
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
   * @returns An unsubscribe function; call it to stop receiving events.
   */
  on(pattern: EventTypePattern, handler: EventHandler): Unsubscribe {
    if (!this.handlers.has(pattern)) {
      this.handlers.set(pattern, new Set());
    }
    this.handlers.get(pattern)!.add(handler);

    return () => {
      this.handlers.get(pattern)?.delete(handler);
      if (this.handlers.get(pattern)?.size === 0) {
        this.handlers.delete(pattern);
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
   * @returns An unsubscribe function; call it to cancel before the event fires.
   */
  once(pattern: EventTypePattern, handler: EventHandler): Unsubscribe {
    const off = this.on(pattern, (event) => {
      off();
      const result = handler(event);
      if (result instanceof Promise) {
        result.catch((err: unknown) => {
          logger.warn('Once handler error', { pattern, error: toErrorMessage(err) });
        });
      }
    });
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
    for (const handlerSet of this.handlers.values()) {
      total += handlerSet.size;
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
