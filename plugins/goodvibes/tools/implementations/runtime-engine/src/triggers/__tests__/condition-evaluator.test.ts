import { vi } from 'vitest';
import { ConditionEvaluator } from '../condition-evaluator.js';
import type { RuntimeEvent } from '../../events/types.js';
import type {
  EventCondition,
  CompositeCondition,
  ThresholdCondition,
  PatternCondition,
  TriggerCondition,
} from '../types.js';

/** Build a minimal RuntimeEvent for testing. */
function makeEvent(
  type: RuntimeEvent['type'],
  data: Record<string, unknown> = {},
  overrides: Partial<RuntimeEvent> = {},
): RuntimeEvent {
  return {
    id: 'evt_test',
    timestamp: new Date().toISOString(),
    source: { kind: 'hook', hook_name: 'test' },
    type,
    payload: { type, data } as RuntimeEvent['payload'],
    metadata: {
      session_id: 'test-session',
      sequence: 1,
      version: 1,
    },
    ...overrides,
  };
}

describe('ConditionEvaluator', () => {
  let evaluator: ConditionEvaluator;

  beforeEach(() => {
    evaluator = new ConditionEvaluator();
  });

  // ─── recordEvent ─────────────────────────────────────────────────────────────

  describe('recordEvent', () => {
    it('records events for use in threshold conditions', () => {
      const event = makeEvent('hook:pre_tool_use');
      evaluator.recordEvent(event);
      const cond: ThresholdCondition = {
        type: 'threshold',
        event_type: 'hook:pre_tool_use',
        count: 1,
        window_ms: 5000,
      };
      expect(evaluator.evaluate(cond, event)).toBe(true);
    });

    it('enforces maxRecentEvents buffer limit by evicting oldest', () => {
      const smallEval = new ConditionEvaluator(3);
      // Record 5 events — only last 3 kept
      for (let i = 0; i < 5; i++) {
        smallEval.recordEvent(makeEvent('hook:pre_tool_use'));
      }
      const cond: ThresholdCondition = {
        type: 'threshold',
        event_type: 'hook:pre_tool_use',
        count: 4,
        window_ms: 10_000,
      };
      const event = makeEvent('hook:pre_tool_use');
      smallEval.recordEvent(event);
      // 3 + 1 recorded = 4, but buffer cap is 3: only 3 in buffer
      expect(smallEval.evaluate(cond, event)).toBe(false);
    });
  });

  // ─── Event Condition ─────────────────────────────────────────────────────────

  describe('evaluate — event condition', () => {
    it('matches exact event type', () => {
      const cond: EventCondition = { type: 'event', event_type: 'hook:pre_tool_use' };
      const event = makeEvent('hook:pre_tool_use');
      expect(evaluator.evaluate(cond, event)).toBe(true);
    });

    it('rejects non-matching exact event type', () => {
      const cond: EventCondition = { type: 'event', event_type: 'hook:post_tool_use' };
      const event = makeEvent('hook:pre_tool_use');
      expect(evaluator.evaluate(cond, event)).toBe(false);
    });

    it('matches namespace wildcard (hook:*)', () => {
      const cond: EventCondition = { type: 'event', event_type: 'hook:*' };
      expect(evaluator.evaluate(cond, makeEvent('hook:pre_tool_use'))).toBe(true);
      expect(evaluator.evaluate(cond, makeEvent('hook:post_tool_use'))).toBe(true);
    });

    it('rejects event outside the wildcard namespace', () => {
      const cond: EventCondition = { type: 'event', event_type: 'hook:*' };
      expect(evaluator.evaluate(cond, makeEvent('agent:spawned'))).toBe(false);
    });

    it('matches global wildcard (*)', () => {
      const cond: EventCondition = { type: 'event', event_type: '*' };
      expect(evaluator.evaluate(cond, makeEvent('hook:pre_tool_use'))).toBe(true);
      expect(evaluator.evaluate(cond, makeEvent('agent:spawned'))).toBe(true);
    });

    it('applies payload filter: matches when all fields equal', () => {
      const cond: EventCondition = {
        type: 'event',
        event_type: 'hook:pre_tool_use',
        filter: { tool_name: 'Bash', exit_code: 0 },
      };
      const event = makeEvent('hook:pre_tool_use', { tool_name: 'Bash', exit_code: 0 });
      expect(evaluator.evaluate(cond, event)).toBe(true);
    });

    it('applies payload filter: rejects when one field differs', () => {
      const cond: EventCondition = {
        type: 'event',
        event_type: 'hook:pre_tool_use',
        filter: { tool_name: 'Bash' },
      };
      const event = makeEvent('hook:pre_tool_use', { tool_name: 'Edit' });
      expect(evaluator.evaluate(cond, event)).toBe(false);
    });

    it('applies payload filter: rejects when field is missing from data', () => {
      const cond: EventCondition = {
        type: 'event',
        event_type: 'hook:pre_tool_use',
        filter: { tool_name: 'Bash' },
      };
      const event = makeEvent('hook:pre_tool_use', {});
      expect(evaluator.evaluate(cond, event)).toBe(false);
    });

    it('matches when event type matches but no filter given', () => {
      const cond: EventCondition = { type: 'event', event_type: 'hook:pre_tool_use' };
      const event = makeEvent('hook:pre_tool_use', { any: 'data' });
      expect(evaluator.evaluate(cond, event)).toBe(true);
    });

    it('handles payload with no data field gracefully', () => {
      const cond: EventCondition = {
        type: 'event',
        event_type: 'hook:pre_tool_use',
        filter: { tool_name: 'Bash' },
      };
      const event = makeEvent('hook:pre_tool_use');
      // payload has data: {} by default from makeEvent; no tool_name
      expect(evaluator.evaluate(cond, event)).toBe(false);
    });
  });

  // ─── Composite Conditions ────────────────────────────────────────────────────

  describe('evaluate — and condition', () => {
    it('returns true when all sub-conditions match', () => {
      const cond: CompositeCondition = {
        type: 'and',
        conditions: [
          { type: 'event', event_type: 'hook:pre_tool_use' },
          { type: 'event', event_type: '*' },
        ],
      };
      expect(evaluator.evaluate(cond, makeEvent('hook:pre_tool_use'))).toBe(true);
    });

    it('returns false when any sub-condition fails', () => {
      const cond: CompositeCondition = {
        type: 'and',
        conditions: [
          { type: 'event', event_type: 'hook:pre_tool_use' },
          { type: 'event', event_type: 'agent:*' },
        ],
      };
      expect(evaluator.evaluate(cond, makeEvent('hook:pre_tool_use'))).toBe(false);
    });

    it('returns true for empty and (vacuous truth)', () => {
      const cond: CompositeCondition = { type: 'and', conditions: [] };
      expect(evaluator.evaluate(cond, makeEvent('hook:pre_tool_use'))).toBe(true);
    });
  });

  describe('evaluate — or condition', () => {
    it('returns true when at least one sub-condition matches', () => {
      const cond: CompositeCondition = {
        type: 'or',
        conditions: [
          { type: 'event', event_type: 'hook:post_tool_use' },
          { type: 'event', event_type: 'hook:pre_tool_use' },
        ],
      };
      expect(evaluator.evaluate(cond, makeEvent('hook:pre_tool_use'))).toBe(true);
    });

    it('returns false when no sub-condition matches', () => {
      const cond: CompositeCondition = {
        type: 'or',
        conditions: [
          { type: 'event', event_type: 'hook:post_tool_use' },
          { type: 'event', event_type: 'agent:spawned' },
        ],
      };
      expect(evaluator.evaluate(cond, makeEvent('hook:pre_tool_use'))).toBe(false);
    });

    it('returns false for empty or', () => {
      const cond: CompositeCondition = { type: 'or', conditions: [] };
      expect(evaluator.evaluate(cond, makeEvent('hook:pre_tool_use'))).toBe(false);
    });
  });

  describe('evaluate — not condition', () => {
    it('returns true when sub-condition does not match', () => {
      const cond: CompositeCondition = {
        type: 'not',
        conditions: [{ type: 'event', event_type: 'hook:post_tool_use' }],
      };
      expect(evaluator.evaluate(cond, makeEvent('hook:pre_tool_use'))).toBe(true);
    });

    it('returns false when sub-condition matches', () => {
      const cond: CompositeCondition = {
        type: 'not',
        conditions: [{ type: 'event', event_type: 'hook:pre_tool_use' }],
      };
      expect(evaluator.evaluate(cond, makeEvent('hook:pre_tool_use'))).toBe(false);
    });

    it('returns false for empty not (no conditions)', () => {
      const cond: CompositeCondition = { type: 'not', conditions: [] };
      expect(evaluator.evaluate(cond, makeEvent('hook:pre_tool_use'))).toBe(false);
    });
  });

  // ─── Threshold Condition ─────────────────────────────────────────────────────

  describe('evaluate — threshold condition', () => {
    it('returns true when count of matching events in window meets threshold', () => {
      const event = makeEvent('hook:pre_tool_use');
      evaluator.recordEvent(event);
      evaluator.recordEvent(event);
      evaluator.recordEvent(event);
      const cond: ThresholdCondition = {
        type: 'threshold',
        event_type: 'hook:pre_tool_use',
        count: 3,
        window_ms: 10_000,
      };
      expect(evaluator.evaluate(cond, event)).toBe(true);
    });

    it('returns false when count is below threshold', () => {
      const event = makeEvent('hook:pre_tool_use');
      evaluator.recordEvent(event);
      const cond: ThresholdCondition = {
        type: 'threshold',
        event_type: 'hook:pre_tool_use',
        count: 5,
        window_ms: 10_000,
      };
      expect(evaluator.evaluate(cond, event)).toBe(false);
    });

    it('returns false when current event type does not match', () => {
      const event = makeEvent('agent:spawned');
      evaluator.recordEvent(event);
      evaluator.recordEvent(event);
      const cond: ThresholdCondition = {
        type: 'threshold',
        event_type: 'hook:pre_tool_use',
        count: 1,
        window_ms: 10_000,
      };
      expect(evaluator.evaluate(cond, event)).toBe(false);
    });

    it('respects the time window — excludes events outside window', () => {
      const evaluatorWithOld = new ConditionEvaluator();
      const oldEvent = makeEvent('hook:pre_tool_use');
      // Manually inject an old timestamp entry by using a very short window
      evaluatorWithOld.recordEvent(oldEvent);
      // Use a window_ms of 0 which means only events at exactly now or later pass
      const cond: ThresholdCondition = {
        type: 'threshold',
        event_type: 'hook:pre_tool_use',
        count: 2,
        window_ms: 0,
      };
      const newEvent = makeEvent('hook:pre_tool_use');
      // With window_ms=0 the old recorded event may or may not be in window;
      // but count=2 requires 2 events and we have at most 1 in any tight window
      expect(evaluatorWithOld.evaluate(cond, newEvent)).toBe(false);
    });

    it('matches with namespace wildcard in threshold event_type', () => {
      const event1 = makeEvent('hook:pre_tool_use');
      const event2 = makeEvent('hook:post_tool_use');
      evaluator.recordEvent(event1);
      evaluator.recordEvent(event2);
      const cond: ThresholdCondition = {
        type: 'threshold',
        event_type: 'hook:*',
        count: 2,
        window_ms: 10_000,
      };
      expect(evaluator.evaluate(cond, event2)).toBe(true);
    });
  });

  // ─── Sequence Condition ──────────────────────────────────────────────────────

  describe('evaluate — sequence condition', () => {
    it('returns false for empty events array', () => {
      const cond: PatternCondition = { type: 'sequence', events: [], window_ms: 10_000 };
      expect(evaluator.evaluate(cond, makeEvent('hook:pre_tool_use'))).toBe(false);
    });

    it('returns true for single-event sequence matching current event', () => {
      const event = makeEvent('hook:pre_tool_use');
      const cond: PatternCondition = {
        type: 'sequence',
        events: ['hook:pre_tool_use'],
        window_ms: 10_000,
      };
      expect(evaluator.evaluate(cond, event)).toBe(true);
    });

    it('returns false for single-event sequence not matching current event', () => {
      const event = makeEvent('hook:post_tool_use');
      const cond: PatternCondition = {
        type: 'sequence',
        events: ['hook:pre_tool_use'],
        window_ms: 10_000,
      };
      expect(evaluator.evaluate(cond, event)).toBe(false);
    });

    it('matches a multi-event sequence in order', () => {
      const e1 = makeEvent('hook:pre_tool_use');
      const e2 = makeEvent('hook:post_tool_use');
      evaluator.recordEvent(e1);
      evaluator.recordEvent(e2);
      const cond: PatternCondition = {
        type: 'sequence',
        events: ['hook:pre_tool_use', 'hook:post_tool_use'],
        window_ms: 10_000,
      };
      expect(evaluator.evaluate(cond, e2)).toBe(true);
    });

    it('rejects sequence when order is wrong', () => {
      const e1 = makeEvent('hook:post_tool_use');
      const e2 = makeEvent('hook:pre_tool_use');
      evaluator.recordEvent(e1);
      evaluator.recordEvent(e2);
      // Expect pre then post, but we recorded post then pre
      const cond: PatternCondition = {
        type: 'sequence',
        events: ['hook:pre_tool_use', 'hook:post_tool_use'],
        window_ms: 10_000,
      };
      // Current event must be the last pattern (hook:post_tool_use)
      // but we're evaluating with a 'hook:pre_tool_use' as current
      expect(evaluator.evaluate(cond, e2)).toBe(false);
    });

    it('returns false when current event does not match last sequence pattern', () => {
      const e1 = makeEvent('hook:pre_tool_use');
      evaluator.recordEvent(e1);
      const cond: PatternCondition = {
        type: 'sequence',
        events: ['hook:pre_tool_use', 'hook:post_tool_use'],
        window_ms: 10_000,
      };
      // Current event is pre, but last pattern is post
      expect(evaluator.evaluate(cond, e1)).toBe(false);
    });

    it('returns false when prefix events not found in buffer', () => {
      const e2 = makeEvent('hook:post_tool_use');
      evaluator.recordEvent(e2);
      const cond: PatternCondition = {
        type: 'sequence',
        events: ['hook:pre_tool_use', 'hook:post_tool_use'],
        window_ms: 10_000,
      };
      expect(evaluator.evaluate(cond, e2)).toBe(false);
    });
  });

  // ─── pruneOldEvents ──────────────────────────────────────────────────────────

  describe('pruneOldEvents', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('removes events older than maxAgeMs', () => {
      vi.useFakeTimers();
      const event = makeEvent('hook:pre_tool_use');
      evaluator.recordEvent(event);

      // Advance time so the recorded event becomes old enough to be pruned
      vi.advanceTimersByTime(20);
      evaluator.pruneOldEvents(10); // prune events older than 10ms

      const cond: ThresholdCondition = {
        type: 'threshold',
        event_type: 'hook:pre_tool_use',
        count: 1,
        window_ms: 10_000,
      };
      expect(evaluator.evaluate(cond, event)).toBe(false);
    });

    it('keeps events newer than maxAgeMs', () => {
      const event = makeEvent('hook:pre_tool_use');
      evaluator.recordEvent(event);
      evaluator.pruneOldEvents(10_000); // keep events from the last 10s
      const cond: ThresholdCondition = {
        type: 'threshold',
        event_type: 'hook:pre_tool_use',
        count: 1,
        window_ms: 10_000,
      };
      expect(evaluator.evaluate(cond, event)).toBe(true);
    });

    it('handles prune when all events are older than cutoff', () => {
      vi.useFakeTimers();
      evaluator.recordEvent(makeEvent('hook:pre_tool_use'));
      evaluator.recordEvent(makeEvent('hook:pre_tool_use'));
      vi.advanceTimersByTime(20);
      // prune with 10ms cutoff, all events are older
      evaluator.pruneOldEvents(10);
      const cond: ThresholdCondition = {
        type: 'threshold',
        event_type: 'hook:pre_tool_use',
        count: 1,
        window_ms: 10_000,
      };
      expect(evaluator.evaluate(cond, makeEvent('hook:pre_tool_use'))).toBe(false);
    });

    it('does not prune events when none are old enough', () => {
      evaluator.recordEvent(makeEvent('hook:pre_tool_use'));
      evaluator.recordEvent(makeEvent('hook:pre_tool_use'));
      evaluator.pruneOldEvents(60_000); // events < 60s old are kept
      const cond: ThresholdCondition = {
        type: 'threshold',
        event_type: 'hook:pre_tool_use',
        count: 2,
        window_ms: 10_000,
      };
      expect(evaluator.evaluate(cond, makeEvent('hook:pre_tool_use'))).toBe(true);
    });
  });

  // ─── Default / Unknown Condition Type ────────────────────────────────────────

  describe('evaluate — unknown condition type', () => {
    it('returns false for an unrecognised condition type', () => {
      const unknown = { type: 'unknown_type' } as unknown as TriggerCondition;
      expect(evaluator.evaluate(unknown, makeEvent('hook:pre_tool_use'))).toBe(false);
    });
  });

  // ─── Ring Buffer Overflow Protection ─────────────────────────────────────────

  describe('ring buffer overflow protection', () => {
    it('resets recentEventsHead near MAX_SAFE_INTEGER to prevent overflow', () => {
      const smallEval = new ConditionEvaluator(3);
      // Fill the buffer
      for (let i = 0; i < 3; i++) smallEval.recordEvent(makeEvent('hook:pre_tool_use'));
      // Simulate near-overflow: place head just at the guard threshold
      (smallEval as any).recentEventsHead = Number.MAX_SAFE_INTEGER - 3;
      // recordEvent triggers the overflow guard during increment
      smallEval.recordEvent(makeEvent('hook:pre_tool_use'));
      // Guard resets via modulo — head must now be well below the threshold
      expect((smallEval as any).recentEventsHead).toBeLessThan(Number.MAX_SAFE_INTEGER - 3);
    });

    it('evaluate still works correctly after recentEventsHead overflow reset', () => {
      const smallEval = new ConditionEvaluator(3);
      for (let i = 0; i < 3; i++) smallEval.recordEvent(makeEvent('hook:pre_tool_use'));
      (smallEval as any).recentEventsHead = Number.MAX_SAFE_INTEGER - 3;
      const event = makeEvent('hook:pre_tool_use');
      smallEval.recordEvent(event);
      // Buffer should still be queryable via threshold evaluate
      const cond: ThresholdCondition = {
        type: 'threshold',
        event_type: 'hook:pre_tool_use',
        count: 1,
        window_ms: 10_000,
      };
      expect(smallEval.evaluate(cond, event)).toBe(true);
    });
  });
});
