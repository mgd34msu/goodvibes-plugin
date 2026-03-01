import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DirectiveQueue, HOLD_TTL_MS } from '../directive-queue.js';
import type { Directive } from '../../../shared/ipc/protocol.js';

// Mock logger to suppress output
vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDirective(overrides: Partial<Directive> = {}): Directive {
  return {
    type: 'suggest',
    content: 'test content',
    priority: 0,
    source: 'test',
    ...overrides,
  };
}

describe('DirectiveQueue', () => {
  let q: DirectiveQueue;

  beforeEach(() => {
    q = new DirectiveQueue();
  });

  // ─── enqueue / drain ────────────────────────────────────────────────────────

  describe('enqueue and drain', () => {
    it('drains an empty queue without errors', () => {
      expect(q.drain('subagent_stop')).toEqual([]);
    });

    it('enqueues a directive and drains it in FIFO order', () => {
      const d1 = makeDirective({ content: 'first' });
      const d2 = makeDirective({ content: 'second' });
      q.enqueue('target', d1);
      q.enqueue('target', d2);

      const drained = q.drain('target');
      expect(drained).toEqual([d1, d2]);
    });

    it('drain clears the queue', () => {
      q.enqueue('target', makeDirective());
      q.drain('target');
      expect(q.drain('target')).toEqual([]);
    });

    it('drain is scoped per target', () => {
      q.enqueue('target-a', makeDirective({ content: 'a' }));
      q.enqueue('target-b', makeDirective({ content: 'b' }));

      const drained = q.drain('target-a');
      expect(drained).toHaveLength(1);
      expect(drained[0].content).toBe('a');
      // target-b is untouched
      expect(q.drain('target-b')).toHaveLength(1);
    });

    it('drains only matching workflow_id directives when workflowId is specified', () => {
      const d1 = makeDirective({ content: 'wf-1', workflow_id: 'wf-1' });
      const d2 = makeDirective({ content: 'wf-2', workflow_id: 'wf-2' });
      const d3 = makeDirective({ content: 'no-wf' });
      q.enqueue('target', d1);
      q.enqueue('target', d2);
      q.enqueue('target', d3);

      const drained = q.drain('target', 'wf-1');
      expect(drained).toEqual([d1]);

      // Remaining: d2 and d3
      const rest = q.drain('target');
      expect(rest).toEqual([d2, d3]);
    });

    it('drain with workflowId removes the queue key when nothing remains', () => {
      const d = makeDirective({ workflow_id: 'wf-1' });
      q.enqueue('target', d);
      q.drain('target', 'wf-1');
      expect(q.size('target')).toBe(0);
    });
  });

  // ─── MAX_QUEUE_DEPTH eviction ────────────────────────────────────────────────

  describe('MAX_QUEUE_DEPTH enforcement', () => {
    it('evicts oldest directive when queue exceeds capacity', () => {
      const MAX = 100;
      for (let i = 0; i < MAX; i++) {
        q.enqueue('target', makeDirective({ content: `item-${i}` }));
      }
      // Queue is full — adding one more should evict index 0
      const newest = makeDirective({ content: 'overflow' });
      q.enqueue('target', newest);

      const drained = q.drain('target');
      expect(drained).toHaveLength(MAX);
      // First item (index 0) was evicted; second item (index 1) is now head
      expect(drained[0].content).toBe('item-1');
      expect(drained[MAX - 1].content).toBe('overflow');
    });
  });

  // ─── hold / release ──────────────────────────────────────────────────────────

  describe('holdDrain and releaseHold', () => {
    it('holdDrain returns empty holdId and directives when queue is empty', () => {
      const result = q.holdDrain('target');
      expect(result.holdId).toBe('');
      expect(result.directives).toEqual([]);
    });

    it('holdDrain removes directives from queue and holds them', () => {
      const d = makeDirective();
      q.enqueue('target', d);

      const { holdId, directives } = q.holdDrain('target');
      expect(holdId).not.toBe('');
      expect(directives).toEqual([d]);
      // Queue is now empty
      expect(q.drain('target')).toEqual([]);
      // Held size is 1
      expect(q.heldSize()).toBe(1);
    });

    it('releaseHold removes held directives permanently', () => {
      q.enqueue('target', makeDirective());
      const { holdId } = q.holdDrain('target');

      q.releaseHold(holdId);
      expect(q.heldSize()).toBe(0);
    });

    it('releaseHold is a no-op for unknown holdId', () => {
      q.releaseHold('nonexistent-hold-id');
      expect(q.heldSize()).toBe(0);
    });

    it('releaseHold is a no-op for empty holdId', () => {
      q.releaseHold('');
      expect(q.heldSize()).toBe(0);
    });
  });

  // ─── reEnqueueHold ──────────────────────────────────────────────────────────

  describe('reEnqueueHold', () => {
    it('re-enqueues held directives at the front of the queue', () => {
      const held = makeDirective({ content: 'held' });
      q.enqueue('target', held);
      const { holdId } = q.holdDrain('target');

      // Enqueue new items while in held state
      const newer = makeDirective({ content: 'newer' });
      q.enqueue('target', newer);

      const count = q.reEnqueueHold(holdId);
      expect(count).toBe(1);

      // Held directive is at front
      const drained = q.drain('target');
      expect(drained[0].content).toBe('held');
      expect(drained[1].content).toBe('newer');
    });

    it('reEnqueueHold returns 0 for unknown holdId', () => {
      expect(q.reEnqueueHold('no-such-hold')).toBe(0);
    });
  });

  // ─── sweepStaleHolds ────────────────────────────────────────────────────────

  describe('sweepStaleHolds', () => {
    it('does nothing when no holds are stale', () => {
      q.enqueue('target', makeDirective());
      q.holdDrain('target');

      // Sweep with very long TTL — nothing should be re-enqueued
      const reEnqueued = q.sweepStaleHolds(60_000);
      expect(reEnqueued).toBe(0);
      expect(q.heldSize()).toBe(1);
    });

    it('re-enqueues stale holds after TTL expires', () => {
      q.enqueue('target', makeDirective({ content: 'stale' }));
      q.holdDrain('target');

      // Sweep with 0ms TTL — the hold was created "now", which is >= 0ms ago
      const reEnqueued = q.sweepStaleHolds(0);
      expect(reEnqueued).toBe(1);
      expect(q.heldSize()).toBe(0);
      // The directive is back in the queue
      expect(q.size('target')).toBe(1);
    });

    it('uses HOLD_TTL_MS constant as default TTL', () => {
      // Just verify the constant is exported and is a positive number
      expect(HOLD_TTL_MS).toBeGreaterThan(0);
    });
  });

  // ─── purge ──────────────────────────────────────────────────────────────────

  describe('purge', () => {
    it('purges all directives for a workflow across all targets', () => {
      q.enqueue('target-a', makeDirective({ workflow_id: 'wf-1' }));
      q.enqueue('target-b', makeDirective({ workflow_id: 'wf-1' }));
      q.enqueue('target-a', makeDirective({ workflow_id: 'wf-2' }));

      const count = q.purge('wf-1');
      expect(count).toBe(2);
      expect(q.size()).toBe(1);
    });

    it('purges directives in held batches for the workflow', () => {
      q.enqueue('target', makeDirective({ workflow_id: 'wf-purge' }));
      q.holdDrain('target', 'wf-purge');

      const count = q.purge('wf-purge');
      expect(count).toBe(1);
      expect(q.heldSize()).toBe(0);
    });

    it('returns 0 when nothing matches the workflow', () => {
      q.enqueue('target', makeDirective({ workflow_id: 'wf-other' }));
      expect(q.purge('wf-unknown')).toBe(0);
    });

    it('preserves directives from other workflows', () => {
      q.enqueue('target', makeDirective({ workflow_id: 'wf-1' }));
      q.enqueue('target', makeDirective({ workflow_id: 'wf-2' }));

      q.purge('wf-1');
      expect(q.size('target')).toBe(1);
      expect(q.peek('target')[0].workflow_id).toBe('wf-2');
    });
  });

  // ─── peek ───────────────────────────────────────────────────────────────────

  describe('peek', () => {
    it('returns an empty array for an empty target', () => {
      expect(q.peek('target')).toEqual([]);
    });

    it('returns a snapshot without removing directives', () => {
      const d = makeDirective();
      q.enqueue('target', d);
      const peeked = q.peek('target');
      expect(peeked).toEqual([d]);
      // Queue still has one directive
      expect(q.size('target')).toBe(1);
    });

    it('filters by workflowId when provided', () => {
      q.enqueue('target', makeDirective({ workflow_id: 'wf-1' }));
      q.enqueue('target', makeDirective({ workflow_id: 'wf-2' }));

      const peeked = q.peek('target', 'wf-1');
      expect(peeked).toHaveLength(1);
      expect(peeked[0].workflow_id).toBe('wf-1');
    });
  });

  // ─── clear ──────────────────────────────────────────────────────────────────

  describe('clear', () => {
    it('removes all directives and held batches', () => {
      q.enqueue('target-a', makeDirective());
      q.enqueue('target-b', makeDirective());
      q.holdDrain('target-a');

      q.clear();
      expect(q.size()).toBe(0);
      expect(q.heldSize()).toBe(0);
    });
  });

  // ─── size ────────────────────────────────────────────────────────────────────

  describe('size', () => {
    it('returns 0 for an empty queue', () => {
      expect(q.size()).toBe(0);
      expect(q.size('any-target')).toBe(0);
    });

    it('returns total count across all targets when called without argument', () => {
      q.enqueue('target-a', makeDirective());
      q.enqueue('target-a', makeDirective());
      q.enqueue('target-b', makeDirective());
      expect(q.size()).toBe(3);
    });

    it('returns per-target count when called with a target argument', () => {
      q.enqueue('target-a', makeDirective());
      q.enqueue('target-a', makeDirective());
      q.enqueue('target-b', makeDirective());
      expect(q.size('target-a')).toBe(2);
      expect(q.size('target-b')).toBe(1);
    });
  });

  // ─── heldSize ───────────────────────────────────────────────────────────────

  describe('heldSize', () => {
    it('returns 0 when no holds exist', () => {
      expect(q.heldSize()).toBe(0);
    });

    it('returns the total count of held directives', () => {
      q.enqueue('target', makeDirective());
      q.enqueue('target', makeDirective());
      q.holdDrain('target');
      expect(q.heldSize()).toBe(2);
    });
  });
});
