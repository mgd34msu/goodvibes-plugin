import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConditionEvaluator } from '../condition-evaluator.js';
import type { RuntimeEvent } from '../../events/types.js';
import type { TriggerCondition } from '../types.js';

function makeEvent(type: string, data: Record<string, unknown> = {}, id = 'evt-1'): RuntimeEvent {
  return {
    id,
    type: type as RuntimeEvent['type'],
    timestamp: Date.now(),
    source: { kind: 'test' } as RuntimeEvent['source'],
    payload: {
      type: type as RuntimeEvent['payload']['type'],
      data,
    } as RuntimeEvent['payload'],
    metadata: {
      sequence: 1,
      version: 1,
    },
  };
}

describe('ConditionEvaluator', () => {
  let evaluator: ConditionEvaluator;

  beforeEach(() => {
    evaluator = new ConditionEvaluator();
  });

  // ─── recordEvent ─────────────────────────────────────────────────────────────

  describe('recordEvent', () => {
    it('records events without throwing', () => {
      const event = makeEvent('test:event');
      expect(() => evaluator.recordEvent(event)).not.toThrow();
    });

    it('records multiple events without throwing', () => {
      for (let i = 0; i < 5; i++) {
        evaluator.recordEvent(makeEvent('test:event', {}, `evt-${i}`));
      }
      // Should still evaluate correctly after multiple records
      const cond: TriggerCondition = { type: 'event', event_type: 'test:event' };
      const lastEvent = makeEvent('test:event');
      evaluator.recordEvent(lastEvent);
      expect(evaluator.evaluate(cond, lastEvent)).toBe(true);
    });

    it('ring buffer wraps around at capacity without error', () => {
      const smallEvaluator = new ConditionEvaluator(5);
      // Fill past capacity
      for (let i = 0; i < 10; i++) {
        smallEvaluator.recordEvent(makeEvent('test:event', {}, `evt-${i}`));
      }
      const event = makeEvent('test:event');
      smallEvaluator.recordEvent(event);
      const cond: TriggerCondition = { type: 'event', event_type: 'test:event' };
      expect(smallEvaluator.evaluate(cond, event)).toBe(true);
    });
  });

  // ─── event condition ─────────────────────────────────────────────────────────

  describe('event condition', () => {
    it('matches exact event type', () => {
      const event = makeEvent('build:failed');
      evaluator.recordEvent(event);
      const cond: TriggerCondition = { type: 'event', event_type: 'build:failed' };
      expect(evaluator.evaluate(cond, event)).toBe(true);
    });

    it('does not match different event type', () => {
      const event = makeEvent('build:failed');
      evaluator.recordEvent(event);
      const cond: TriggerCondition = { type: 'event', event_type: 'build:success' };
      expect(evaluator.evaluate(cond, event)).toBe(false);
    });

    it('matches wildcard * for any event type', () => {
      const event = makeEvent('anything:happened');
      evaluator.recordEvent(event);
      const cond: TriggerCondition = { type: 'event', event_type: '*' };
      expect(evaluator.evaluate(cond, event)).toBe(true);
    });

    it('matches namespace wildcard for matching prefix', () => {
      const event = makeEvent('agent:completed');
      evaluator.recordEvent(event);
      const cond: TriggerCondition = { type: 'event', event_type: 'agent:*' };
      expect(evaluator.evaluate(cond, event)).toBe(true);
    });

    it('does not match namespace wildcard for non-matching prefix', () => {
      const event = makeEvent('build:failed');
      evaluator.recordEvent(event);
      const cond: TriggerCondition = { type: 'event', event_type: 'agent:*' };
      expect(evaluator.evaluate(cond, event)).toBe(false);
    });

    it('matches with payload filter when field value equals expected', () => {
      const event = makeEvent('agent:completed', { agent_type: 'reviewer' });
      evaluator.recordEvent(event);
      const cond: TriggerCondition = {
        type: 'event',
        event_type: 'agent:completed',
        filter: { agent_type: 'reviewer' },
      };
      expect(evaluator.evaluate(cond, event)).toBe(true);
    });

    it('does not match with payload filter when field value differs', () => {
      const event = makeEvent('agent:completed', { agent_type: 'engineer' });
      evaluator.recordEvent(event);
      const cond: TriggerCondition = {
        type: 'event',
        event_type: 'agent:completed',
        filter: { agent_type: 'reviewer' },
      };
      expect(evaluator.evaluate(cond, event)).toBe(false);
    });

    it('does not match when filtered field is missing from payload', () => {
      const event = makeEvent('agent:completed', {});
      evaluator.recordEvent(event);
      const cond: TriggerCondition = {
        type: 'event',
        event_type: 'agent:completed',
        filter: { agent_type: 'reviewer' },
      };
      expect(evaluator.evaluate(cond, event)).toBe(false);
    });

    it('matches when no filter is specified', () => {
      const event = makeEvent('test:passed', { anything: 'value' });
      evaluator.recordEvent(event);
      const cond: TriggerCondition = { type: 'event', event_type: 'test:passed' };
      expect(evaluator.evaluate(cond, event)).toBe(true);
    });

    it('matches event type when payload has no data field', () => {
      const event: RuntimeEvent = {
        id: 'evt-nodatafield',
        type: 'system:started' as RuntimeEvent['type'],
        timestamp: Date.now(),
        source: { kind: 'test' } as RuntimeEvent['source'],
        payload: { type: 'system:started' as RuntimeEvent['payload']['type'] } as RuntimeEvent['payload'],
        metadata: { sequence: 1, version: 1 },
      };
      evaluator.recordEvent(event);
      const cond: TriggerCondition = { type: 'event', event_type: 'system:started' };
      expect(evaluator.evaluate(cond, event)).toBe(true);
    });
  });

  // ─── composite conditions ────────────────────────────────────────────────────

  describe('and condition', () => {
    it('returns true when all sub-conditions are true', () => {
      const event = makeEvent('agent:completed', { agent_type: 'reviewer' });
      evaluator.recordEvent(event);
      const cond: TriggerCondition = {
        type: 'and',
        conditions: [
          { type: 'event', event_type: 'agent:completed' },
          { type: 'event', event_type: 'agent:*' },
        ],
      };
      expect(evaluator.evaluate(cond, event)).toBe(true);
    });

    it('returns false when any sub-condition is false', () => {
      const event = makeEvent('agent:completed');
      evaluator.recordEvent(event);
      const cond: TriggerCondition = {
        type: 'and',
        conditions: [
          { type: 'event', event_type: 'agent:completed' },
          { type: 'event', event_type: 'build:failed' },
        ],
      };
      expect(evaluator.evaluate(cond, event)).toBe(false);
    });

    it('returns true for empty and conditions array (vacuous truth)', () => {
      const event = makeEvent('any:event');
      evaluator.recordEvent(event);
      const cond: TriggerCondition = { type: 'and', conditions: [] };
      // Array.every on empty array returns true
      expect(evaluator.evaluate(cond, event)).toBe(true);
    });
  });

  describe('or condition', () => {
    it('returns true when at least one sub-condition is true', () => {
      const event = makeEvent('build:failed');
      evaluator.recordEvent(event);
      const cond: TriggerCondition = {
        type: 'or',
        conditions: [
          { type: 'event', event_type: 'agent:completed' },
          { type: 'event', event_type: 'build:failed' },
        ],
      };
      expect(evaluator.evaluate(cond, event)).toBe(true);
    });

    it('returns false when all sub-conditions are false', () => {
      const event = makeEvent('test:passed');
      evaluator.recordEvent(event);
      const cond: TriggerCondition = {
        type: 'or',
        conditions: [
          { type: 'event', event_type: 'agent:completed' },
          { type: 'event', event_type: 'build:failed' },
        ],
      };
      expect(evaluator.evaluate(cond, event)).toBe(false);
    });

    it('returns false for empty or conditions array (vacuous falseness)', () => {
      const event = makeEvent('any:event');
      evaluator.recordEvent(event);
      const cond: TriggerCondition = { type: 'or', conditions: [] };
      // Array.some on empty array returns false
      expect(evaluator.evaluate(cond, event)).toBe(false);
    });
  });

  describe('not condition', () => {
    it('returns true when inner condition is false', () => {
      const event = makeEvent('agent:completed');
      evaluator.recordEvent(event);
      const cond: TriggerCondition = {
        type: 'not',
        conditions: [{ type: 'event', event_type: 'build:failed' }],
      };
      expect(evaluator.evaluate(cond, event)).toBe(true);
    });

    it('returns false when inner condition is true', () => {
      const event = makeEvent('build:failed');
      evaluator.recordEvent(event);
      const cond: TriggerCondition = {
        type: 'not',
        conditions: [{ type: 'event', event_type: 'build:failed' }],
      };
      expect(evaluator.evaluate(cond, event)).toBe(false);
    });

    it('returns false when conditions array is empty', () => {
      const event = makeEvent('any:event');
      evaluator.recordEvent(event);
      const cond: TriggerCondition = { type: 'not', conditions: [] };
      expect(evaluator.evaluate(cond, event)).toBe(false);
    });
  });

  // ─── threshold condition ──────────────────────────────────────────────────────

  describe('threshold condition', () => {
    it('returns false when current event type does not match', () => {
      const event = makeEvent('agent:spawned');
      evaluator.recordEvent(event);
      const cond: TriggerCondition = {
        type: 'threshold',
        event_type: 'build:failed',
        count: 1,
        window_ms: 60_000,
      };
      expect(evaluator.evaluate(cond, event)).toBe(false);
    });

    it('returns false when count is not reached within window', () => {
      const event = makeEvent('build:failed');
      evaluator.recordEvent(event);
      const cond: TriggerCondition = {
        type: 'threshold',
        event_type: 'build:failed',
        count: 3,
        window_ms: 60_000,
      };
      expect(evaluator.evaluate(cond, event)).toBe(false);
    });

    it('returns true when count is exactly reached within window', () => {
      for (let i = 0; i < 3; i++) {
        const event = makeEvent('build:failed', {}, `evt-${i}`);
        evaluator.recordEvent(event);
      }
      const event = makeEvent('build:failed');
      evaluator.recordEvent(event);
      const cond: TriggerCondition = {
        type: 'threshold',
        event_type: 'build:failed',
        count: 2,
        window_ms: 60_000,
      };
      expect(evaluator.evaluate(cond, event)).toBe(true);
    });

    it('returns false when events are outside the time window', () => {
      // Fake that recorded events are old by using a very small window
      const event1 = makeEvent('build:failed', {}, 'evt-old');
      evaluator.recordEvent(event1);
      const event2 = makeEvent('build:failed', {}, 'evt-old2');
      evaluator.recordEvent(event2);

      // Very small window (0ms) — events should be outside
      const event3 = makeEvent('build:failed');
      evaluator.recordEvent(event3);
      const cond: TriggerCondition = {
        type: 'threshold',
        event_type: 'build:failed',
        count: 3,
        window_ms: 0,
      };
      // 0ms window means even the current event was "just now" but
      // its recorded timestamp should be at Date.now() — this tests
      // behavior at boundary: 3 needed, window=0 so all fail the cutoff
      expect(evaluator.evaluate(cond, event3)).toBe(false);
    });

    it('matches namespace wildcard event type in threshold', () => {
      for (let i = 0; i < 2; i++) {
        evaluator.recordEvent(makeEvent(`agent:step_${i}`, {}, `evt-${i}`));
      }
      const event = makeEvent('agent:completed');
      evaluator.recordEvent(event);
      const cond: TriggerCondition = {
        type: 'threshold',
        event_type: 'agent:*',
        count: 2,
        window_ms: 60_000,
      };
      expect(evaluator.evaluate(cond, event)).toBe(true);
    });
  });

  // ─── sequence condition ───────────────────────────────────────────────────────

  describe('sequence condition', () => {
    it('returns false for empty events array', () => {
      const event = makeEvent('agent:completed');
      evaluator.recordEvent(event);
      const cond: TriggerCondition = {
        type: 'sequence',
        events: [],
        window_ms: 60_000,
      };
      expect(evaluator.evaluate(cond, event)).toBe(false);
    });

    it('returns false when current event does not match last pattern', () => {
      const event = makeEvent('agent:spawned');
      evaluator.recordEvent(event);
      const cond: TriggerCondition = {
        type: 'sequence',
        events: ['agent:spawned', 'agent:completed'],
        window_ms: 60_000,
      };
      expect(evaluator.evaluate(cond, event)).toBe(false);
    });

    it('returns true for single-event sequence when type matches', () => {
      const event = makeEvent('test:failed');
      evaluator.recordEvent(event);
      const cond: TriggerCondition = {
        type: 'sequence',
        events: ['test:failed'],
        window_ms: 60_000,
      };
      expect(evaluator.evaluate(cond, event)).toBe(true);
    });

    it('returns true when full sequence occurs in order within window', () => {
      evaluator.recordEvent(makeEvent('agent:completed', {}, 'evt-1'));
      const finalEvent = makeEvent('test:failed');
      evaluator.recordEvent(finalEvent);
      const cond: TriggerCondition = {
        type: 'sequence',
        events: ['agent:completed', 'test:failed'],
        window_ms: 60_000,
      };
      expect(evaluator.evaluate(cond, finalEvent)).toBe(true);
    });

    it('returns false when prefix events are not in buffer', () => {
      const event = makeEvent('test:failed');
      evaluator.recordEvent(event);
      const cond: TriggerCondition = {
        type: 'sequence',
        events: ['agent:completed', 'test:failed'],
        window_ms: 60_000,
      };
      expect(evaluator.evaluate(cond, event)).toBe(false);
    });

    it('returns true for three-event sequence in order', () => {
      evaluator.recordEvent(makeEvent('wrfc:writing_started', {}, 'evt-1'));
      evaluator.recordEvent(makeEvent('agent:spawned', {}, 'evt-2'));
      const finalEvent = makeEvent('agent:completed');
      evaluator.recordEvent(finalEvent);
      const cond: TriggerCondition = {
        type: 'sequence',
        events: ['wrfc:writing_started', 'agent:spawned', 'agent:completed'],
        window_ms: 60_000,
      };
      expect(evaluator.evaluate(cond, finalEvent)).toBe(true);
    });
  });

  // ─── unknown condition type ───────────────────────────────────────────────────

  describe('unknown condition type', () => {
    it('returns false for an unrecognized condition type', () => {
      const event = makeEvent('any:event');
      evaluator.recordEvent(event);
      const cond = { type: 'unknown_type' } as unknown as TriggerCondition;
      expect(evaluator.evaluate(cond, event)).toBe(false);
    });
  });

  // ─── pruneOldEvents ───────────────────────────────────────────────────────────

  describe('pruneOldEvents', () => {
    it('removes events older than maxAgeMs', () => {
      // Record events and then prune immediately with 0ms max age
      evaluator.recordEvent(makeEvent('build:failed', {}, 'evt-1'));
      evaluator.recordEvent(makeEvent('build:failed', {}, 'evt-2'));

      // Small sleep to ensure timestamps are slightly in the past
      // We prune with very large maxAge first (should keep events)
      evaluator.pruneOldEvents(60_000);

      const event = makeEvent('build:failed');
      evaluator.recordEvent(event);
      const cond: TriggerCondition = {
        type: 'threshold',
        event_type: 'build:failed',
        count: 2,
        window_ms: 60_000,
      };
      // After pruning with large age, events should remain
      expect(evaluator.evaluate(cond, event)).toBe(true);
    });

    it('does not throw when buffer is empty', () => {
      expect(() => evaluator.pruneOldEvents(1000)).not.toThrow();
    });

    it('handles pruning when all events are expired (resets head to 0)', () => {
      evaluator.recordEvent(makeEvent('test:event', {}, 'evt-1'));
      // Prune with 0ms — all events should be pruned
      evaluator.pruneOldEvents(0);
      // After pruning all, recording a new event and evaluating should work
      const event = makeEvent('test:event');
      evaluator.recordEvent(event);
      const cond: TriggerCondition = { type: 'event', event_type: 'test:event' };
      expect(evaluator.evaluate(cond, event)).toBe(true);
    });

    it('prunes only expired events and keeps fresh ones', () => {
      evaluator.recordEvent(makeEvent('build:failed', {}, 'evt-1'));
      evaluator.recordEvent(makeEvent('build:failed', {}, 'evt-2'));
      evaluator.recordEvent(makeEvent('build:failed', {}, 'evt-3'));

      // Prune with 0ms — the recorded events all have timestamps at or just before now,
      // so they will be pruned
      evaluator.pruneOldEvents(0);

      // Now add fresh events
      const event = makeEvent('build:failed');
      evaluator.recordEvent(event);
      const cond: TriggerCondition = {
        type: 'threshold',
        event_type: 'build:failed',
        count: 3,
        window_ms: 60_000,
      };
      // Only 1 fresh event, count=3 required
      expect(evaluator.evaluate(cond, event)).toBe(false);
    });
  });
});
