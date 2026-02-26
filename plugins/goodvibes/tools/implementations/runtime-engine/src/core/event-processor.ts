/**
 * Event Processor — Layer 1
 *
 * The main event processing loop. Knows nothing about WRFC, agents, or hooks.
 *
 * Processing flow per batch:
 *  1. Drain queue
 *  2. For each event:
 *     a. Check chain depth (circuit breaker)
 *     b. Match against triggers
 *     c. Execute handlers (with error handling)
 *     d. Collect results (new events, state updates)
 *     e. Persist state updates
 *     f. Enqueue new events (chained events)
 *     g. Update metrics
 *
 * Concurrency:
 *  - Workflow-level locking: events within the same workflow_id are serialised
 *  - Events without a workflow_id process freely (no locking)
 *
 * Budget:
 *  - Emits a warning event at the warning threshold
 *  - Pauses the loop at the pause threshold
 */

import { createLogger } from '../shared/logger.js';
import { generateEventId } from '../shared/utils.js';
import type {
  RuntimeEvent,
  HandlerResult,
  StateUpdate,
  TriggerRegistryInterface,
  StateStoreInterface,
  ErrorHandlerInterface,
  DeadLetterQueueInterface,
  TriggerHandlerFn,
  EventQueueInterface,
  LoopLifecycle,
  MetricsCollector,
} from './types.js';

const logger = createLogger('core:event-processor');

export interface BudgetConfig {
  /** Total token budget (0 = unlimited). */
  total: number;
  /** Warn when consumed tokens exceed this fraction of total (0–1). */
  warn_threshold: number;
  /** Pause when consumed tokens exceed this fraction of total (0–1). */
  pause_threshold: number;
}

export interface RateLimitConfig {
  /** Maximum events to process per window. */
  max_per_window: number;
  /** Window duration in ms. Default: 1000. */
  window_ms?: number;
}

export interface EventProcessorOptions {
  /** Max events to process per processBatch() call. Default: 100. */
  max_events_per_batch?: number;
  /** Max causal chain depth allowed before dropping an event. Default: 10. */
  max_chain_depth?: number;
  /** Optional budget configuration. */
  budget?: BudgetConfig;
  /**
   * Optional map of trigger_id → handler function.
   * Handlers are invoked when their trigger matches an event.
   */
  handlers?: Map<string, TriggerHandlerFn>;
  /**
   * Events below this priority are skipped during high-load conditions.
   * Useful for shedding low-priority load when the queue is deep.
   * Default: undefined (no floor — all events processed).
   */
  priority_floor?: number;
  /**
   * Optional rate limiting. When set, the processor will cap the number of
   * events processed within the configured time window.
   */
  rate_limit?: RateLimitConfig;
  /**
   * Emit a 'core:queue_depth_warning' event when queue depth exceeds this
   * threshold at the start of a batch. Default: undefined (no warning).
   */
  queue_depth_warning?: number;
  /**
   * Timeout in ms for workflow locks. Locks held longer than this are
   * considered stale and released automatically. Default: 30_000.
   */
  lock_timeout_ms?: number;
}

/**
 * Builds a chained event from a parent event.
 * Increments chain_depth and sets parent_event_id.
 */
function chainEvent(child: RuntimeEvent, parent: RuntimeEvent): RuntimeEvent {
  return {
    ...child,
    context: {
      ...child.context,
      parent_event_id: parent.id,
      chain_depth: (parent.context?.chain_depth ?? 0) + 1,
      workflow_id: child.context?.workflow_id ?? parent.context?.workflow_id,
    },
  };
}

/**
 * Apply state updates to the store.
 */
function applyStateUpdates(store: StateStoreInterface, updates: StateUpdate[]): void {
  for (const update of updates) {
    switch (update.op) {
      case 'set':
        store.set(update.key, update.value);
        break;
      case 'delete':
        store.delete(update.key);
        break;
      case 'merge':
        if (typeof update.value === 'object' && update.value !== null && !Array.isArray(update.value)) {
          store.merge(update.key, update.value as Record<string, unknown>);
        } else {
          // Fallback to set if value is not a plain object
          store.set(update.key, update.value);
        }
        break;
    }
  }
}

/**
 * Builds an internal event emitted when the chain depth limit is exceeded.
 */
function buildChainDepthExceededEvent(event: RuntimeEvent, maxDepth: number): RuntimeEvent {
  return {
    id: generateEventId(),
    source: 'internal',
    type: 'core:chain_depth_exceeded',
    payload: {
      original_event_id: event.id,
      original_event_type: event.type,
      depth: event.context?.chain_depth ?? 0,
      max_depth: maxDepth,
    },
    timestamp: Date.now(),
    priority: 5,
  };
}

/**
 * Builds a warning event emitted when queue depth exceeds the configured threshold.
 */
function buildQueueDepthWarningEvent(depth: number, threshold: number): RuntimeEvent {
  return {
    id: generateEventId(),
    source: 'internal',
    type: 'core:queue_depth_warning',
    payload: { depth, threshold },
    timestamp: Date.now(),
    priority: 5,
  };
}

/**
 * Main event processing loop.
 *
 * Accepts interfaces rather than concrete classes for all dependencies,
 * enabling Layer 2/3 to provide alternative implementations.
 */
export class EventProcessor {
  private readonly queue: EventQueueInterface;
  private readonly registry: TriggerRegistryInterface;
  private readonly store: StateStoreInterface;
  private readonly lifecycle: LoopLifecycle;
  private readonly metrics: MetricsCollector;
  private readonly errorHandler: ErrorHandlerInterface;
  // DeadLetterQueueInterface is satisfied by EventProcessor itself not using it directly;
  // the ErrorHandler holds the DLQ reference. Kept here for inspection/testing.
  private readonly deadLetter: DeadLetterQueueInterface;
  private readonly options: Required<Pick<EventProcessorOptions, 'max_events_per_batch' | 'max_chain_depth' | 'lock_timeout_ms'>>;
  private readonly budget: BudgetConfig | undefined;
  private readonly handlers: Map<string, TriggerHandlerFn>;
  private readonly priorityFloor: number | undefined;
  private readonly rateLimit: Required<RateLimitConfig> | undefined;
  private readonly queueDepthWarning: number | undefined;

  /**
   * Workflow-level processing lock: workflow_id → lock_acquired_at (epoch ms).
   * A lock is considered stale when its age exceeds lock_timeout_ms.
   */
  private readonly workflowLocks = new Map<string, number>();

  /** Count of tokens consumed (for budget tracking). */
  private tokensConsumed = 0;
  /** True once the budget warning has been sent; reset when tokens are replenished. */
  private budgetWarningSent = false;

  /** Rate limiter state: events processed in the current window. */
  private rateLimitCount = 0;
  private rateLimitWindowStart = 0;

  constructor(
    queue: EventQueueInterface,
    registry: TriggerRegistryInterface,
    store: StateStoreInterface,
    lifecycle: LoopLifecycle,
    metrics: MetricsCollector,
    errorHandler: ErrorHandlerInterface,
    deadLetter: DeadLetterQueueInterface,
    options: EventProcessorOptions = {},
  ) {
    this.queue = queue;
    this.registry = registry;
    this.store = store;
    this.lifecycle = lifecycle;
    this.metrics = metrics;
    this.errorHandler = errorHandler;
    this.deadLetter = deadLetter;
    this.options = {
      max_events_per_batch: options.max_events_per_batch ?? 100,
      max_chain_depth: options.max_chain_depth ?? 10,
      lock_timeout_ms: options.lock_timeout_ms ?? 30_000,
    };
    this.budget = options.budget;
    this.handlers = options.handlers ?? new Map();
    this.priorityFloor = options.priority_floor;
    this.rateLimit = options.rate_limit
      ? { max_per_window: options.rate_limit.max_per_window, window_ms: options.rate_limit.window_ms ?? 1000 }
      : undefined;
    this.queueDepthWarning = options.queue_depth_warning;
    this.rateLimitWindowStart = Date.now();
  }

  /**
   * Register a handler for a trigger.
   */
  registerHandler(trigger_id: string, handler: TriggerHandlerFn): void {
    this.handlers.set(trigger_id, handler);
  }

  /**
   * Process a single batch of events from the queue.
   * Only runs when the lifecycle is in 'running' state.
   * Returns the number of events processed.
   */
  async processBatch(): Promise<number> {
    if (!this.lifecycle.isProcessing()) {
      return 0;
    }

    // Check budget
    if (this.budget && this.budget.total > 0) {
      const fraction = this.tokensConsumed / this.budget.total;
      if (fraction >= this.budget.pause_threshold) {
        logger.warn('Budget pause threshold exceeded; pausing loop', {
          consumed: this.tokensConsumed,
          total: this.budget.total,
          fraction,
        });
        this.lifecycle.pause();
        return 0;
      }
    }

    // Queue depth warning
    const currentDepth = this.queue.depth();
    if (this.queueDepthWarning !== undefined && currentDepth >= this.queueDepthWarning) {
      logger.warn('Queue depth warning threshold reached', {
        depth: currentDepth,
        threshold: this.queueDepthWarning,
      });
      const warning = buildQueueDepthWarningEvent(currentDepth, this.queueDepthWarning);
      try { this.queue.enqueue(warning); } catch (err) { logger.debug('Failed to enqueue queue depth warning event', { error: err instanceof Error ? err.message : String(err) }); }
    }

    // Drain the queue
    const events = this.queue.drain();
    if (events.length === 0) return 0;

    this.metrics.onQueueDepthChange(0);

    const toProcess = events.slice(0, this.options.max_events_per_batch);
    // If we cut the batch, re-enqueue the remainder bypassing dedup
    if (events.length > this.options.max_events_per_batch) {
      try {
        this.queue.requeue(events.slice(this.options.max_events_per_batch));
      } catch (err) { logger.debug('Failed to requeue overflow batch events', { error: err instanceof Error ? err.message : String(err) }); }
    }

    let processed = 0;

    for (const event of toProcess) {
      // Priority floor: skip low-priority events during high load
      if (this.priorityFloor !== undefined && event.priority < this.priorityFloor) {
        logger.debug('Skipping event below priority floor', {
          event_id: event.id,
          event_type: event.type,
          priority: event.priority,
          floor: this.priorityFloor,
        });
        continue;
      }

      // Rate limiting
      if (this.rateLimit) {
        const now = Date.now();
        if (now - this.rateLimitWindowStart >= this.rateLimit.window_ms) {
          // New window
          this.rateLimitWindowStart = now;
          this.rateLimitCount = 0;
        }
        if (this.rateLimitCount >= this.rateLimit.max_per_window) {
          logger.debug('Rate limit reached; re-queuing remaining events', {
            max_per_window: this.rateLimit.max_per_window,
            window_ms: this.rateLimit.window_ms,
          });
          // Re-queue the remaining events in this batch
          const remaining = toProcess.slice(toProcess.indexOf(event));
          try { this.queue.requeue(remaining); } catch (err) { logger.debug('Failed to requeue rate-limited events', { error: err instanceof Error ? err.message : String(err) }); }
          break;
        }
        this.rateLimitCount++;
      }

      // Chain depth circuit breaker
      const depth = event.context?.chain_depth ?? 0;
      if (depth > this.options.max_chain_depth) {
        logger.warn('Chain depth exceeded; dropping event', {
          event_id: event.id,
          event_type: event.type,
          depth,
          max: this.options.max_chain_depth,
        });
        const exceeded = buildChainDepthExceededEvent(event, this.options.max_chain_depth);
        try { this.queue.enqueue(exceeded); } catch (err) { logger.debug('Failed to enqueue chain_depth_exceeded event', { error: err instanceof Error ? err.message : String(err) }); }
        continue;
      }

      // Workflow locking with timeout support
      const workflowId = event.context?.workflow_id;
      if (workflowId) {
        const lockAcquiredAt = this.workflowLocks.get(workflowId);
        if (lockAcquiredAt !== undefined) {
          const lockAge = Date.now() - lockAcquiredAt;
          if (lockAge < this.options.lock_timeout_ms) {
            // Lock is held and not stale — re-enqueue for next batch bypassing dedup
            try { this.queue.requeue([event]); } catch (err) { logger.debug('Failed to requeue workflow-locked event', { event_id: event.id, error: err instanceof Error ? err.message : String(err) }); }
            continue;
          }
          // Lock is stale — release and proceed
          logger.warn('Releasing stale workflow lock', {
            workflow_id: workflowId,
            lock_age_ms: lockAge,
            timeout_ms: this.options.lock_timeout_ms,
          });
        }
        this.workflowLocks.set(workflowId, Date.now());
      }

      try {
        await this.processEvent(event);
        processed++;
      } finally {
        if (workflowId) {
          this.workflowLocks.delete(workflowId);
        }
      }
    }

    this.metrics.onQueueDepthChange(this.queue.depth());
    return processed;
  }

  /**
   * Consume tokens against the budget.
   * At the warning threshold, emits a budget warning event.
   */
  consumeTokens(count: number): void {
    if (!this.budget || this.budget.total === 0) return;
    this.tokensConsumed += count;
    const fraction = this.tokensConsumed / this.budget.total;
    if (!this.budgetWarningSent && fraction >= this.budget.warn_threshold) {
      this.budgetWarningSent = true;
      logger.warn('Budget warning threshold reached', {
        consumed: this.tokensConsumed,
        total: this.budget.total,
        fraction,
      });
    }
  }

  /**
   * Replenish the token budget and reset the warning flag.
   * Call this when tokens are added back to the budget.
   */
  replenishTokens(count: number): void {
    if (!this.budget || this.budget.total === 0) return;
    this.tokensConsumed = Math.max(0, this.tokensConsumed - count);
    const fraction = this.tokensConsumed / this.budget.total;
    if (fraction < this.budget.warn_threshold) {
      this.budgetWarningSent = false;
    }
  }

  /**
   * Get count of active workflow locks.
   */
  activeWorkflowCount(): number {
    return this.workflowLocks.size;
  }

  // ─── Private ────────────────────────────────────────────────────────────────────────

  private async processEvent(event: RuntimeEvent): Promise<void> {
    const startMs = Date.now();
    logger.debug('Processing event', { id: event.id, type: event.type });

    // Match triggers
    const matchedTriggers = this.registry.match(event, this.store);

    // Collect all chained events and state updates from all handlers
    const chainedEvents: RuntimeEvent[] = [];

    for (const trigger of matchedTriggers) {
      this.registry.recordFire(trigger.id);
      this.metrics.onTriggerFired(trigger.id, event);

      const handler = this.handlers.get(trigger.id);
      let result: HandlerResult;

      if (handler) {
        const execResult = await this.errorHandler.execute(
          trigger.id,
          handler,
          event,
          trigger.retry,
        );

        if (!execResult.success) {
          this.metrics.onHandlerError(trigger.id, execResult.error!, event);
          // Enqueue error events
          for (const errEvt of execResult.error_events) {
            try { this.queue.enqueue(errEvt); } catch (err) { logger.debug('Failed to enqueue error event', { error: err instanceof Error ? err.message : String(err) }); }
          }
          continue;
        }

        result = execResult.result!;
      } else {
        // No handler registered: use trigger.actions as result
        result = { actions: trigger.actions };
      }

      // Collect state updates
      if (result.state_updates && result.state_updates.length > 0) {
        applyStateUpdates(this.store, result.state_updates);
      }

      // Collect chained events
      if (result.events && result.events.length > 0) {
        for (const newEvt of result.events) {
          chainedEvents.push(chainEvent(newEvt, event));
        }
      }
    }

    // Enqueue all chained events
    for (const chained of chainedEvents) {
      try {
        this.queue.enqueue(chained);
      } catch (err) {
        logger.warn('Failed to enqueue chained event (backpressure)', {
          event_id: chained.id,
          event_type: chained.type,
          queue_depth: this.queue.depth(),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const duration = Date.now() - startMs;
    this.metrics.onEventProcessed(event, duration);
  }
}
