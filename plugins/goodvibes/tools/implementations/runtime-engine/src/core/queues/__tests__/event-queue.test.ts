import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventQueue, DEFAULT_MAX_DEPTH, DEFAULT_DEDUP_TTL_MS } from '../event-queue.js';
import { QueueError } from '../../../shared/errors.js';
import type { RuntimeEvent } from '../../types.js';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ─── Factories ────────────────────────────────────────────────────────────────

let _seq = 0;
function makeEvent(overrides: Partial<Omit<RuntimeEvent, 'source' | 'type' | 'payload'>> & { source?: unknown; type?: string; payload?: unknown } = {}): RuntimeEvent {
  return {
    id: `evt-${++_seq}`,
    source: { kind: 'external', origin: 'test' },
    type: 'session:started' as RuntimeEvent['type'],
    payload: {} as RuntimeEvent['payload'],
    timestamp: Date.now(),
    priority: 10,
    ...overrides,
  } as RuntimeEvent;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('EventQueue', () => {
  beforeEach(() => {
    _seq = 0;
    vi.clearAllMocks();
  });

  // ─── Exports ──────────────────────────────────────────────────────────────

  describe('module exports', () => {
    it('exports DEFAULT_MAX_DEPTH as 1000', () => {
      expect(DEFAULT_MAX_DEPTH).toBe(1000);
    });

    it('exports DEFAULT_DEDUP_TTL_MS as 60000', () => {
      expect(DEFAULT_DEDUP_TTL_MS).toBe(60_000);
    });
  });

  // ─── Construction ─────────────────────────────────────────────────────────

  describe('construction', () => {
    it('creates an empty queue', () => {
      const q = new EventQueue();
      expect(q.depth()).toBe(0);
      expect(q.peek()).toBeNull();
    });

    it('accepts custom max_depth and dedup_ttl_ms options', () => {
      const q = new EventQueue({ max_depth: 5, dedup_ttl_ms: 1000 });
      // Fill to max and verify backpressure
      for (let i = 0; i < 5; i++) q.enqueue(makeEvent());
      expect(() => q.enqueue(makeEvent())).toThrow(QueueError);
    });

    it('uses default max_depth when not specified', () => {
      const q = new EventQueue();
      // Enqueue many without throwing
      for (let i = 0; i < 100; i++) q.enqueue(makeEvent());
      expect(q.depth()).toBe(100);
    });
  });

  // ─── enqueue ──────────────────────────────────────────────────────────────

  describe('enqueue', () => {
    it('increases depth by 1', () => {
      const q = new EventQueue();
      q.enqueue(makeEvent());
      expect(q.depth()).toBe(1);
    });

    it('throws QueueError when max_depth is reached', () => {
      const q = new EventQueue({ max_depth: 2 });
      q.enqueue(makeEvent());
      q.enqueue(makeEvent());
      expect(() => q.enqueue(makeEvent())).toThrow(QueueError);
    });

    it('QueueError message contains depth and max info', () => {
      const q = new EventQueue({ max_depth: 1 });
      q.enqueue(makeEvent());
      try {
        q.enqueue(makeEvent());
        expect.fail('Expected QueueError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(QueueError);
        expect((err as QueueError).message).toMatch(/backpressure/);
      }
    });

    it('drops a duplicate event (same ID within TTL) without incrementing depth', () => {
      const q = new EventQueue({ dedup_ttl_ms: 60_000 });
      const event = makeEvent({ id: 'dup-1' });
      q.enqueue(event);
      q.enqueue(event); // duplicate
      expect(q.depth()).toBe(1);
    });

    it('does not drop event with a different ID', () => {
      const q = new EventQueue();
      q.enqueue(makeEvent({ id: 'a' }));
      q.enqueue(makeEvent({ id: 'b' }));
      expect(q.depth()).toBe(2);
    });
  });

  // ─── requeue ──────────────────────────────────────────────────────────────

  describe('requeue', () => {
    it('adds events bypassing dedup check', () => {
      const q = new EventQueue({ dedup_ttl_ms: 60_000 });
      const event = makeEvent({ id: 'requeue-bypass' });
      q.enqueue(event); // records in dedup cache
      q.drain();        // clear queue but dedup cache retains the ID
      // requeue should bypass dedup and add it again
      q.requeue([event]);
      expect(q.depth()).toBe(1);
    });

    it('increases depth for each requeueed event', () => {
      const q = new EventQueue();
      q.requeue([makeEvent(), makeEvent(), makeEvent()]);
      expect(q.depth()).toBe(3);
    });

    it('throws QueueError when max_depth is reached during requeue', () => {
      const q = new EventQueue({ max_depth: 2 });
      q.requeue([makeEvent(), makeEvent()]);
      expect(() => q.requeue([makeEvent()])).toThrow(QueueError);
    });

    it('is a no-op for empty array', () => {
      const q = new EventQueue();
      q.requeue([]);
      expect(q.depth()).toBe(0);
    });
  });

  // ─── drain ────────────────────────────────────────────────────────────────

  describe('drain', () => {
    it('returns empty array when queue is empty', () => {
      const q = new EventQueue();
      expect(q.drain()).toEqual([]);
    });

    it('returns all events and clears the queue', () => {
      const q = new EventQueue();
      const e1 = makeEvent();
      const e2 = makeEvent();
      q.enqueue(e1);
      q.enqueue(e2);
      const drained = q.drain();
      expect(drained).toHaveLength(2);
      expect(q.depth()).toBe(0);
    });

    it('returns events in priority order (higher priority first)', () => {
      const q = new EventQueue();
      const low = makeEvent({ id: 'low', priority: 1 });
      const high = makeEvent({ id: 'high', priority: 100 });
      const mid = makeEvent({ id: 'mid', priority: 50 });
      q.enqueue(low);
      q.enqueue(high);
      q.enqueue(mid);
      const drained = q.drain();
      expect(drained.map((e) => e.id)).toEqual(['high', 'mid', 'low']);
    });

    it('returns events with equal priority in FIFO (insertion) order', () => {
      const q = new EventQueue();
      const e1 = makeEvent({ id: 'first', priority: 10 });
      const e2 = makeEvent({ id: 'second', priority: 10 });
      const e3 = makeEvent({ id: 'third', priority: 10 });
      q.enqueue(e1);
      q.enqueue(e2);
      q.enqueue(e3);
      const drained = q.drain();
      expect(drained.map((e) => e.id)).toEqual(['first', 'second', 'third']);
    });

    it('skips lazily-cancelled entries', () => {
      const q = new EventQueue();
      const e1 = makeEvent({ id: 'keep' });
      const e2 = makeEvent({ id: 'cancel-me' });
      q.enqueue(e1);
      q.enqueue(e2);
      q.cancel('cancel-me');
      const drained = q.drain();
      expect(drained.map((e) => e.id)).toEqual(['keep']);
    });

    it('returns empty array after all events are cancelled', () => {
      const q = new EventQueue();
      const e = makeEvent({ id: 'single' });
      q.enqueue(e);
      q.cancel('single');
      expect(q.drain()).toEqual([]);
    });

    it('resets depth to 0 after drain', () => {
      const q = new EventQueue();
      q.enqueue(makeEvent());
      q.drain();
      expect(q.depth()).toBe(0);
    });
  });

  // ─── peek ─────────────────────────────────────────────────────────────────

  describe('peek', () => {
    it('returns null on empty queue', () => {
      const q = new EventQueue();
      expect(q.peek()).toBeNull();
    });

    it('returns the highest-priority event without removing it', () => {
      const q = new EventQueue();
      const low = makeEvent({ id: 'low', priority: 1 });
      const high = makeEvent({ id: 'high', priority: 99 });
      q.enqueue(low);
      q.enqueue(high);
      const peeked = q.peek();
      expect(peeked?.id).toBe('high');
      expect(q.depth()).toBe(2); // not removed
    });

    it('skips lazily-cancelled entries at the top', () => {
      const q = new EventQueue();
      const cancelled = makeEvent({ id: 'cancelled', priority: 100 });
      const live = makeEvent({ id: 'live', priority: 1 });
      q.enqueue(cancelled);
      q.enqueue(live);
      q.cancel('cancelled');
      const peeked = q.peek();
      expect(peeked?.id).toBe('live');
    });

    it('returns null when all entries are cancelled', () => {
      const q = new EventQueue();
      const e = makeEvent({ id: 'only' });
      q.enqueue(e);
      q.cancel('only');
      expect(q.peek()).toBeNull();
    });

    it('is idempotent (multiple peeks return the same event)', () => {
      const q = new EventQueue();
      q.enqueue(makeEvent({ id: 'stable' }));
      expect(q.peek()?.id).toBe('stable');
      expect(q.peek()?.id).toBe('stable');
    });
  });

  // ─── depth ────────────────────────────────────────────────────────────────

  describe('depth', () => {
    it('returns 0 initially', () => {
      expect(new EventQueue().depth()).toBe(0);
    });

    it('increases with enqueue and decreases with cancel', () => {
      const q = new EventQueue();
      q.enqueue(makeEvent({ id: 'x' }));
      q.enqueue(makeEvent({ id: 'y' }));
      expect(q.depth()).toBe(2);
      q.cancel('x');
      expect(q.depth()).toBe(1);
    });

    it('decreases with cancelByRef', () => {
      const q = new EventQueue();
      q.enqueue(makeEvent({ id: 'r1', context: { ref: 'batch-1' } }));
      q.enqueue(makeEvent({ id: 'r2', context: { ref: 'batch-1' } }));
      q.enqueue(makeEvent({ id: 'r3', context: { ref: 'batch-2' } }));
      q.cancelByRef('batch-1');
      expect(q.depth()).toBe(1);
    });
  });

  // ─── deduplicate ──────────────────────────────────────────────────────────

  describe('deduplicate', () => {
    it('returns false for an event never seen before', () => {
      const q = new EventQueue();
      expect(q.deduplicate(makeEvent({ id: 'novel' }))).toBe(false);
    });

    it('returns true for the same event seen a second time within TTL', () => {
      const q = new EventQueue({ dedup_ttl_ms: 60_000 });
      const event = makeEvent({ id: 'seen-twice' });
      q.deduplicate(event);
      expect(q.deduplicate(event)).toBe(true);
    });

    it('returns false for an event after its TTL has expired', () => {
      vi.useFakeTimers();
      const q = new EventQueue({ dedup_ttl_ms: 100 });
      const event = makeEvent({ id: 'expired' });
      q.deduplicate(event);
      vi.advanceTimersByTime(101); // TTL expires
      expect(q.deduplicate(event)).toBe(false);
      vi.useRealTimers();
    });

    it('records the event in dedup cache (first call returns false, second returns true)', () => {
      const q = new EventQueue({ dedup_ttl_ms: 60_000 });
      const event = makeEvent({ id: 'cache-test' });
      expect(q.deduplicate(event)).toBe(false); // first seen — not duplicate
      expect(q.deduplicate(event)).toBe(true);  // second seen — duplicate
    });
  });

  // ─── cancel ───────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('returns true when the event is found and cancelled', () => {
      const q = new EventQueue();
      q.enqueue(makeEvent({ id: 'to-cancel' }));
      expect(q.cancel('to-cancel')).toBe(true);
    });

    it('returns false when the event ID is not in the queue', () => {
      const q = new EventQueue();
      expect(q.cancel('ghost-id')).toBe(false);
    });

    it('decrements depth by 1 when successful', () => {
      const q = new EventQueue();
      q.enqueue(makeEvent({ id: 'c1' }));
      q.enqueue(makeEvent({ id: 'c2' }));
      q.cancel('c1');
      expect(q.depth()).toBe(1);
    });

    it('returns false and does not double-decrement for already-cancelled event', () => {
      const q = new EventQueue();
      q.enqueue(makeEvent({ id: 'once' }));
      q.cancel('once');
      expect(q.cancel('once')).toBe(false);
      expect(q.depth()).toBe(0);
    });

    it('cancelled event does not appear in drain result', () => {
      const q = new EventQueue();
      q.enqueue(makeEvent({ id: 'visible' }));
      q.enqueue(makeEvent({ id: 'hidden' }));
      q.cancel('hidden');
      const result = q.drain();
      expect(result.map((e) => e.id)).not.toContain('hidden');
    });
  });

  // ─── cancelByRef ──────────────────────────────────────────────────────────

  describe('cancelByRef', () => {
    it('returns the count of cancelled events', () => {
      const q = new EventQueue();
      q.enqueue(makeEvent({ id: 'a', context: { ref: 'session-1' } }));
      q.enqueue(makeEvent({ id: 'b', context: { ref: 'session-1' } }));
      q.enqueue(makeEvent({ id: 'c', context: { ref: 'session-2' } }));
      expect(q.cancelByRef('session-1')).toBe(2);
    });

    it('returns 0 when no events match the ref', () => {
      const q = new EventQueue();
      q.enqueue(makeEvent({ id: 'd', context: { ref: 'other' } }));
      expect(q.cancelByRef('no-match')).toBe(0);
    });

    it('returns 0 when queue is empty', () => {
      const q = new EventQueue();
      expect(q.cancelByRef('any')).toBe(0);
    });

    it('does not cancel events without a context.ref', () => {
      const q = new EventQueue();
      q.enqueue(makeEvent({ id: 'no-context' })); // no context
      expect(q.cancelByRef('anything')).toBe(0);
      expect(q.depth()).toBe(1);
    });

    it('does not cancel events with a different ref', () => {
      const q = new EventQueue();
      q.enqueue(makeEvent({ id: 'keep', context: { ref: 'keep-ref' } }));
      q.cancelByRef('other-ref');
      expect(q.depth()).toBe(1);
    });

    it('cancelled-by-ref events do not appear in drain', () => {
      const q = new EventQueue();
      q.enqueue(makeEvent({ id: 'gone', context: { ref: 'batch' } }));
      q.enqueue(makeEvent({ id: 'live' }));
      q.cancelByRef('batch');
      const drained = q.drain();
      expect(drained.map((e) => e.id)).toEqual(['live']);
    });

    it('does not double-cancel already-cancelled events', () => {
      const q = new EventQueue();
      q.enqueue(makeEvent({ id: 'x', context: { ref: 'r' } }));
      q.cancelByRef('r'); // first cancel
      const count = q.cancelByRef('r'); // second cancel on same ref
      expect(count).toBe(0); // already cancelled
    });
  });

  // ─── priority + FIFO integration ──────────────────────────────────────────

  describe('priority + FIFO ordering integration', () => {
    it('respects priority even when events are enqueued in reverse priority order', () => {
      const q = new EventQueue();
      q.enqueue(makeEvent({ id: 'p1', priority: 1 }));
      q.enqueue(makeEvent({ id: 'p100', priority: 100 }));
      q.enqueue(makeEvent({ id: 'p50', priority: 50 }));
      const ids = q.drain().map((e) => e.id);
      expect(ids).toEqual(['p100', 'p50', 'p1']);
    });

    it('mixed priority + FIFO: higher priority events drain first, FIFO within same priority', () => {
      const q = new EventQueue();
      q.enqueue(makeEvent({ id: 'lo1', priority: 1 }));
      q.enqueue(makeEvent({ id: 'hi1', priority: 10 }));
      q.enqueue(makeEvent({ id: 'lo2', priority: 1 }));
      q.enqueue(makeEvent({ id: 'hi2', priority: 10 }));
      const ids = q.drain().map((e) => e.id);
      expect(ids).toEqual(['hi1', 'hi2', 'lo1', 'lo2']);
    });
  });

  // ─── backpressure with requeue ────────────────────────────────────────────

  describe('backpressure: requeue QueueError', () => {
    it('QueueError message mentions requeue on backpressure during requeue', () => {
      const q = new EventQueue({ max_depth: 1 });
      q.requeue([makeEvent()]);
      try {
        q.requeue([makeEvent()]);
        expect.fail('Expected QueueError');
      } catch (err) {
        expect(err).toBeInstanceOf(QueueError);
        expect((err as QueueError).message).toMatch(/requeue/);
      }
    });
  });

  // ─── QueueError is instanceof check ───────────────────────────────────────

  describe('QueueError', () => {
    it('is an instance of Error', () => {
      const q = new EventQueue({ max_depth: 0 });
      try {
        q.enqueue(makeEvent());
        expect.fail('Expected QueueError');
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(QueueError);
        expect((err as QueueError).code).toBe('QUEUE_ERROR');
      }
    });
  });
});
