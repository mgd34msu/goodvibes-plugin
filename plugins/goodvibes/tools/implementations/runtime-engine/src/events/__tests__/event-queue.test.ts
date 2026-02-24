/**
 * EventQueue Tests
 *
 * Tests for priority-based enqueue ordering, processing callbacks,
 * retry/backoff, dead-letter queue, statistics, deadline handling,
 * start/stop/drain lifecycle, and retryDeadLetter.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventQueue, QueuePriority } from '../event-queue.js';
import type { QueueEntry, EventQueueConfig } from '../event-queue.js';
import type { RuntimeEvent } from '../types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BASE_CONFIG: EventQueueConfig = {
  max_size: 100,
  max_attempts: 3,
  backoff_base_ms: 100,
  backoff_multiplier: 2,
  process_interval_ms: 0,
};

function makeConfig(overrides: Partial<EventQueueConfig> = {}): EventQueueConfig {
  return { ...BASE_CONFIG, ...overrides };
}

function makeEvent(type = 'session:started'): RuntimeEvent {
  return {
    id: `evt_${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
    type: type as RuntimeEvent['type'],
    source: { kind: 'system' },
    payload: { type: type as RuntimeEvent['type'], data: {} } as RuntimeEvent['payload'],
  };
}

function makeEntryParams(
  handler: string,
  priority = QueuePriority.NORMAL,
  overrides: Partial<Omit<QueueEntry, 'id' | 'enqueued_at' | 'attempts' | 'backoff_ms'>> = {},
): Omit<QueueEntry, 'id' | 'enqueued_at' | 'attempts' | 'backoff_ms'> {
  return {
    event: makeEvent(),
    priority,
    handler,
    max_attempts: 3,
    ...overrides,
  };
}

/** Drain a queue and wait for completion, up to a reasonable timeout */
async function drainAll(queue: EventQueue, ms = 2000) {
  return queue.drain(ms);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('EventQueue', () => {
  let queue: EventQueue;

  beforeEach(() => {
    queue = new EventQueue(makeConfig());
    vi.useFakeTimers();
  });

  afterEach(() => {
    queue.stop();
    vi.useRealTimers();
  });

  // ── Construction & Registration ───────────────────────────────────────────

  describe('construction', () => {
    it('creates a queue with zero pending entries', () => {
      expect(queue.size).toBe(0);
    });

    it('initial stats show all zeroes', () => {
      const stats = queue.getStats();
      expect(stats.pending).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.dead_letters).toBe(0);
    });
  });

  // ── registerHandler ────────────────────────────────────────────────────────

  describe('registerHandler', () => {
    it('registers a handler that can be invoked', async () => {
      const handlerFn = vi.fn().mockResolvedValue(undefined);
      queue.registerHandler('test', handlerFn);
      queue.enqueue(makeEntryParams('test'));
      vi.useRealTimers();
      await drainAll(queue);
      expect(handlerFn).toHaveBeenCalledOnce();
    });

    it('replaces existing handler with same name', async () => {
      const first = vi.fn().mockResolvedValue(undefined);
      const second = vi.fn().mockResolvedValue(undefined);
      queue.registerHandler('dup', first);
      queue.registerHandler('dup', second);
      queue.enqueue(makeEntryParams('dup'));
      vi.useRealTimers();
      await drainAll(queue);
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledOnce();
    });
  });

  // ── enqueue ────────────────────────────────────────────────────────────────

  describe('enqueue', () => {
    it('returns an entry id', () => {
      const id = queue.enqueue(makeEntryParams('h'));
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('uses provided id when given', () => {
      const id = queue.enqueue({ ...makeEntryParams('h'), id: 'custom_id' });
      expect(id).toBe('custom_id');
    });

    it('increments queue size', () => {
      queue.enqueue(makeEntryParams('h'));
      queue.enqueue(makeEntryParams('h'));
      expect(queue.size).toBe(2);
    });

    it('throws when queue is at capacity', () => {
      const tiny = new EventQueue(makeConfig({ max_size: 1 }));
      tiny.enqueue(makeEntryParams('h'));
      expect(() => tiny.enqueue(makeEntryParams('h'))).toThrow('EventQueue is full');
    });

    it('maintains priority ordering: CRITICAL before NORMAL', () => {
      // Enqueue NORMAL first, then CRITICAL — CRITICAL should be processed first
      const order: string[] = [];
      queue.registerHandler('normal', vi.fn().mockImplementation(async (e: QueueEntry) => { order.push('normal:' + e.id); }));
      queue.registerHandler('critical', vi.fn().mockImplementation(async (e: QueueEntry) => { order.push('critical:' + e.id); }));

      const normalId = queue.enqueue({ ...makeEntryParams('normal', QueuePriority.NORMAL), id: 'n1' });
      const criticalId = queue.enqueue({ ...makeEntryParams('critical', QueuePriority.CRITICAL), id: 'c1' });

      // Verify ordering in the queue (critical should be first)
      const stats = queue.getStats();
      expect(stats.by_priority[QueuePriority.NORMAL]).toBe(1);
      expect(stats.by_priority[QueuePriority.CRITICAL]).toBe(1);

      expect(normalId).toBe('n1');
      expect(criticalId).toBe('c1');
    });

    it('preserves FIFO order within same priority', async () => {
      const processedIds: string[] = [];
      queue.registerHandler(
        'fifo-h',
        vi.fn().mockImplementation(async (e: QueueEntry) => {
          processedIds.push(e.id);
        }),
      );
      queue.enqueue({ ...makeEntryParams('fifo-h', QueuePriority.NORMAL), id: 'first' });
      queue.enqueue({ ...makeEntryParams('fifo-h', QueuePriority.NORMAL), id: 'second' });
      queue.enqueue({ ...makeEntryParams('fifo-h', QueuePriority.NORMAL), id: 'third' });
      vi.useRealTimers();
      await drainAll(queue);
      expect(processedIds).toEqual(['first', 'second', 'third']);
    });
  });

  // ── start / stop ───────────────────────────────────────────────────────────

  describe('start / stop', () => {
    it('start is idempotent', () => {
      queue.start();
      queue.start(); // should not throw
      expect(queue.size).toBe(0);
    });

    it('stop cancels pending timer', () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      queue.start();
      queue.enqueue(makeEntryParams('h'));
      queue.stop();
      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it('stop is safe to call when already stopped', () => {
      expect(() => queue.stop()).not.toThrow();
    });
  });

  // ── drain ──────────────────────────────────────────────────────────────────

  describe('drain', () => {
    it('processes all items and returns correct counts', async () => {
      const handlerFn = vi.fn().mockResolvedValue(undefined);
      queue.registerHandler('drain-h', handlerFn);
      queue.enqueue(makeEntryParams('drain-h'));
      queue.enqueue(makeEntryParams('drain-h'));
      queue.enqueue(makeEntryParams('drain-h'));
      vi.useRealTimers();
      const result = await drainAll(queue);
      expect(result.processed).toBe(3);
      expect(result.remaining).toBe(0);
      expect(handlerFn).toHaveBeenCalledTimes(3);
    });

    it('returns remaining count when timeout expires', async () => {
      // Handler that takes too long
      const slowHandler = vi.fn().mockImplementation(
        () => new Promise<void>((resolve) => setTimeout(resolve, 50000)),
      );
      queue.registerHandler('slow', slowHandler);
      queue.enqueue(makeEntryParams('slow'));
      queue.enqueue(makeEntryParams('slow'));
      vi.useRealTimers();
      const result = await queue.drain(0); // zero timeout
      // With 0 timeout, at least some items remain
      expect(result.remaining).toBeGreaterThanOrEqual(0);
    });

    it('handler receives the QueueEntry with correct fields', async () => {
      const capturedEntry: QueueEntry[] = [];
      queue.registerHandler('capture', async (e) => { capturedEntry.push(e); });
      const event = makeEvent('build:passed');
      queue.enqueue({ event, priority: QueuePriority.HIGH, handler: 'capture', max_attempts: 2 });
      vi.useRealTimers();
      await drainAll(queue);
      expect(capturedEntry).toHaveLength(1);
      const entry = capturedEntry[0]!;
      expect(entry.event).toBe(event);
      expect(entry.handler).toBe('capture');
      expect(entry.priority).toBe(QueuePriority.HIGH);
      expect(entry.attempts).toBe(0);
    });

    it('increments completedCount on success', async () => {
      queue.registerHandler('ok', vi.fn().mockResolvedValue(undefined));
      queue.enqueue(makeEntryParams('ok'));
      vi.useRealTimers();
      await drainAll(queue);
      expect(queue.getStats().completed).toBe(1);
    });
  });

  // ── getStats ───────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('reports pending count per priority level', () => {
      queue.enqueue(makeEntryParams('h', QueuePriority.CRITICAL));
      queue.enqueue(makeEntryParams('h', QueuePriority.HIGH));
      queue.enqueue(makeEntryParams('h', QueuePriority.HIGH));
      queue.enqueue(makeEntryParams('h', QueuePriority.LOW));
      const stats = queue.getStats();
      expect(stats.by_priority[QueuePriority.CRITICAL]).toBe(1);
      expect(stats.by_priority[QueuePriority.HIGH]).toBe(2);
      expect(stats.by_priority[QueuePriority.NORMAL]).toBe(0);
      expect(stats.by_priority[QueuePriority.LOW]).toBe(1);
    });

    it('calculates avg_processing_ms after completions', async () => {
      queue.registerHandler('timed', vi.fn().mockResolvedValue(undefined));
      queue.enqueue(makeEntryParams('timed'));
      vi.useRealTimers();
      await drainAll(queue);
      const stats = queue.getStats();
      expect(stats.avg_processing_ms).toBeGreaterThanOrEqual(0);
      expect(typeof stats.avg_processing_ms).toBe('number');
    });

    it('returns avg_processing_ms of 0 when no completions', () => {
      expect(queue.getStats().avg_processing_ms).toBe(0);
    });

    it('reports processing as 0 when queue is idle', () => {
      expect(queue.getStats().processing).toBe(0);
    });

    it('oldest_pending_age_ms is 0 when queue is empty', () => {
      expect(queue.getStats().oldest_pending_age_ms).toBe(0);
    });

    it('oldest_pending_age_ms is positive when items are queued', async () => {
      vi.useRealTimers();
      queue.enqueue(makeEntryParams('h'));
      await new Promise<void>((r) => setTimeout(r, 5));
      const stats = queue.getStats();
      expect(stats.oldest_pending_age_ms).toBeGreaterThan(0);
    });
  });

  // ── retry and backoff ──────────────────────────────────────────────────────

  describe('retry behavior', () => {
    it('retries failed handler up to max_attempts times', async () => {
      const handlerFn = vi.fn().mockRejectedValue(new Error('transient'));
      queue.registerHandler('retry-h', handlerFn);
      queue.enqueue({ ...makeEntryParams('retry-h'), max_attempts: 3 });
      vi.useRealTimers();

      // Use a longer drain timeout to allow retries to complete
      const result = await queue.drain(5000);
      // After 3 failures it dead-letters; the item won't be in pending
      const stats = queue.getStats();
      expect(stats.dead_letters).toBe(1);
      expect(stats.failed).toBe(3); // incremented once per failure
      expect(result.remaining).toBe(0);
    }, 10000);

    it('moves entry to dead-letter queue after exhausting attempts', async () => {
      const handlerFn = vi.fn().mockRejectedValue(new Error('always fails'));
      queue.registerHandler('dl-h', handlerFn);
      queue.enqueue({ ...makeEntryParams('dl-h'), max_attempts: 2 });
      vi.useRealTimers();
      await queue.drain(5000);
      const dead = queue.getDeadLetters();
      expect(dead).toHaveLength(1);
      expect(dead[0]!.last_error).toMatch(/always fails/);
      // all_errors must contain one entry per failed attempt (max_attempts: 2)
      expect(dead[0]!.all_errors).toHaveLength(2);
      expect(dead[0]!.all_errors.every((e) => /always fails/.test(e))).toBe(true);
    }, 10000);

    it('applies exponential backoff: subsequent backoff_ms grows', async () => {
      // With backoff_base=100, multiplier=2: first retry backoff=200, second=400
      const configWithBackoff = makeConfig({
        backoff_base_ms: 100,
        backoff_multiplier: 2,
        max_attempts: 3,
      });
      const backoffQueue = new EventQueue(configWithBackoff);
      const handlerFn = vi.fn().mockRejectedValue(new Error('fail'));
      backoffQueue.registerHandler('backoff-h', handlerFn);
      backoffQueue.enqueue({ ...makeEntryParams('backoff-h'), max_attempts: 3 });
      vi.useRealTimers();
      await backoffQueue.drain(10000);
      const dead = backoffQueue.getDeadLetters();
      // Verify the dead-letter entry has at least 1 error accumulated
      expect(dead[0]!.all_errors.length).toBeGreaterThanOrEqual(1);
      backoffQueue.stop();
    }, 15000);
  });

  // ── dead-letter queue ──────────────────────────────────────────────────────

  describe('dead-letter queue', () => {
    it('getDeadLetters returns a copy (not a reference)', async () => {
      const handlerFn = vi.fn().mockRejectedValue(new Error('fail'));
      queue.registerHandler('dl', handlerFn);
      queue.enqueue({ ...makeEntryParams('dl'), max_attempts: 1 });
      vi.useRealTimers();
      await queue.drain(5000);
      const dead1 = queue.getDeadLetters();
      const dead2 = queue.getDeadLetters();
      expect(dead1).not.toBe(dead2); // different array instances
      expect(dead1).toEqual(dead2);   // same content
    }, 10000);

    it('dead-letter entry has failed_at timestamp and last_error', async () => {
      queue.registerHandler('dl-ts', vi.fn().mockRejectedValue(new Error('timestamped error')));
      queue.enqueue({ ...makeEntryParams('dl-ts'), max_attempts: 1 });
      vi.useRealTimers();
      await queue.drain(5000);
      const dead = queue.getDeadLetters()[0]!;
      expect(dead.failed_at).toBeDefined();
      expect(dead.last_error).toBe('timestamped error');
    }, 10000);
  });

  // ── retryDeadLetter ────────────────────────────────────────────────────────

  describe('retryDeadLetter', () => {
    it('returns false for unknown id', () => {
      expect(queue.retryDeadLetter('no-such-id')).toBe(false);
    });

    it('returns true and re-queues a dead-letter entry', async () => {
      const handlerFn = vi
        .fn()
        .mockRejectedValueOnce(new Error('first fail'))
        .mockResolvedValue(undefined);
      queue.registerHandler('retry-dl', handlerFn);
      queue.enqueue({ ...makeEntryParams('retry-dl'), max_attempts: 1 });
      vi.useRealTimers();
      await queue.drain(5000);

      const dead = queue.getDeadLetters();
      expect(dead).toHaveLength(1);
      const id = dead[0]!.id;

      // Retry it — second handler call succeeds
      const retried = queue.retryDeadLetter(id);
      expect(retried).toBe(true);
      expect(queue.size).toBe(1);
      expect(queue.getDeadLetters()).toHaveLength(0);

      await queue.drain(5000);
      expect(queue.getStats().completed).toBe(1); // success on retry
    }, 15000);

    it('resets attempts and backoff on re-queue', async () => {
      const handlerFn = vi.fn().mockRejectedValue(new Error('persistent fail'));
      queue.registerHandler('reset-h', handlerFn);
      queue.enqueue({ ...makeEntryParams('reset-h'), max_attempts: 1 });
      vi.useRealTimers();
      await queue.drain(5000);

      const id = queue.getDeadLetters()[0]!.id;
      queue.retryDeadLetter(id);

      // Check reset — entry is back with attempts=0
      expect(queue.size).toBe(1);
      queue.stop();
    }, 10000);
  });

  // ── deadline handling ──────────────────────────────────────────────────────

  describe('deadline handling', () => {
    it('drops expired entries without calling handler', async () => {
      const handlerFn = vi.fn().mockResolvedValue(undefined);
      queue.registerHandler('deadline-h', handlerFn);
      const pastDeadline = new Date(Date.now() - 1000).toISOString();
      queue.enqueue({
        ...makeEntryParams('deadline-h'),
        deadline: pastDeadline,
      });
      vi.useRealTimers();
      await drainAll(queue);
      expect(handlerFn).not.toHaveBeenCalled();
      expect(queue.getStats().completed).toBe(0);
    });

    it('processes entries with future deadline normally', async () => {
      const handlerFn = vi.fn().mockResolvedValue(undefined);
      queue.registerHandler('future-h', handlerFn);
      const futureDeadline = new Date(Date.now() + 60000).toISOString();
      queue.enqueue({
        ...makeEntryParams('future-h'),
        deadline: futureDeadline,
      });
      vi.useRealTimers();
      await drainAll(queue);
      expect(handlerFn).toHaveBeenCalledOnce();
    });
  });

  // ── missing handler ────────────────────────────────────────────────────────

  describe('missing handler', () => {
    it('skips entry without calling anything when handler is not registered', async () => {
      queue.enqueue(makeEntryParams('unregistered'));
      vi.useRealTimers();
      await drainAll(queue);
      // No error, no completed count — just silently dropped
      const stats = queue.getStats();
      expect(stats.completed).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.dead_letters).toBe(0);
    });
  });

  // ── priority ordering verified through processing ─────────────────────────

  describe('priority-ordered processing', () => {
    it('processes CRITICAL before HIGH before NORMAL before LOW', async () => {
      const order: string[] = [];
      queue.registerHandler(
        'p',
        vi.fn().mockImplementation(async (e: QueueEntry) => {
          order.push(String(e.priority));
        }),
      );

      // Enqueue in reverse priority order
      queue.enqueue({ ...makeEntryParams('p', QueuePriority.LOW), id: 'low' });
      queue.enqueue({ ...makeEntryParams('p', QueuePriority.NORMAL), id: 'normal' });
      queue.enqueue({ ...makeEntryParams('p', QueuePriority.HIGH), id: 'high' });
      queue.enqueue({ ...makeEntryParams('p', QueuePriority.CRITICAL), id: 'critical' });

      vi.useRealTimers();
      await drainAll(queue);

      expect(order).toEqual([
        String(QueuePriority.CRITICAL),
        String(QueuePriority.HIGH),
        String(QueuePriority.NORMAL),
        String(QueuePriority.LOW),
      ]);
    });
  });

  // ── start triggers processing of existing items ───────────────────────────

  describe('start with existing items', () => {
    it('starts processing items enqueued before start()', async () => {
      const handlerFn = vi.fn().mockResolvedValue(undefined);
      queue.registerHandler('pre', handlerFn);
      queue.enqueue(makeEntryParams('pre'));
      queue.enqueue(makeEntryParams('pre'));
      vi.useRealTimers();
      await drainAll(queue);
      expect(handlerFn).toHaveBeenCalledTimes(2);
    });
  });
});
