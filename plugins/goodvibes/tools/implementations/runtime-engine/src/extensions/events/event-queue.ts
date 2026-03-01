/**
 * Event Queue
 *
 * Priority-ordered deferred processing queue with exponential backoff retries
 * and a dead-letter queue for exhausted messages.
 *
 * Priority ordering: CRITICAL (0) > HIGH (1) > NORMAL (2) > LOW (3).
 * Within the same priority, entries are processed FIFO (oldest first).
 *
 * Processing uses setTimeout to schedule each item, yielding to the Node.js
 * event loop between items to prevent the queue from monopolising the CPU.
 */

import type { RuntimeEvent } from './types.js';
import { generateId, timestamp, toErrorMessage } from '../../shared/utils.js';
import { createLogger } from '../../shared/logger.js';

const logger = createLogger('event-queue');

/** Maximum number of entries the dead-letter queue will retain (oldest evicted first). */
const MAX_DEAD_LETTERS = 1000;

/** Priority levels for queue entries. Lower number = higher priority. */
export enum QueuePriority {
  CRITICAL = 0, // Agent failures, workflow errors
  HIGH = 1,     // Build/test results, file events
  NORMAL = 2,   // Hook events, trigger evaluations
  LOW = 3,      // Telemetry, analytics, GC
}

/** A single entry awaiting processing in the event queue. */
export interface QueueEntry {
  /** Unique identifier for this entry. */
  id: string;
  /** The event to be processed. */
  event: RuntimeEvent;
  /** Processing priority — lower number is higher priority. */
  priority: QueuePriority;
  /** Name of the registered handler function to invoke. */
  handler: string;
  /** ISO-8601 timestamp of when this entry was enqueued. */
  enqueued_at: string;
  /** Number of processing attempts made so far. */
  attempts: number;
  /** Maximum allowed processing attempts before dead-lettering. */
  max_attempts: number;
  /** Current backoff delay in ms before the next retry. */
  backoff_ms: number;
  /** Optional ISO-8601 deadline — entry is dropped if processing starts after this. */
  deadline?: string;
  /** Internal: accumulated error messages across retry attempts (not part of public API). */
  _accumulated_errors?: string[];
}

/** A queue entry that has exhausted all retry attempts. */
export interface DeadLetterEntry extends QueueEntry {
  /** ISO-8601 timestamp when the entry was moved to the dead-letter queue. */
  failed_at: string;
  /** Error message from the most recent failed attempt. */
  last_error: string;
  /** Error messages from all failed attempts in chronological order. */
  all_errors: string[];
}

/** Snapshot statistics for the event queue. */
export interface QueueStats {
  /** Number of entries currently waiting to be processed. */
  pending: number;
  /** Number of entries currently being processed (0 or 1 in this impl). */
  processing: number;
  /** Total entries successfully processed since queue creation. */
  completed: number;
  /** Total entries that failed at least once (including recovered). */
  failed: number;
  /** Number of entries in the dead-letter queue. */
  dead_letters: number;
  /** Pending entry count broken down by priority level. */
  by_priority: Record<number, number>;
  /** Average processing time in ms over all completed entries. */
  avg_processing_ms: number;
  /** Age in ms of the oldest pending entry, or 0 if queue is empty. */
  oldest_pending_age_ms: number;
}

/**
 * Handler function type. Receives a queue entry and may return a promise.
 * Throwing (or rejecting) triggers the retry/dead-letter logic.
 */
export type QueueHandler = (entry: QueueEntry) => void | Promise<void>;

/** Queue configuration — subset of RuntimeConfig.queue */
export interface EventQueueConfig {
  /**
   * Maximum number of entries that may be pending across all priority buckets.
   *
   * @remarks
   * Must be at least 1. Passing `0` (or any value less than 1) is invalid and
   * will cause the constructor to throw an `Error`. A queue with `max_size=0`
   * can never hold any items — every `enqueue()` call would immediately throw,
   * which is never a useful configuration.
   */
  max_size: number;
  max_attempts: number;
  backoff_base_ms: number;
  backoff_multiplier: number;
  process_interval_ms: number;
}

/**
 * Priority event queue with deferred processing, exponential backoff retries,
 * and a dead-letter queue.
 *
 * @example
 * const queue = new EventQueue(config.queue);
 * queue.registerHandler('onHook', async (entry) => { ... });
 * queue.start();
 * queue.enqueue({ event, priority: QueuePriority.NORMAL, handler: 'onHook', max_attempts: 3 });
 */
export class EventQueue {
  /**
   * Priority buckets: index matches QueuePriority value.
   * buckets[0] = CRITICAL, [1] = HIGH, [2] = NORMAL, [3] = LOW.
   * Each bucket is a FIFO array; dequeue always takes from the lowest-index
   * non-empty bucket.
   */
  private buckets: [QueueEntry[], QueueEntry[], QueueEntry[], QueueEntry[]] = [[], [], [], []];
  /** Entries that exhausted all retry attempts. */
  private deadLetters: DeadLetterEntry[] = [];
  /** Registered handler functions keyed by name. */
  private handlers: Map<string, QueueHandler> = new Map();
  /** Whether the queue is currently executing a processNext call. */
  private processing = false;
  /** Handle to the pending setImmediate / setTimeout timer. */
  private processTimer: ReturnType<typeof setTimeout> | null = null;
  /** Whether start() has been called (controls the run loop). */
  private running = false;

  // Lifetime counters for stats
  private completedCount = 0;
  private failedCount = 0;
  private totalProcessingMs = 0;

  // Configuration
  private readonly maxSize: number;
  private readonly backoffBase: number;
  private readonly backoffMultiplier: number;
  private readonly processIntervalMs: number;

  constructor(config: EventQueueConfig) {
    if (config.max_size < 1) {
      throw new Error(
        `EventQueue: max_size must be at least 1, got ${config.max_size}. ` +
          'A queue with max_size=0 rejects every enqueue call immediately.',
      );
    }
    this.maxSize = config.max_size;
    this.backoffBase = config.backoff_base_ms;
    this.backoffMultiplier = config.backoff_multiplier;
    this.processIntervalMs = config.process_interval_ms;
  }

  /**
   * Registers a handler function under the given name.
   *
   * Handlers are invoked by name when a matching queue entry is processed.
   * Re-registering an existing name silently replaces the previous handler.
   *
   * @param name - Handler name, referenced by {@link QueueEntry.handler}.
   * @param handler - The function to invoke.
   */
  registerHandler(name: string, handler: QueueHandler): void {
    this.handlers.set(name, handler);
    logger.debug('Handler registered', { name });
  }

  /**
   * Adds an event to the queue for deferred processing.
   *
   * The entry is pushed to the appropriate priority bucket (FIFO within each
   * bucket). Dequeue always takes from the highest non-empty priority bucket. If the queue is at capacity the entry is rejected.
   *
   * @param entry - Entry fields; `id`, `enqueued_at`, `attempts`, and `backoff_ms`
   *   are populated automatically if omitted.
   * @returns The assigned entry ID.
   * @throws {Error} When the queue has reached its maximum capacity.
   */
  enqueue(
    entry: Omit<QueueEntry, 'id' | 'enqueued_at' | 'attempts' | 'backoff_ms'> & { id?: string },
  ): string {
    if (this.totalPending() >= this.maxSize) {
      throw new Error(
        `EventQueue is full (max_size=${this.maxSize}). Entry rejected for handler "${entry.handler}".`,
      );
    }

    const fullEntry: QueueEntry = {
      ...entry,
      id: entry.id ?? generateId(),
      enqueued_at: timestamp(),
      attempts: 0,
      backoff_ms: this.backoffBase,
    };

    this.insertBucket(fullEntry);

    logger.debug('Entry enqueued', {
      id: fullEntry.id,
      priority: fullEntry.priority,
      handler: fullEntry.handler,
      queue_depth: this.totalPending(),
    });

    // Kick off processing if the queue is running but idle
    if (this.running && !this.processing && this.processTimer === null) {
      this.scheduleNext(0);
    }

    return fullEntry.id;
  }

  /**
   * Starts the queue processing loop.
   *
   * Safe to call multiple times — subsequent calls are no-ops if already running.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    logger.info('Event queue started');
    if (this.totalPending() > 0) {
      this.scheduleNext(0);
    }
  }

  /**
   * Stops the queue processing loop.
   *
   * In-flight processing completes naturally; no new items are started.
   * Use {@link drain} for a graceful shutdown that waits for completion.
   */
  stop(): void {
    this.running = false;
    if (this.processTimer !== null) {
      clearTimeout(this.processTimer as ReturnType<typeof setTimeout>);
      this.processTimer = null;
    }
    logger.info('Event queue stopped');
  }

  /**
   * Returns current queue statistics.
   */
  getStats(): QueueStats {
    const byPriority: Record<number, number> = {
      [QueuePriority.CRITICAL]: 0,
      [QueuePriority.HIGH]: 0,
      [QueuePriority.NORMAL]: 0,
      [QueuePriority.LOW]: 0,
    };
    for (let p = 0; p < 4; p++) {
      byPriority[p] = (this.buckets[p as QueuePriority] ?? []).length;
    }

    const now = Date.now();
    const firstBucket = this.buckets.find((b) => b.length > 0);
    const oldest = firstBucket?.[0];
    const oldestAgeMs = oldest ? now - new Date(oldest.enqueued_at).getTime() : 0;

    return {
      pending: this.totalPending(),
      processing: this.processing ? 1 : 0,
      completed: this.completedCount,
      failed: this.failedCount,
      dead_letters: this.deadLetters.length,
      by_priority: byPriority,
      avg_processing_ms:
        this.completedCount > 0
          ? Math.round(this.totalProcessingMs / this.completedCount)
          : 0,
      oldest_pending_age_ms: oldestAgeMs,
    };
  }

  /**
   * Returns a copy of the dead-letter queue entries.
   */
  getDeadLetters(): DeadLetterEntry[] {
    return [...this.deadLetters];
  }

  /**
   * Moves a dead-letter entry back into the main queue for another attempt.
   *
   * The entry's attempt counter is reset and backoff is set to the base value.
   *
   * @param id - ID of the dead-letter entry to retry.
   * @returns `true` if the entry was found and re-queued, `false` otherwise.
   */
  retryDeadLetter(id: string): boolean {
    const idx = this.deadLetters.findIndex((e) => e.id === id);
    if (idx === -1) return false;

    const [dead] = this.deadLetters.splice(idx, 1);
    const retryEntry: QueueEntry = {
      id: dead.id,
      event: dead.event,
      priority: dead.priority,
      handler: dead.handler,
      enqueued_at: timestamp(),
      attempts: 0,
      max_attempts: dead.max_attempts,
      backoff_ms: this.backoffBase,
      deadline: dead.deadline,
    };

    this.insertBucket(retryEntry);
    logger.info('Dead-letter entry re-queued', { id });

    if (this.running && !this.processing && this.processTimer === null) {
      this.scheduleNext(0);
    }

    return true;
  }

  /**
   * Processes remaining queue items up to the given timeout.
   *
   * Temporarily starts the queue if it is stopped. Returns the number of
   * items processed and the number still remaining when the timeout expires.
   *
   * @param timeout_ms - Maximum wall-clock time to wait for the queue to drain.
   */
  async drain(timeout_ms: number): Promise<{ processed: number; remaining: number }> {
    const deadline = Date.now() + timeout_ms;
    const initialCompleted = this.completedCount;
    const wasRunning = this.running;

    if (!wasRunning) {
      this.running = true;
    }

    while (this.totalPending() > 0 && Date.now() < deadline) {
      await this.processNext();
      // Yield briefly to allow backoff-delayed re-queued items to settle
      await new Promise<void>((resolve) => setImmediate(resolve));
    }

    if (!wasRunning) {
      this.running = false;
    }

    return {
      processed: this.completedCount - initialCompleted,
      remaining: this.totalPending(),
    };
  }

  /** Number of entries currently in the pending queue. */
  get size(): number {
    return this.totalPending();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Returns total number of pending entries across all priority buckets. */
  private totalPending(): number {
    return (this.buckets[0]?.length ?? 0) + (this.buckets[1]?.length ?? 0) + (this.buckets[2]?.length ?? 0) + (this.buckets[3]?.length ?? 0);
  }

  /**
   * Pushes an entry into the appropriate priority bucket.
   *
   * Each bucket is a FIFO array corresponding to a QueuePriority level.
   * Dequeue always takes from the lowest-index non-empty bucket, so
   * CRITICAL (0) is always served before HIGH (1), NORMAL (2), and LOW (3).
   */
  private insertBucket(entry: QueueEntry): void {
    this.buckets[entry.priority]?.push(entry);
  }

  /**
   * Schedules the next `processNext` call via `setTimeout`.
   *
   * A delay of 0 yields to the event loop before the next item is processed.
   * A positive delay implements the retry backoff or inter-cycle interval.
   */
  private scheduleNext(delayMs: number): void {
    if (this.processTimer !== null) return;
    if (delayMs <= 0) {
      this.processTimer = setTimeout(() => {
        this.processTimer = null;
        void this.processNext();
      }, 0);
    } else {
      this.processTimer = setTimeout(() => {
        this.processTimer = null;
        void this.processNext();
      }, delayMs);
    }
  }

  /**
   * Dequeues and processes the next entry.
   *
   * On success: increments the completed counter and schedules the next item.
   * On failure: increments attempts, applies exponential backoff, and either
   * re-queues with delay or moves to the dead-letter queue.
   */
  private async processNext(): Promise<void> {
    if (!this.running || this.totalPending() === 0) return;
    if (this.processing) return;

    this.processing = true;
    const bucket = this.buckets.find((b) => b.length > 0)!;
    const entry = bucket.shift()!;
    const startMs = Date.now();
    let retryBackoffMs = 0;

    try {
      // Deadline check — drop if past
      if (entry.deadline && new Date(entry.deadline).getTime() < Date.now()) {
        logger.warn('Entry dropped: deadline exceeded', {
          id: entry.id,
          deadline: entry.deadline,
        });
        this.processing = false;
        this.scheduleNext(0);
        return;
      }

      const handler = this.handlers.get(entry.handler);
      if (!handler) {
        logger.warn('No handler registered for entry', {
          id: entry.id,
          handler: entry.handler,
        });
        this.processing = false;
        this.scheduleNext(0);
        return;
      }

      await handler(entry);

      const durationMs = Date.now() - startMs;
      this.completedCount++;
      this.totalProcessingMs += durationMs;

      logger.debug('Entry processed', {
        id: entry.id,
        handler: entry.handler,
        duration_ms: durationMs,
      });
    } catch (err) {
      const errorMessage = toErrorMessage(err);
      const updatedEntry: QueueEntry = {
        ...entry,
        attempts: entry.attempts + 1,
        backoff_ms: Math.round(entry.backoff_ms * this.backoffMultiplier),
        _accumulated_errors: [...(entry._accumulated_errors ?? []), errorMessage],
      };

      this.failedCount++;

      if (updatedEntry.attempts >= entry.max_attempts) {
        // Move to dead-letter queue
        const dlEntry: DeadLetterEntry = {
          ...updatedEntry,
          failed_at: timestamp(),
          last_error: errorMessage,
          all_errors: updatedEntry._accumulated_errors ?? [errorMessage],
        };
        if (this.deadLetters.length >= MAX_DEAD_LETTERS) {
          this.deadLetters.shift();
        }
        this.deadLetters.push(dlEntry);
        logger.error('Entry dead-lettered', {
          id: entry.id,
          handler: entry.handler,
          attempts: updatedEntry.attempts,
          error: errorMessage,
        });
      } else {
        // Re-queue with backoff delay
        retryBackoffMs = updatedEntry.backoff_ms;
        logger.warn('Entry failed, will retry', {
          id: entry.id,
          handler: entry.handler,
          attempts: updatedEntry.attempts,
          backoff_ms: updatedEntry.backoff_ms,
          error: errorMessage,
        });
        // Insert back — will schedule with backoff
        this.insertBucket(updatedEntry);
      }
    } finally {
      this.processing = false;

      // Schedule next item if queue is non-empty and running
      if (this.running && this.totalPending() > 0) {
        // Use the retry backoff from the catch block if this was a retry,
        // otherwise use the configured process interval between cycles.
        this.scheduleNext(retryBackoffMs > 0 ? retryBackoffMs : this.processIntervalMs);
      }
    }
  }
}
