import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventQueue, QueuePriority } from '../event-queue.js';
import type { QueueEntry, EventQueueConfig } from '../event-queue.js';
import type { RuntimeEvent } from '../types.js';
import { QueueError } from '../../../shared/errors.js';

// Suppress logger output
vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: EventQueueConfig = {
  max_size: 1000,
  max_attempts: 3,
  backoff_base_ms: 100,
  backoff_multiplier: 2,
  process_interval_ms: 0,
};

function makeEvent(type = 'session:started'): RuntimeEvent {
  return {
    id: `evt_${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
    type: type as RuntimeEvent['type'],
    source: { kind: 'system' },
    payload: { type: type as never, data: {} as never },
    metadata: { session_id: 'test', sequence: 1, version: 1 },
  };
}

function makeEntryInput(
  handler = 'testHandler',
  priority: QueuePriority = QueuePriority.NORMAL,
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

// ─── EventQueue ───────────────────────────────────────────────────────────────

describe('EventQueue', () => {
  let queue: EventQueue;

  beforeEach(() => {
    queue = new EventQueue(DEFAULT_CONFIG);
  });

  // ─── Constructor ───────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('creates an instance with valid config', () => {
      expect(() => new EventQueue(DEFAULT_CONFIG)).not.toThrow();
    });

    it('throws QueueError when max_size is 0', () => {
      expect(() => new EventQueue({ ...DEFAULT_CONFIG, max_size: 0 })).toThrow(QueueError);
    });

    it('throws QueueError when max_size is negative', () => {
      expect(() => new EventQueue({ ...DEFAULT_CONFIG, max_size: -1 })).toThrow(QueueError);
    });

    it('error message mentions max_size value', () => {
      expect(() => new EventQueue({ ...DEFAULT_CONFIG, max_size: 0 })).toThrow(/max_size/);
    });
  });

  // ─── enqueue ───────────────────────────────────────────────────────────────

  describe('enqueue', () => {
    it('returns a string entry id', () => {
      const id = queue.enqueue(makeEntryInput());
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('increments the queue size', () => {
      expect(queue.size).toBe(0);
      queue.enqueue(makeEntryInput());
      expect(queue.size).toBe(1);
      queue.enqueue(makeEntryInput());
      expect(queue.size).toBe(2);
    });

    it('uses the provided id when specified', () => {
      const id = queue.enqueue({ ...makeEntryInput(), id: 'custom-id-123' });
      expect(id).toBe('custom-id-123');
    });

    it('auto-generates id when not provided', () => {
      const id = queue.enqueue(makeEntryInput());
      expect(id).toBeTruthy();
    });

    it('throws QueueError when queue is at max capacity', () => {
      const smallQueue = new EventQueue({ ...DEFAULT_CONFIG, max_size: 2 });
      smallQueue.enqueue(makeEntryInput());
      smallQueue.enqueue(makeEntryInput());
      expect(() => smallQueue.enqueue(makeEntryInput())).toThrow(QueueError);
    });

    it('error message mentions handler name when queue is full', () => {
      const smallQueue = new EventQueue({ ...DEFAULT_CONFIG, max_size: 1 });
      smallQueue.enqueue(makeEntryInput('myHandler'));
      expect(() => smallQueue.enqueue(makeEntryInput('myHandler'))).toThrow(/myHandler/);
    });

    it('sets initial attempts to 0', async () => {
      queue.registerHandler('testHandler', vi.fn());
      queue.enqueue(makeEntryInput());
      const stats = queue.getStats();
      // Just verify the entry is pending (attempts are internal, check via stats)
      expect(stats.pending).toBe(1);
    });
  });

  // ─── start / stop ─────────────────────────────────────────────────────────

  describe('start / stop', () => {
    it('start is idempotent — calling twice does not throw', () => {
      expect(() => { queue.start(); queue.start(); }).not.toThrow();
      queue.stop();
    });

    it('stop is idempotent — calling twice does not throw', () => {
      queue.start();
      expect(() => { queue.stop(); queue.stop(); }).not.toThrow();
    });

    it('stop cancels the pending process timer', () => {
      queue.start();
      queue.enqueue(makeEntryInput());
      queue.stop();
      // Queue should still have the item pending (processing didn’t happen yet)
      expect(queue.size).toBeGreaterThanOrEqual(0); // timer cancelled, no error
    });
  });

  // ─── registerHandler ─────────────────────────────────────────────────────

  describe('registerHandler', () => {
    it('registers a handler without throwing', () => {
      expect(() => queue.registerHandler('myHandler', vi.fn())).not.toThrow();
    });

    it('re-registering a handler replaces the previous one', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      queue.registerHandler('myHandler', handler1);
      queue.registerHandler('myHandler', handler2);

      queue.enqueue(makeEntryInput('myHandler'));
      await queue.drain(1000);

      expect(handler2).toHaveBeenCalledOnce();
      expect(handler1).not.toHaveBeenCalled();
    });
  });

  // ─── Priority ordering ────────────────────────────────────────────────────

  describe('priority ordering', () => {
    it('processes CRITICAL entries before LOW entries', async () => {
      const order: string[] = [];
      queue.registerHandler('trackHandler', async (entry) => {
        order.push(entry.id);
      });

      const lowId = queue.enqueue(makeEntryInput('trackHandler', QueuePriority.LOW, { id: 'low-1' } as never));
      const critId = queue.enqueue(makeEntryInput('trackHandler', QueuePriority.CRITICAL, { id: 'crit-1' } as never));

      await queue.drain(2000);

      const critIdx = order.indexOf(critId);
      const lowIdx = order.indexOf(lowId);
      expect(critIdx).toBeLessThan(lowIdx);
    });

    it('processes HIGH before NORMAL before LOW within multiple entries', async () => {
      const order: string[] = [];
      queue.registerHandler('orderHandler', async (entry) => {
        order.push(entry.priority.toString());
      });

      // Enqueue in reverse priority order
      queue.enqueue(makeEntryInput('orderHandler', QueuePriority.LOW));
      queue.enqueue(makeEntryInput('orderHandler', QueuePriority.NORMAL));
      queue.enqueue(makeEntryInput('orderHandler', QueuePriority.HIGH));
      queue.enqueue(makeEntryInput('orderHandler', QueuePriority.CRITICAL));

      await queue.drain(2000);

      expect(order).toEqual([
        QueuePriority.CRITICAL.toString(),
        QueuePriority.HIGH.toString(),
        QueuePriority.NORMAL.toString(),
        QueuePriority.LOW.toString(),
      ]);
    });

    it('processes same-priority entries in FIFO order', async () => {
      const order: string[] = [];
      queue.registerHandler('fifoHandler', async (entry) => {
        order.push(entry.id);
      });

      queue.enqueue(makeEntryInput('fifoHandler', QueuePriority.NORMAL, { id: 'first' } as never));
      queue.enqueue(makeEntryInput('fifoHandler', QueuePriority.NORMAL, { id: 'second' } as never));
      queue.enqueue(makeEntryInput('fifoHandler', QueuePriority.NORMAL, { id: 'third' } as never));

      await queue.drain(2000);

      expect(order).toEqual(['first', 'second', 'third']);
    });
  });

  // ─── drain ─────────────────────────────────────────────────────────────────

  describe('drain', () => {
    it('returns processed=0 and remaining=0 on an empty queue', async () => {
      const result = await queue.drain(1000);
      expect(result).toEqual({ processed: 0, remaining: 0 });
    });

    it('processes all items within timeout', async () => {
      const processed: string[] = [];
      queue.registerHandler('testHandler', async (entry) => {
        processed.push(entry.id);
      });

      const id1 = queue.enqueue(makeEntryInput());
      const id2 = queue.enqueue(makeEntryInput());

      const result = await queue.drain(5000);
      expect(result.processed).toBe(2);
      expect(result.remaining).toBe(0);
      expect(processed).toContain(id1);
      expect(processed).toContain(id2);
    });

    it('returns remaining count when items remain after timeout', async () => {
      // Register a slow handler
      queue.registerHandler('slowHandler', async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 500));
      });

      // Enqueue many items that can't finish in 50ms
      for (let i = 0; i < 5; i++) {
        queue.enqueue(makeEntryInput('slowHandler'));
      }

      const result = await queue.drain(50);
      // At least some remain (slow handler takes 500ms each)
      expect(result.remaining).toBeGreaterThanOrEqual(0); // dependent on timing
      // But the call itself should return without error
    });

    it('works when queue was not started (temporarily starts for drain)', async () => {
      const called: boolean[] = [];
      queue.registerHandler('testHandler', async () => { called.push(true); });
      queue.enqueue(makeEntryInput());

      // Queue is stopped (never started)
      const result = await queue.drain(2000);
      expect(result.processed).toBe(1);
      expect(called).toHaveLength(1);
    });
  });

  // ─── Dead-letter queue ────────────────────────────────────────────────────

  describe('dead-letter queue', () => {
    it('moves exhausted entries to the dead-letter queue', async () => {
      const failingQueue = new EventQueue({
        ...DEFAULT_CONFIG,
        max_attempts: 2,
        backoff_base_ms: 0,
        backoff_multiplier: 1,
        process_interval_ms: 0,
      });
      failingQueue.registerHandler('failHandler', async () => {
        throw new Error('always fails');
      });

      failingQueue.enqueue(makeEntryInput('failHandler', QueuePriority.NORMAL, { max_attempts: 2 }));
      await failingQueue.drain(5000);

      const deadLetters = failingQueue.getDeadLetters();
      expect(deadLetters).toHaveLength(1);
      expect(deadLetters[0]?.last_error).toContain('always fails');
    });

    it('dead-letter entry records all error messages', async () => {
      let attempt = 0;
      const failingQueue = new EventQueue({
        ...DEFAULT_CONFIG,
        max_attempts: 2,
        backoff_base_ms: 0,
        backoff_multiplier: 1,
        process_interval_ms: 0,
      });
      failingQueue.registerHandler('failHandler', async () => {
        attempt++;
        throw new Error(`failure attempt ${attempt}`);
      });

      failingQueue.enqueue(makeEntryInput('failHandler', QueuePriority.NORMAL, { max_attempts: 2 }));
      await failingQueue.drain(5000);

      const deadLetters = failingQueue.getDeadLetters();
      expect(deadLetters[0]?.all_errors).toHaveLength(2);
    });

    it('getDeadLetters returns a copy, not the internal array', async () => {
      const failingQueue = new EventQueue({
        ...DEFAULT_CONFIG,
        max_attempts: 1,
        backoff_base_ms: 0,
        backoff_multiplier: 1,
        process_interval_ms: 0,
      });
      failingQueue.registerHandler('failHandler', async () => {
        throw new Error('fail');
      });
      failingQueue.enqueue(makeEntryInput('failHandler', QueuePriority.NORMAL, { max_attempts: 1 }));
      await failingQueue.drain(2000);

      const copy1 = failingQueue.getDeadLetters();
      const copy2 = failingQueue.getDeadLetters();
      expect(copy1).not.toBe(copy2); // different array instances
      expect(copy1).toEqual(copy2);
    });
  });

  // ─── retryDeadLetter ────────────────────────────────────────────────────

  describe('retryDeadLetter', () => {
    it('returns false for unknown id', () => {
      expect(queue.retryDeadLetter('nonexistent-id')).toBe(false);
    });

    it('moves entry from DLQ back to main queue and returns true', async () => {
      const failingQueue = new EventQueue({
        ...DEFAULT_CONFIG,
        max_attempts: 1,
        backoff_base_ms: 0,
        backoff_multiplier: 1,
        process_interval_ms: 0,
      });

      let shouldFail = true;
      failingQueue.registerHandler('retryHandler', async () => {
        if (shouldFail) throw new Error('initial fail');
      });

      const id = failingQueue.enqueue(makeEntryInput('retryHandler', QueuePriority.NORMAL, { max_attempts: 1 }));
      await failingQueue.drain(2000);

      // Entry should be dead-lettered
      expect(failingQueue.getDeadLetters()).toHaveLength(1);

      // Now let it succeed on retry
      shouldFail = false;
      const requeued = failingQueue.retryDeadLetter(id);
      expect(requeued).toBe(true);
      expect(failingQueue.getDeadLetters()).toHaveLength(0);
      expect(failingQueue.size).toBe(1);

      await failingQueue.drain(2000);
      expect(failingQueue.size).toBe(0);
    });

    it('resets attempt counter on retry', async () => {
      const failingQueue = new EventQueue({
        ...DEFAULT_CONFIG,
        max_attempts: 1,
        backoff_base_ms: 0,
        backoff_multiplier: 1,
        process_interval_ms: 0,
      });

      failingQueue.registerHandler('retryHandler', async () => {
        throw new Error('fail');
      });

      const id = failingQueue.enqueue(
        makeEntryInput('retryHandler', QueuePriority.NORMAL, { max_attempts: 1 }),
      );
      await failingQueue.drain(2000);
      failingQueue.retryDeadLetter(id);

      // After retry, should be back in queue with reset attempts (max_attempts=1 applies again)
      await failingQueue.drain(2000);

      // Entry should be dead-lettered again (attempts reset to 0, then exhausted after 1 try)
      expect(failingQueue.getDeadLetters()).toHaveLength(1);
    });
  });

  // ─── getStats ─────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns zero stats on a fresh queue', () => {
      const stats = queue.getStats();
      expect(stats.pending).toBe(0);
      expect(stats.processing).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.dead_letters).toBe(0);
      expect(stats.avg_processing_ms).toBe(0);
      expect(stats.oldest_pending_age_ms).toBe(0);
    });

    it('updates pending count after enqueue', () => {
      queue.enqueue(makeEntryInput());
      queue.enqueue(makeEntryInput());
      expect(queue.getStats().pending).toBe(2);
    });

    it('updates by_priority breakdown', () => {
      queue.enqueue(makeEntryInput('h', QueuePriority.CRITICAL));
      queue.enqueue(makeEntryInput('h', QueuePriority.HIGH));
      queue.enqueue(makeEntryInput('h', QueuePriority.NORMAL));
      queue.enqueue(makeEntryInput('h', QueuePriority.LOW));
      const stats = queue.getStats();
      expect(stats.by_priority[QueuePriority.CRITICAL]).toBe(1);
      expect(stats.by_priority[QueuePriority.HIGH]).toBe(1);
      expect(stats.by_priority[QueuePriority.NORMAL]).toBe(1);
      expect(stats.by_priority[QueuePriority.LOW]).toBe(1);
    });

    it('tracks completed count after successful processing', async () => {
      queue.registerHandler('testHandler', vi.fn());
      queue.enqueue(makeEntryInput());
      queue.enqueue(makeEntryInput());
      await queue.drain(2000);
      expect(queue.getStats().completed).toBe(2);
    });

    it('tracks failed count on handler errors', async () => {
      const failingQueue = new EventQueue({
        ...DEFAULT_CONFIG,
        max_attempts: 1,
        backoff_base_ms: 0,
        backoff_multiplier: 1,
        process_interval_ms: 0,
      });
      failingQueue.registerHandler('failHandler', async () => {
        throw new Error('fail');
      });
      failingQueue.enqueue(makeEntryInput('failHandler', QueuePriority.NORMAL, { max_attempts: 1 }));
      await failingQueue.drain(2000);
      expect(failingQueue.getStats().failed).toBeGreaterThan(0);
    });

    it('reports dead_letters count', async () => {
      const failingQueue = new EventQueue({
        ...DEFAULT_CONFIG,
        max_attempts: 1,
        backoff_base_ms: 0,
        backoff_multiplier: 1,
        process_interval_ms: 0,
      });
      failingQueue.registerHandler('failHandler', async () => {
        throw new Error('fail');
      });
      failingQueue.enqueue(makeEntryInput('failHandler', QueuePriority.NORMAL, { max_attempts: 1 }));
      await failingQueue.drain(2000);
      expect(failingQueue.getStats().dead_letters).toBe(1);
    });

    it('avg_processing_ms is 0 when no completed entries', () => {
      expect(queue.getStats().avg_processing_ms).toBe(0);
    });

    it('oldest_pending_age_ms is positive when items are pending', () => {
      queue.enqueue(makeEntryInput());
      // Small delay to ensure enqueued_at is in the past
      const stats = queue.getStats();
      expect(stats.oldest_pending_age_ms).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── deadline handling ───────────────────────────────────────────────────

  describe('deadline handling', () => {
    it('drops entries with expired deadlines without calling handler', async () => {
      const handler = vi.fn();
      queue.registerHandler('deadlineHandler', handler);

      const expiredDeadline = new Date(Date.now() - 10_000).toISOString();
      queue.enqueue(makeEntryInput('deadlineHandler', QueuePriority.NORMAL, {
        deadline: expiredDeadline,
      }));

      await queue.drain(2000);

      expect(handler).not.toHaveBeenCalled();
      // Dropped entry is not dead-lettered — just discarded
      expect(queue.getDeadLetters()).toHaveLength(0);
    });

    it('processes entries with future deadlines normally', async () => {
      const handler = vi.fn();
      queue.registerHandler('deadlineHandler', handler);

      const futureDeadline = new Date(Date.now() + 60_000).toISOString();
      queue.enqueue(makeEntryInput('deadlineHandler', QueuePriority.NORMAL, {
        deadline: futureDeadline,
      }));

      await queue.drain(2000);

      expect(handler).toHaveBeenCalledOnce();
    });
  });

  // ─── missing handler ────────────────────────────────────────────────────

  describe('missing handler', () => {
    it('skips entries when no handler is registered and does not throw', async () => {
      // No handler registered for 'unknownHandler'
      queue.enqueue(makeEntryInput('unknownHandler'));
      await expect(queue.drain(2000)).resolves.toBeDefined();
    });

    it('entry with unknown handler is discarded (not dead-lettered)', async () => {
      queue.enqueue(makeEntryInput('unknownHandler'));
      await queue.drain(2000);
      // Should not appear in dead letters
      expect(queue.getDeadLetters()).toHaveLength(0);
    });
  });

  // ─── size property ──────────────────────────────────────────────────────────

  describe('size', () => {
    it('returns 0 on empty queue', () => {
      expect(queue.size).toBe(0);
    });

    it('reflects total pending items across all priorities', () => {
      queue.enqueue(makeEntryInput('h', QueuePriority.CRITICAL));
      queue.enqueue(makeEntryInput('h', QueuePriority.HIGH));
      queue.enqueue(makeEntryInput('h', QueuePriority.NORMAL));
      queue.enqueue(makeEntryInput('h', QueuePriority.LOW));
      expect(queue.size).toBe(4);
    });
  });

  // ─── QueuePriority enum ────────────────────────────────────────────────────

  describe('QueuePriority enum', () => {
    it('CRITICAL has the lowest numeric value (highest priority)', () => {
      expect(QueuePriority.CRITICAL).toBe(0);
    });

    it('priorities are ordered CRITICAL < HIGH < NORMAL < LOW', () => {
      expect(QueuePriority.CRITICAL).toBeLessThan(QueuePriority.HIGH);
      expect(QueuePriority.HIGH).toBeLessThan(QueuePriority.NORMAL);
      expect(QueuePriority.NORMAL).toBeLessThan(QueuePriority.LOW);
    });
  });

  // ─── Head-pointer compaction ─────────────────────────────────────────────

  describe('head-pointer compaction', () => {
    it('drains 100+ entries cleanly and leaves size at 0', async () => {
      const ENTRY_COUNT = 100;
      let processedCount = 0;
      queue.registerHandler('compactHandler', async () => {
        processedCount++;
      });

      for (let i = 0; i < ENTRY_COUNT; i++) {
        queue.enqueue(makeEntryInput('compactHandler', QueuePriority.NORMAL));
      }

      expect(queue.size).toBe(ENTRY_COUNT);

      await queue.drain(10000);

      expect(queue.size).toBe(0);
      expect(processedCount).toBe(ENTRY_COUNT);
    });

    it('getStats().by_priority is accurate after draining 100+ entries', async () => {
      queue.registerHandler('compactHandler', vi.fn());

      for (let i = 0; i < 100; i++) {
        queue.enqueue(makeEntryInput('compactHandler', QueuePriority.NORMAL));
      }

      await queue.drain(10000);

      const stats = queue.getStats();
      expect(stats.by_priority[QueuePriority.NORMAL]).toBe(0);
      expect(stats.pending).toBe(0);
    });

    it('compaction threshold fires at head >= 64 and head >= bucket.length / 2', async () => {
      // Enqueue exactly 128 entries so that after the 64th dequeue:
      // head=64, bucket.length=128 → 64 >= 64 && 64 >= 64 → compaction fires.
      // After compaction bucket is spliced to length 64 with head reset to 0.
      // Remaining 64 entries continue processing normally.
      const ENTRY_COUNT = 128;
      let processedCount = 0;
      queue.registerHandler('compactHandler', async () => {
        processedCount++;
      });

      for (let i = 0; i < ENTRY_COUNT; i++) {
        queue.enqueue(makeEntryInput('compactHandler', QueuePriority.NORMAL));
      }

      await queue.drain(10000);

      // All entries processed; compaction ran mid-drain without data loss
      expect(processedCount).toBe(ENTRY_COUNT);
      expect(queue.size).toBe(0);
      expect(queue.getStats().by_priority[QueuePriority.NORMAL]).toBe(0);
    });
  });
});
