/**
 * types.test.ts — Layer 1 Core Types
 *
 * Tests type guards (isRuntimeEvent, isTrigger, isEventContext)
 * and factory functions (createEvent, createTrigger).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isRuntimeEvent,
  isTrigger,
  isEventContext,
  createEvent,
  createTrigger,
} from '../types.js';
import type { RuntimeEvent, Trigger, EventContext } from '../types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeValidEventPlain(): Record<string, unknown> {
  return {
    id: 'evt_abc',
    source: 'internal',
    type: 'test:event',
    payload: { key: 'value' },
    timestamp: 1_700_000_000_000,
    priority: 5,
  };
}

function makeValidTriggerPlain(): Record<string, unknown> {
  return {
    id: 'trigger_1',
    event_match: { type: 'test:event' },
    actions: [],
    enabled: true,
  };
}

function makeValidContextPlain(): Record<string, unknown> {
  return {
    workflow_id: 'wf_1',
    agent_id: 'agent_1',
    parent_event_id: 'evt_0',
    chain_depth: 2,
  };
}

// ─── isRuntimeEvent ───────────────────────────────────────────────────────────

describe('isRuntimeEvent', () => {
  it('returns true for a valid RuntimeEvent', () => {
    expect(isRuntimeEvent(makeValidEventPlain())).toBe(true);
  });

  it('returns true when payload is null (payload just needs to exist)', () => {
    const e = { ...makeValidEventPlain(), payload: null };
    expect(isRuntimeEvent(e)).toBe(true);
  });

  it('returns true when payload is false (falsy but present)', () => {
    const e = { ...makeValidEventPlain(), payload: false };
    expect(isRuntimeEvent(e)).toBe(true);
  });

  it('returns true when payload is 0', () => {
    const e = { ...makeValidEventPlain(), payload: 0 };
    expect(isRuntimeEvent(e)).toBe(true);
  });

  it('returns true when optional context is present', () => {
    const e = { ...makeValidEventPlain(), context: { chain_depth: 1 } };
    expect(isRuntimeEvent(e)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isRuntimeEvent(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isRuntimeEvent(undefined)).toBe(false);
  });

  it('returns false for a string', () => {
    expect(isRuntimeEvent('event')).toBe(false);
  });

  it('returns false for a number', () => {
    expect(isRuntimeEvent(42)).toBe(false);
  });

  it('returns false when id is missing', () => {
    const e = makeValidEventPlain();
    delete e['id'];
    expect(isRuntimeEvent(e)).toBe(false);
  });

  it('returns false when id is not a string', () => {
    expect(isRuntimeEvent({ ...makeValidEventPlain(), id: 123 })).toBe(false);
  });

  it('returns false when source is missing', () => {
    const e = makeValidEventPlain();
    delete e['source'];
    expect(isRuntimeEvent(e)).toBe(false);
  });

  it('returns false when source is not a string', () => {
    expect(isRuntimeEvent({ ...makeValidEventPlain(), source: 999 })).toBe(false);
  });

  it('returns false when type is missing', () => {
    const e = makeValidEventPlain();
    delete e['type'];
    expect(isRuntimeEvent(e)).toBe(false);
  });

  it('returns false when type is not a string', () => {
    expect(isRuntimeEvent({ ...makeValidEventPlain(), type: true })).toBe(false);
  });

  it('returns false when timestamp is missing', () => {
    const e = makeValidEventPlain();
    delete e['timestamp'];
    expect(isRuntimeEvent(e)).toBe(false);
  });

  it('returns false when timestamp is not a number', () => {
    expect(isRuntimeEvent({ ...makeValidEventPlain(), timestamp: '2024' })).toBe(false);
  });

  it('returns false when priority is missing', () => {
    const e = makeValidEventPlain();
    delete e['priority'];
    expect(isRuntimeEvent(e)).toBe(false);
  });

  it('returns false when priority is not a number', () => {
    expect(isRuntimeEvent({ ...makeValidEventPlain(), priority: 'high' })).toBe(false);
  });

  it('returns false when payload key is missing from the object entirely', () => {
    const e = makeValidEventPlain();
    delete e['payload'];
    expect(isRuntimeEvent(e)).toBe(false);
  });

  it('returns false for an empty object', () => {
    expect(isRuntimeEvent({})).toBe(false);
  });
});

// ─── isTrigger ────────────────────────────────────────────────────────────────

describe('isTrigger', () => {
  it('returns true for a valid Trigger', () => {
    expect(isTrigger(makeValidTriggerPlain())).toBe(true);
  });

  it('returns true when optional fields are present', () => {
    const t = {
      ...makeValidTriggerPlain(),
      max_fires: 10,
      cooldown_ms: 5000,
      priority: 5,
      conditions: [],
    };
    expect(isTrigger(t)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isTrigger(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isTrigger(undefined)).toBe(false);
  });

  it('returns false for a string', () => {
    expect(isTrigger('trigger')).toBe(false);
  });

  it('returns false when id is missing', () => {
    const t = makeValidTriggerPlain();
    delete t['id'];
    expect(isTrigger(t)).toBe(false);
  });

  it('returns false when id is not a string', () => {
    expect(isTrigger({ ...makeValidTriggerPlain(), id: 42 })).toBe(false);
  });

  it('returns false when event_match is missing', () => {
    const t = makeValidTriggerPlain();
    delete t['event_match'];
    expect(isTrigger(t)).toBe(false);
  });

  it('returns false when event_match is null', () => {
    expect(isTrigger({ ...makeValidTriggerPlain(), event_match: null })).toBe(false);
  });

  it('returns false when event_match is not an object', () => {
    expect(isTrigger({ ...makeValidTriggerPlain(), event_match: 'match' })).toBe(false);
  });

  it('returns false when actions is missing', () => {
    const t = makeValidTriggerPlain();
    delete t['actions'];
    expect(isTrigger(t)).toBe(false);
  });

  it('returns false when actions is not an array', () => {
    expect(isTrigger({ ...makeValidTriggerPlain(), actions: {} })).toBe(false);
  });

  it('returns false when enabled is missing', () => {
    const t = makeValidTriggerPlain();
    delete t['enabled'];
    expect(isTrigger(t)).toBe(false);
  });

  it('returns false when enabled is not a boolean', () => {
    expect(isTrigger({ ...makeValidTriggerPlain(), enabled: 1 })).toBe(false);
  });

  it('returns false for an empty object', () => {
    expect(isTrigger({})).toBe(false);
  });
});

// ─── isEventContext ────────────────────────────────────────────────────────────

describe('isEventContext', () => {
  it('returns true for a fully populated EventContext', () => {
    expect(isEventContext(makeValidContextPlain())).toBe(true);
  });

  it('returns true for an empty object (all fields are optional)', () => {
    expect(isEventContext({})).toBe(true);
  });

  it('returns true when only workflow_id is present', () => {
    expect(isEventContext({ workflow_id: 'wf_1' })).toBe(true);
  });

  it('returns true when only agent_id is present', () => {
    expect(isEventContext({ agent_id: 'agent_1' })).toBe(true);
  });

  it('returns true when only chain_depth is present', () => {
    expect(isEventContext({ chain_depth: 0 })).toBe(true);
  });

  it('returns true when only ref is present', () => {
    // ref field exists in EventContext interface (used for cancel by ref)
    expect(isEventContext({ ref: 'cancel-group' })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isEventContext(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isEventContext(undefined)).toBe(false);
  });

  it('returns false for a string', () => {
    expect(isEventContext('context')).toBe(false);
  });

  it('returns false when workflow_id is not a string', () => {
    expect(isEventContext({ workflow_id: 42 })).toBe(false);
  });

  it('returns false when agent_id is not a string', () => {
    expect(isEventContext({ agent_id: true })).toBe(false);
  });

  it('returns false when parent_event_id is not a string', () => {
    expect(isEventContext({ parent_event_id: [] })).toBe(false);
  });

  it('returns false when chain_depth is not a number', () => {
    expect(isEventContext({ chain_depth: '3' })).toBe(false);
  });
});

// ─── createEvent ──────────────────────────────────────────────────────────────

describe('createEvent', () => {
  it('creates an event with provided source, type, payload', () => {
    const event = createEvent({ source: 'human', type: 'user:click', payload: { x: 10 } });
    expect(event.source).toBe('human');
    expect(event.type).toBe('user:click');
    expect(event.payload).toEqual({ x: 10 });
  });

  it('generates a unique id with evt_ prefix when not provided', () => {
    const event = createEvent({ source: 'internal', type: 'test', payload: null });
    expect(event.id).toMatch(/^evt_/);
  });

  it('generates different ids for consecutive calls', () => {
    const e1 = createEvent({ source: 'internal', type: 'test', payload: null });
    const e2 = createEvent({ source: 'internal', type: 'test', payload: null });
    expect(e1.id).not.toBe(e2.id);
  });

  it('defaults priority to 0', () => {
    const event = createEvent({ source: 'internal', type: 'test', payload: null });
    expect(event.priority).toBe(0);
  });

  it('defaults timestamp to approximately now', () => {
    const before = Date.now();
    const event = createEvent({ source: 'internal', type: 'test', payload: null });
    const after = Date.now();
    expect(event.timestamp).toBeGreaterThanOrEqual(before);
    expect(event.timestamp).toBeLessThanOrEqual(after);
  });

  it('allows overriding id', () => {
    const event = createEvent({ source: 'internal', type: 'test', payload: null, id: 'custom_id' });
    expect(event.id).toBe('custom_id');
  });

  it('allows overriding priority', () => {
    const event = createEvent({ source: 'internal', type: 'test', payload: null, priority: 10 });
    expect(event.priority).toBe(10);
  });

  it('allows overriding timestamp', () => {
    const event = createEvent({ source: 'internal', type: 'test', payload: null, timestamp: 12345 });
    expect(event.timestamp).toBe(12345);
  });

  it('allows setting context', () => {
    const context: EventContext = { workflow_id: 'wf_1', chain_depth: 1 };
    const event = createEvent({ source: 'agent', type: 'agent:done', payload: {}, context });
    expect(event.context).toEqual(context);
  });

  it('produces a value that passes isRuntimeEvent', () => {
    const event = createEvent({ source: 'time', type: 'cron:tick', payload: {} });
    expect(isRuntimeEvent(event)).toBe(true);
  });

  it('allows all valid source types', () => {
    const sources = ['time', 'human', 'external', 'internal', 'agent'] as const;
    for (const source of sources) {
      const event = createEvent({ source, type: 'test', payload: null });
      expect(event.source).toBe(source);
    }
  });
});

// ─── createTrigger ────────────────────────────────────────────────────────────

describe('createTrigger', () => {
  const minimalMatch = { type: 'test:event' };
  const minimalActions = [{ type: 'emit_event' as const, params: {} }];

  it('creates a trigger with required fields', () => {
    const trigger = createTrigger({
      id: 't1',
      event_match: minimalMatch,
      actions: minimalActions,
    });
    expect(trigger.id).toBe('t1');
    expect(trigger.event_match).toEqual(minimalMatch);
    expect(trigger.actions).toEqual(minimalActions);
  });

  it('defaults enabled to true', () => {
    const trigger = createTrigger({ id: 't1', event_match: minimalMatch, actions: [] });
    expect(trigger.enabled).toBe(true);
  });

  it('defaults priority to 0', () => {
    const trigger = createTrigger({ id: 't1', event_match: minimalMatch, actions: [] });
    expect(trigger.priority).toBe(0);
  });

  it('allows overriding enabled to false', () => {
    const trigger = createTrigger({ id: 't1', event_match: minimalMatch, actions: [], enabled: false });
    expect(trigger.enabled).toBe(false);
  });

  it('allows overriding priority', () => {
    const trigger = createTrigger({ id: 't1', event_match: minimalMatch, actions: [], priority: 10 });
    expect(trigger.priority).toBe(10);
  });

  it('allows setting max_fires', () => {
    const trigger = createTrigger({ id: 't1', event_match: minimalMatch, actions: [], max_fires: 5 });
    expect(trigger.max_fires).toBe(5);
  });

  it('allows setting cooldown_ms', () => {
    const trigger = createTrigger({ id: 't1', event_match: minimalMatch, actions: [], cooldown_ms: 1000 });
    expect(trigger.cooldown_ms).toBe(1000);
  });

  it('allows setting chain_depth_limit', () => {
    const trigger = createTrigger({ id: 't1', event_match: minimalMatch, actions: [], chain_depth_limit: 3 });
    expect(trigger.chain_depth_limit).toBe(3);
  });

  it('allows setting conditions', () => {
    const conditions = [{ field: 'session.phase', op: 'eq' as const, value: 'active' }];
    const trigger = createTrigger({ id: 't1', event_match: minimalMatch, actions: [], conditions });
    expect(trigger.conditions).toEqual(conditions);
  });

  it('produces a value that passes isTrigger', () => {
    const trigger = createTrigger({ id: 't1', event_match: minimalMatch, actions: [] });
    expect(isTrigger(trigger)).toBe(true);
  });

  it('allows RegExp event_match type', () => {
    const trigger = createTrigger({
      id: 't1',
      event_match: { type: /user:.+/ },
      actions: [],
    });
    expect(trigger.event_match.type).toBeInstanceOf(RegExp);
  });
});
