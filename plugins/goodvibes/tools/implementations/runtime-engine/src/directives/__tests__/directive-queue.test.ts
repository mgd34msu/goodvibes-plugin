import { DirectiveQueue } from '../directive-queue.js';
import type { Directive } from '../../ipc/protocol.js';

function makeDirective(overrides: Partial<Directive> = {}): Directive {
  return {
    type: 'inject_context',
    content: 'test content',
    priority: 0,
    source: 'test',
    ...overrides,
  };
}

describe('DirectiveQueue', () => {
  let queue: DirectiveQueue;

  beforeEach(() => {
    queue = new DirectiveQueue();
  });

  // ─── Empty Queue Behavior ────────────────────────────────────────────────────

  describe('empty queue', () => {
    it('drain returns empty array for unknown target', () => {
      expect(queue.drain('hook:pre_tool_use')).toEqual([]);
    });

    it('peek returns empty array for unknown target', () => {
      expect(queue.peek('hook:pre_tool_use')).toEqual([]);
    });

    it('size returns 0 for unknown target', () => {
      expect(queue.size('hook:pre_tool_use')).toBe(0);
    });

    it('size returns 0 total when nothing enqueued', () => {
      expect(queue.size()).toBe(0);
    });
  });

  // ─── Enqueue ─────────────────────────────────────────────────────────────────

  describe('enqueue', () => {
    it('increases size for the target', () => {
      const d = makeDirective();
      queue.enqueue('target_a', d);
      expect(queue.size('target_a')).toBe(1);
    });

    it('increases total size', () => {
      queue.enqueue('target_a', makeDirective());
      queue.enqueue('target_b', makeDirective());
      expect(queue.size()).toBe(2);
    });

    it('stores multiple directives for the same target', () => {
      const d1 = makeDirective({ content: 'first' });
      const d2 = makeDirective({ content: 'second' });
      queue.enqueue('target_a', d1);
      queue.enqueue('target_a', d2);
      expect(queue.size('target_a')).toBe(2);
    });

    it('isolates directives by target key', () => {
      queue.enqueue('target_a', makeDirective({ content: 'a' }));
      queue.enqueue('target_b', makeDirective({ content: 'b' }));
      expect(queue.size('target_a')).toBe(1);
      expect(queue.size('target_b')).toBe(1);
    });
  });

  // ─── Drain ───────────────────────────────────────────────────────────────────

  describe('drain', () => {
    it('returns single enqueued directive', () => {
      const d = makeDirective({ content: 'only' });
      queue.enqueue('target_a', d);
      const result = queue.drain('target_a');
      expect(result).toEqual([d]);
    });

    it('returns directives in FIFO order', () => {
      const d1 = makeDirective({ content: 'first' });
      const d2 = makeDirective({ content: 'second' });
      const d3 = makeDirective({ content: 'third' });
      queue.enqueue('fifo', d1);
      queue.enqueue('fifo', d2);
      queue.enqueue('fifo', d3);
      const result = queue.drain('fifo');
      expect(result).toEqual([d1, d2, d3]);
    });

    it('removes all items after drain', () => {
      queue.enqueue('target_a', makeDirective());
      queue.enqueue('target_a', makeDirective());
      queue.drain('target_a');
      expect(queue.size('target_a')).toBe(0);
    });

    it('returns empty array on second drain', () => {
      queue.enqueue('target_a', makeDirective());
      queue.drain('target_a');
      expect(queue.drain('target_a')).toEqual([]);
    });

    it('only drains the specified target', () => {
      queue.enqueue('target_a', makeDirective({ content: 'a' }));
      queue.enqueue('target_b', makeDirective({ content: 'b' }));
      queue.drain('target_a');
      expect(queue.size('target_b')).toBe(1);
    });

    it('returns an empty array for an already-empty queue', () => {
      expect(queue.drain('no_such_target')).toEqual([]);
    });
  });

  // ─── Peek ────────────────────────────────────────────────────────────────────

  describe('peek', () => {
    it('returns directives without removing them', () => {
      const d1 = makeDirective({ content: 'a' });
      const d2 = makeDirective({ content: 'b' });
      queue.enqueue('target_a', d1);
      queue.enqueue('target_a', d2);
      const peeked = queue.peek('target_a');
      expect(peeked).toEqual([d1, d2]);
      expect(queue.size('target_a')).toBe(2);
    });

    it('returns a snapshot — mutations do not affect the queue', () => {
      const d = makeDirective({ content: 'original' });
      queue.enqueue('target_a', d);
      const snapshot = queue.peek('target_a');
      snapshot.pop();
      expect(queue.size('target_a')).toBe(1);
    });

    it('returns empty array when target has no directives', () => {
      expect(queue.peek('nonexistent')).toEqual([]);
    });
  });

  // ─── Clear ───────────────────────────────────────────────────────────────────

  describe('clear', () => {
    it('removes all directives from all targets', () => {
      queue.enqueue('target_a', makeDirective());
      queue.enqueue('target_b', makeDirective());
      queue.enqueue('target_a', makeDirective());
      queue.clear();
      expect(queue.size()).toBe(0);
    });

    it('individual target sizes are zero after clear', () => {
      queue.enqueue('target_a', makeDirective());
      queue.enqueue('target_b', makeDirective());
      queue.clear();
      expect(queue.size('target_a')).toBe(0);
      expect(queue.size('target_b')).toBe(0);
    });

    it('drain returns empty after clear', () => {
      queue.enqueue('target_a', makeDirective());
      queue.clear();
      expect(queue.drain('target_a')).toEqual([]);
    });
  });

  // ─── Size ────────────────────────────────────────────────────────────────────

  describe('size', () => {
    it('counts across multiple targets when no argument given', () => {
      queue.enqueue('t1', makeDirective());
      queue.enqueue('t1', makeDirective());
      queue.enqueue('t2', makeDirective());
      expect(queue.size()).toBe(3);
    });

    it('counts per-target when target argument given', () => {
      queue.enqueue('t1', makeDirective());
      queue.enqueue('t1', makeDirective());
      queue.enqueue('t2', makeDirective());
      expect(queue.size('t1')).toBe(2);
      expect(queue.size('t2')).toBe(1);
    });

    it('returns 0 for a target that never received a directive', () => {
      queue.enqueue('other', makeDirective());
      expect(queue.size('nonexistent')).toBe(0);
    });

    it('decreases after drain', () => {
      queue.enqueue('t1', makeDirective());
      queue.enqueue('t1', makeDirective());
      queue.drain('t1');
      expect(queue.size('t1')).toBe(0);
      expect(queue.size()).toBe(0);
    });
  });

  // ─── MAX_QUEUE_DEPTH Eviction ─────────────────────────────────────────────

  describe('MAX_QUEUE_DEPTH eviction', () => {
    it('evicts the oldest directive when enqueuing beyond MAX_QUEUE_DEPTH (100)', () => {
      const first = makeDirective({ content: 'directive-0' });
      queue.enqueue('overflow_target', first);
      // Enqueue 100 more to push past the depth limit (total attempts: 101)
      for (let i = 1; i <= 100; i++) {
        queue.enqueue('overflow_target', makeDirective({ content: `directive-${i}` }));
      }
      const result = queue.drain('overflow_target');
      expect(result).toHaveLength(100);
      // The first (oldest) directive must have been evicted
      expect(result[0]?.content).toBe('directive-1');
      expect(result[99]?.content).toBe('directive-100');
    });
  });

  // ─── WRFC Config ──────────────────────────────────────────────────────────────

  describe('wrfcConfig', () => {
    it('stores and retrieves WRFC config', () => {
      const q = new DirectiveQueue();
      q.setWRFCConfig({ min_review_score: 9.5, max_fix_attempts: 3 });
      expect(q.getWRFCConfig()).toEqual({ min_review_score: 9.5, max_fix_attempts: 3 });
    });

    it('returns empty object when no config set', () => {
      const q = new DirectiveQueue();
      expect(q.getWRFCConfig()).toEqual({});
    });

    it('overwrites previous config', () => {
      const q = new DirectiveQueue();
      q.setWRFCConfig({ min_review_score: 8 });
      q.setWRFCConfig({ min_review_score: 9.5 });
      expect(q.getWRFCConfig()).toEqual({ min_review_score: 9.5 });
    });

    it('preserves config when clear() is called', () => {
      const q = new DirectiveQueue();
      q.setWRFCConfig({ min_review_score: 9.5 });
      q.enqueue('test', { type: 'inject_system_message', content: 'test', priority: 1, source: 'test' });
      q.clear();
      expect(q.getWRFCConfig()).toEqual({ min_review_score: 9.5 });
      expect(q.drain('test')).toEqual([]);
    });
  });

  // ─── Keyed Isolation ─────────────────────────────────────────────────────────

  describe('keyed isolation', () => {
    it('different targets maintain independent FIFO queues', () => {
      const dA1 = makeDirective({ content: 'a1' });
      const dA2 = makeDirective({ content: 'a2' });
      const dB1 = makeDirective({ content: 'b1' });

      queue.enqueue('target_a', dA1);
      queue.enqueue('target_b', dB1);
      queue.enqueue('target_a', dA2);

      expect(queue.drain('target_a')).toEqual([dA1, dA2]);
      expect(queue.drain('target_b')).toEqual([dB1]);
    });

    it('draining one target does not affect another', () => {
      queue.enqueue('alpha', makeDirective({ content: 'alpha' }));
      queue.enqueue('beta', makeDirective({ content: 'beta' }));
      queue.drain('alpha');
      const betaResult = queue.drain('beta');
      expect(betaResult).toHaveLength(1);
      expect(betaResult[0].content).toBe('beta');
    });
  });
});
