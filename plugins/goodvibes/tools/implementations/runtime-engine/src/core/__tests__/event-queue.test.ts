/**
 * event-queue.test.ts — Priority Event Queue
 *
 * Tests: priority ordering, binary heap correctness, dedup TTL,
 * cancel by ID, cancel by ref, requeue, backpressure, empty behavior,
 * size/peek/clear operations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventQueue } from '../event-queue.js';
import type { RuntimeEvent } from '../types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _seq = 0;
function makeEvent(overrides: Partial<RuntimeEvent> & Pick<RuntimeEvent, 'id'>): RuntimeEvent {
  return {
    source: 'internal',
    type: 'test:event',
    payload: null,
    timestamp: Date.now(),
    priority: 0,
    ...overrides,
  };
}

function evt(id: string, priority = 0, ref?: string): RuntimeEvent {
  return makeEvent({
    id,
    priority,
    context: ref ? { ref } : undefined,
  });
}

// ─── Empty Queue ──────────────────────────────────────────────────────────────

describe('EventQueue — empty queue behavior', () => {
  let q: EventQueue;

  beforeEach(() => {
    q = new EventQueue();
  });

  it('peek returns null when empty', () => {
    expect(q.peek()).toBeNull();
  });

  it('drain returns empty array when empty', () => {
    expect(q.drain()).toEqual([]);
  });

  it('depth returns 0 when empty', () => {
    expect(q.depth()).toBe(0);
  });

  it('cancel returns false when queue is empty', () => {
    expect(q.cancel('nonexistent')).toBe(false);
  });

  it('cancelByRef returns 0 when queue is empty', () => {
    expect(q.cancelByRef('ref1')).toBe(0);
  });

  it('drain after drain returns empty array', () => {
    q.enqueue(evt('e1', 5));
    q.drain();
    expect(q.drain()).toEqual([]);
  });
});

// ─── Enqueue / Dequeue ────────────────────────────────────────────────────────

describe('EventQueue — enqueue and drain', () => {
  let q: EventQueue;

  beforeEach(() => {
    q = new EventQueue();
  });

  it('enqueues a single event and drains it', () => {
    const e = evt('e1');
    q.enqueue(e);
    expect(q.drain()).toEqual([e]);
  });

  it('depth increases after enqueue', () => {
    q.enqueue(evt('e1'));
    q.enqueue(evt('e2'));
    expect(q.depth()).toBe(2);
  });

  it('depth decreases to 0 after drain', () => {
    q.enqueue(evt('e1'));
    q.drain();
    expect(q.depth()).toBe(0);
  });
});

// ─── Priority Ordering ────────────────────────────────────────────────────────

describe('EventQueue — priority ordering', () => {
  let q: EventQueue;

  beforeEach(() => {
    q = new EventQueue();
  });

  it('drains higher priority events first', () => {
    q.enqueue(evt('low', 1));
    q.enqueue(evt('high', 10));
    q.enqueue(evt('med', 5));
    const ids = q.drain().map((e) => e.id);
    expect(ids).toEqual(['high', 'med', 'low']);
  });

  it('preserves FIFO order for equal priority events', () => {
    q.enqueue(evt('first', 5));
    q.enqueue(evt('second', 5));
    q.enqueue(evt('third', 5));
    const ids = q.drain().map((e) => e.id);
    expect(ids).toEqual(['first', 'second', 'third']);
  });

  it('interleaves priorities correctly', () => {
    q.enqueue(evt('a', 1));
    q.enqueue(evt('b', 3));
    q.enqueue(evt('c', 2));
    q.enqueue(evt('d', 3));
    q.enqueue(evt('e', 1));
    const ids = q.drain().map((e) => e.id);
    // Priority 3 first (b then d: FIFO), then 2 (c), then 1 (a then e: FIFO)
    expect(ids).toEqual(['b', 'd', 'c', 'a', 'e']);
  });

  it('handles negative priorities', () => {
    q.enqueue(evt('neg', -5));
    q.enqueue(evt('zero', 0));
    q.enqueue(evt('pos', 5));
    const ids = q.drain().map((e) => e.id);
    expect(ids).toEqual(['pos', 'zero', 'neg']);
  });

  it('peek returns the highest-priority event without removing it', () => {
    q.enqueue(evt('low', 1));
    q.enqueue(evt('high', 10));
    expect(q.peek()?.id).toBe('high');
    expect(q.depth()).toBe(2);
  });
});

// ─── Heap Correctness (siftUp/siftDown) ───────────────────────────────────────

describe('EventQueue — heap correctness', () => {
  it('maintains heap invariant through many enqueues', () => {
    const q = new EventQueue();
    const priorities = [4, 7, 1, 9, 3, 8, 2, 6, 5, 10];
    priorities.forEach((p, i) => q.enqueue(evt(`e${i}`, p)));

    const drained = q.drain().map((e) => e.priority);
    // Should be sorted descending
    const sorted = [...priorities].sort((a, b) => b - a);
    expect(drained).toEqual(sorted);
  });

  it('handles a single-element heap correctly', () => {
    const q = new EventQueue();
    q.enqueue(evt('only', 5));
    expect(q.peek()?.id).toBe('only');
    expect(q.drain().length).toBe(1);
  });

  it('handles two-element heap with correct ordering', () => {
    const q = new EventQueue();
    q.enqueue(evt('second', 1));
    q.enqueue(evt('first', 10));
    const ids = q.drain().map((e) => e.id);
    expect(ids[0]).toBe('first');
    expect(ids[1]).toBe('second');
  });
});

// ─── Deduplication ────────────────────────────────────────────────────────────

describe('EventQueue — deduplication', () => {
  it('rejects duplicate events within TTL window', () => {
    const q = new EventQueue({ dedup_ttl_ms: 60_000 });
    const e = evt('dup_id', 5);
    q.enqueue(e);
    q.enqueue(e); // duplicate
    expect(q.depth()).toBe(1);
    expect(q.drain()).toHaveLength(1);
  });

  it('accepts same ID after TTL expires', () => {
    vi.useFakeTimers();
    const q = new EventQueue({ dedup_ttl_ms: 1000 });
    const e = evt('ttl_id', 5);
    q.enqueue(e);
    expect(q.depth()).toBe(1);
    // Drain to clear queue
    q.drain();

    // Advance time past TTL
    vi.advanceTimersByTime(1001);

    // Should be accepted again
    const e2 = evt('ttl_id', 5);
    expect(q.deduplicate(e2)).toBe(false); // not a duplicate
    vi.useRealTimers();
  });

  it('deduplicate returns true for duplicate within TTL', () => {
    const q = new EventQueue({ dedup_ttl_ms: 60_000 });
    const e = evt('check_id', 0);
    q.enqueue(e); // records in dedup cache
    expect(q.deduplicate(e)).toBe(true);
  });

  it('deduplicate returns false for new event and records it', () => {
    const q = new EventQueue();
    const e = evt('new_id', 0);
    expect(q.deduplicate(e)).toBe(false);
    // Now it's recorded, second call should return true
    expect(q.deduplicate(e)).toBe(true);
  });

  it('different event IDs are not treated as duplicates', () => {
    const q = new EventQueue();
    q.enqueue(evt('id_a', 5));
    q.enqueue(evt('id_b', 5));
    expect(q.depth()).toBe(2);
  });
});

// ─── Cancel by ID ─────────────────────────────────────────────────────────────

describe('EventQueue — cancel by ID', () => {
  let q: EventQueue;

  beforeEach(() => {
    q = new EventQueue();
  });

  it('cancels an existing event by ID and returns true', () => {
    q.enqueue(evt('cancel_me', 5));
    expect(q.cancel('cancel_me')).toBe(true);
  });

  it('decrements depth after cancel', () => {
    q.enqueue(evt('e1'));
    q.enqueue(evt('e2'));
    q.cancel('e1');
    expect(q.depth()).toBe(1);
  });

  it('cancelled event is not returned in drain', () => {
    q.enqueue(evt('keep', 5));
    q.enqueue(evt('gone', 5));
    q.cancel('gone');
    const result = q.drain();
    expect(result.map((e) => e.id)).toEqual(['keep']);
  });

  it('returns false for a non-existent event ID', () => {
    q.enqueue(evt('present'));
    expect(q.cancel('absent')).toBe(false);
  });

  it('returns false on second cancel of already-cancelled event', () => {
    q.enqueue(evt('e1'));
    expect(q.cancel('e1')).toBe(true);
    expect(q.cancel('e1')).toBe(false);
  });

  it('peek skips cancelled events at the top', () => {
    q.enqueue(evt('high', 10));
    q.enqueue(evt('low', 1));
    q.cancel('high');
    expect(q.peek()?.id).toBe('low');
  });

  it('depth remains 0 after cancelling all events then draining', () => {
    q.enqueue(evt('e1'));
    q.cancel('e1');
    expect(q.drain()).toEqual([]);
    expect(q.depth()).toBe(0);
  });
});

// ─── Cancel by Ref ────────────────────────────────────────────────────────────

describe('EventQueue — cancelByRef', () => {
  let q: EventQueue;

  beforeEach(() => {
    q = new EventQueue();
  });

  it('cancels all events with matching ref and returns count', () => {
    q.enqueue(evt('r1', 5, 'group_a'));
    q.enqueue(evt('r2', 5, 'group_a'));
    q.enqueue(evt('other', 5, 'group_b'));
    expect(q.cancelByRef('group_a')).toBe(2);
    expect(q.depth()).toBe(1);
  });

  it('cancelled-by-ref events are absent from drain', () => {
    q.enqueue(evt('keep', 5, 'keep_group'));
    q.enqueue(evt('gone1', 5, 'cancel_group'));
    q.enqueue(evt('gone2', 5, 'cancel_group'));
    q.cancelByRef('cancel_group');
    const result = q.drain();
    expect(result.map((e) => e.id)).toEqual(['keep']);
  });

  it('returns 0 when no events match the ref', () => {
    q.enqueue(evt('e1', 5, 'other_group'));
    expect(q.cancelByRef('missing_group')).toBe(0);
  });

  it('returns 0 when events have no ref', () => {
    q.enqueue(evt('no_ref', 5));
    expect(q.cancelByRef('any_group')).toBe(0);
  });

  it('does not cancel already-cancelled events in count', () => {
    q.enqueue(evt('e1', 5, 'grp'));
    q.cancel('e1'); // already cancelled
    expect(q.cancelByRef('grp')).toBe(0);
  });
});

// ─── Requeue ──────────────────────────────────────────────────────────────────

describe('EventQueue — requeue', () => {
  let q: EventQueue;

  beforeEach(() => {
    q = new EventQueue();
  });

  it('requeue adds events bypassing dedup check', () => {
    const e = evt('requeue_id', 5);
    q.enqueue(e); // marks in dedup cache
    q.drain(); // empty the queue but dedup cache still has the id

    // Normal enqueue would reject, requeue should succeed
    q.requeue([e]);
    expect(q.depth()).toBe(1);
    expect(q.drain()).toHaveLength(1);
  });

  it('requeue preserves priority ordering', () => {
    const e1 = evt('rq1', 1);
    const e2 = evt('rq2', 10);
    q.requeue([e1, e2]);
    const ids = q.drain().map((e) => e.id);
    expect(ids).toEqual(['rq2', 'rq1']);
  });

  it('requeue increases depth', () => {
    q.requeue([evt('rq1'), evt('rq2')]);
    expect(q.depth()).toBe(2);
  });

  it('requeue respects max_depth backpressure', () => {
    const q2 = new EventQueue({ max_depth: 2 });
    q2.enqueue(evt('e1'));
    q2.enqueue(evt('e2'));
    expect(() => q2.requeue([evt('overflow')])).toThrow(/backpressure/);
  });
});

// ─── Backpressure ─────────────────────────────────────────────────────────────

describe('EventQueue — backpressure', () => {
  it('throws when max_depth is exceeded on enqueue', () => {
    const q = new EventQueue({ max_depth: 3 });
    q.enqueue(evt('e1'));
    q.enqueue(evt('e2'));
    q.enqueue(evt('e3'));
    expect(() => q.enqueue(evt('e4'))).toThrow(/backpressure/);
  });

  it('depth stays at max_depth after backpressure throw', () => {
    const q = new EventQueue({ max_depth: 2 });
    q.enqueue(evt('e1'));
    q.enqueue(evt('e2'));
    try { q.enqueue(evt('e3')); } catch {}
    expect(q.depth()).toBe(2);
  });

  it('accepts events again after draining below limit', () => {
    const q = new EventQueue({ max_depth: 2 });
    q.enqueue(evt('e1'));
    q.enqueue(evt('e2'));
    q.drain();
    expect(() => q.enqueue(evt('e3'))).not.toThrow();
  });

  it('dedup check happens before backpressure check', () => {
    // A duplicate should be silently dropped, not count toward depth
    const q = new EventQueue({ max_depth: 1 });
    const e = evt('unique');
    q.enqueue(e); // fills the queue
    // Re-enqueuing the same event should NOT throw backpressure — it should be deduped first
    expect(() => q.enqueue(e)).not.toThrow();
    expect(q.depth()).toBe(1);
  });
});
