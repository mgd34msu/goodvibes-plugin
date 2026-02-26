/**
 * Priority Event Queue — Layer 1
 *
 * A priority queue with causal ordering, deduplication, and cancellation.
 *
 * Ordering rules (applied in this precedence):
 *  1. Priority: higher priority events drain first.
 *  2. Causal: events with the same workflow_id preserve insertion order.
 *  3. Insertion: events with equal priority and no workflow ordering drain FIFO.
 *
 * Implementation: binary min-heap ordered by (priority DESC, seq ASC).
 *  - enqueue: O(log n)
 *  - drain: O(n log n) total (n pops, each O(log n))
 *  - peek: O(1)
 *  - cancel/cancelByRef: O(n) — mark-and-filter
 *
 * Deduplication: events with duplicate IDs within the TTL window are rejected.
 * Cancellation: individual events may be cancelled by ID; bulk by context.ref.
 * Backpressure: enqueueing beyond max_depth emits a warning and throws.
 */

import { createLogger } from '../shared/logger.js';
import type { RuntimeEvent, EventQueueInterface } from './types.js';

const logger = createLogger('core:event-queue');

export interface EventQueueOptions {
  /** Maximum pending events before backpressure kicks in. Default: 1000. */
  max_depth?: number;
  /** How long to remember seen event IDs for deduplication, in ms. Default: 60_000. */
  dedup_ttl_ms?: number;
}

/** Internal entry stored in the heap. */
interface QueueEntry {
  event: RuntimeEvent;
  /** Insertion sequence number — used for stable FIFO within same priority. */
  seq: number;
  /** Whether this entry has been lazily cancelled. */
  cancelled: boolean;
}

/** Dedup record: the timestamp the event was first seen. */
interface DedupRecord {
  seen_at: number;
}

/**
 * Priority queue with dedup, causal ordering, and cancellation.
 * Uses a binary min-heap ordered by composite key:
 *   primary: priority descending (higher = "less than" in heap terms)
 *   secondary: seq ascending (FIFO within same priority)
 * Implements {@link EventQueueInterface}.
 */
export class EventQueue implements EventQueueInterface {
  private readonly maxDepth: number;
  private readonly dedupTtlMs: number;

  /** Binary min-heap of queue entries. */
  private heap: QueueEntry[] = [];
  /** Logical size (excludes lazily-cancelled entries). */
  private _size = 0;
  /** Map from event_id → seen_at timestamp for deduplication. */
  private readonly dedupCache = new Map<string, DedupRecord>();
  /** Monotonically increasing insertion counter for stable FIFO. */
  private seq = 0;
  /** Timestamp of the last dedup-cache cleanup. */
  private lastDedupClean = Date.now();
  /** How often to sweep the dedup cache (ms). */
  private static readonly DEDUP_CLEAN_INTERVAL_MS = 30_000;

  constructor(options: EventQueueOptions = {}) {
    this.maxDepth = options.max_depth ?? 1000;
    this.dedupTtlMs = options.dedup_ttl_ms ?? 60_000;
  }

  /**
   * Enqueue an event.
   * Performs dedup check and backpressure check before inserting.
   * @throws {Error} if max_depth is exceeded.
   */
  enqueue(event: RuntimeEvent): void {
    // Dedup check
    if (this.deduplicate(event)) {
      logger.debug('Dropped duplicate event', { id: event.id, type: event.type });
      return;
    }

    // Backpressure (count only non-cancelled entries)
    if (this._size >= this.maxDepth) {
      const msg = `EventQueue backpressure: depth ${this._size} >= max ${this.maxDepth}`;
      logger.warn(msg, { type: event.type, id: event.id });
      throw new Error(msg);
    }

    const entry: QueueEntry = { event, seq: this.seq++, cancelled: false };
    this.heap.push(entry);
    this._size++;
    this.siftUp(this.heap.length - 1);

    // Periodically sweep the dedup cache
    this.maybeCleanDedup();
  }

  /**
   * Re-enqueue events bypassing deduplication.
   * Used when events are cut from an oversized batch and must be returned
   * to the queue — they were already recorded in the dedup cache during
   * their original enqueue and would be silently dropped by enqueue().
   *
   * Does NOT bypass the backpressure limit.
   */
  requeue(events: RuntimeEvent[]): void {
    for (const event of events) {
      if (this._size >= this.maxDepth) {
        const msg = `EventQueue backpressure on requeue: depth ${this._size} >= max ${this.maxDepth}`;
        logger.warn(msg, { type: event.type, id: event.id });
        throw new Error(msg);
      }
      const entry: QueueEntry = { event, seq: this.seq++, cancelled: false };
      this.heap.push(entry);
      this._size++;
      this.siftUp(this.heap.length - 1);
    }
  }

  /**
   * Drain all pending events in processing order.
   * Returns all non-cancelled events and clears the heap.
   */
  drain(): RuntimeEvent[] {
    const result: RuntimeEvent[] = [];
    while (this.heap.length > 0) {
      const entry = this.heapPop();
      if (entry && !entry.cancelled) {
        result.push(entry.event);
      }
    }
    // Safety reset — heapPop decrements per entry but we clear to guarantee clean state
    this._size = 0;
    return result;
  }

  /**
   * Peek at the next non-cancelled event without removing it.
   */
  peek(): RuntimeEvent | null {
    // Skip lazily-cancelled entries at the top
    while (this.heap.length > 0 && this.heap[0]!.cancelled) {
      this.heapPop();
    }
    return this.heap[0]?.event ?? null;
  }

  /**
   * Current number of pending (non-cancelled) events.
   */
  depth(): number {
    return this._size;
  }

  /**
   * Check whether an event is a duplicate.
   * If not seen before, records the event ID and returns false.
   * If already seen within the TTL window, returns true.
   */
  deduplicate(event: RuntimeEvent): boolean {
    const now = Date.now();
    const record = this.dedupCache.get(event.id);
    if (record !== undefined) {
      const age = now - record.seen_at;
      if (age <= this.dedupTtlMs) {
        return true; // duplicate within TTL
      }
      // TTL expired — treat as new
    }
    this.dedupCache.set(event.id, { seen_at: now });
    return false;
  }

  /**
   * Remove a single pending event by ID (lazy deletion).
   * @returns true if the event was found and marked cancelled.
   */
  cancel(event_id: string): boolean {
    for (const entry of this.heap) {
      if (entry.event.id === event_id && !entry.cancelled) {
        entry.cancelled = true;
        this._size--;
        logger.debug('Cancelled event', { event_id });
        return true;
      }
    }
    return false;
  }

  /**
   * Remove all pending events whose context.ref matches the given string (lazy deletion).
   * @returns The number of events cancelled.
   */
  cancelByRef(ref: string): number {
    let count = 0;
    for (const entry of this.heap) {
      if (!entry.cancelled && entry.event.context?.ref === ref) {
        entry.cancelled = true;
        this._size--;
        count++;
      }
    }
    if (count > 0) {
      logger.debug('Cancelled events by ref', { ref, count });
    }
    return count;
  }

  // ─── Heap Helpers ─────────────────────────────────────────────────────────

  // Non-null assertions in heap operations are safe: indices are always bounds-checked

  /**
   * Returns true if entry `a` should be higher in priority than entry `b`.
   * Higher priority number = drain first. For equal priority: lower seq = drain first.
   */
  private higher(a: QueueEntry, b: QueueEntry): boolean {
    if (a.event.priority !== b.event.priority) {
      return a.event.priority > b.event.priority;
    }
    return a.seq < b.seq;
  }

  private parent(i: number): number { return (i - 1) >> 1; }
  private left(i: number): number { return 2 * i + 1; }
  private right(i: number): number { return 2 * i + 2; }

  private swap(i: number, j: number): void {
    const tmp = this.heap[i]!;
    this.heap[i] = this.heap[j]!;
    this.heap[j] = tmp;
  }

  /** Move entry at index `i` up until the heap property is restored. */
  private siftUp(i: number): void {
    while (i > 0) {
      const p = this.parent(i);
      if (this.higher(this.heap[i]!, this.heap[p]!)) {
        this.swap(i, p);
        i = p;
      } else {
        break;
      }
    }
  }

  /** Move entry at index `i` down until the heap property is restored. */
  private siftDown(i: number): void {
    const n = this.heap.length;
    for (;;) {
      let best = i;
      const l = this.left(i);
      const r = this.right(i);
      if (l < n && this.higher(this.heap[l]!, this.heap[best]!)) best = l;
      if (r < n && this.higher(this.heap[r]!, this.heap[best]!)) best = r;
      if (best === i) break;
      this.swap(i, best);
      i = best;
    }
  }

  /** Remove and return the root (highest-priority) entry from the heap. */
  private heapPop(): QueueEntry | undefined {
    if (this.heap.length === 0) return undefined;
    const root = this.heap[0]!;
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.siftDown(0);
    }
    if (!root.cancelled) this._size--;
    return root;
  }

  // ─── Dedup Helpers ────────────────────────────────────────────────────────

  /**
   * Sweep expired dedup-cache entries every DEDUP_CLEAN_INTERVAL_MS.
   */
  private maybeCleanDedup(): void {
    const now = Date.now();
    if (now - this.lastDedupClean < EventQueue.DEDUP_CLEAN_INTERVAL_MS) return;
    this.lastDedupClean = now;
    const cutoff = now - this.dedupTtlMs;
    for (const [id, record] of this.dedupCache) {
      if (record.seen_at < cutoff) {
        this.dedupCache.delete(id);
      }
    }
  }
}
