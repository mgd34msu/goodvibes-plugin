/**
 * trigger-registry.test.ts — Trigger Registry
 *
 * Tests: register/unregister, enable/disable, event type matching
 * (exact, glob, RegExp), source filter, payload matching, condition
 * evaluation, circuit breakers, fire counting, LRU glob cache,
 * priority ordering in match().
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TriggerRegistry } from '../trigger-registry.js';
import type { Trigger, RuntimeEvent, StateStoreInterface } from '../types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTrigger(overrides: Partial<Trigger> & { id: string }): Trigger {
  return {
    event_match: { type: 'test:event' },
    actions: [],
    enabled: true,
    priority: 0,
    ...overrides,
  };
}

let _evtCounter = 0;
function makeEvent(overrides: Partial<RuntimeEvent> = {}): RuntimeEvent {
  return {
    id: overrides.id ?? `evt_${++_evtCounter}`,
    source: overrides.source ?? 'internal',
    type: overrides.type ?? 'test:event',
    payload: overrides.payload ?? null,
    timestamp: overrides.timestamp ?? Date.now(),
    priority: overrides.priority ?? 0,
    ...overrides,
  };
}

// Minimal in-memory state store mock — no filesystem I/O
function makeStore(data: Record<string, unknown> = {}): StateStoreInterface {
  const internal = new Map<string, unknown>(Object.entries(data));
  return {
    get: vi.fn(<T>(key: string): T | null => {
      // Support dot-path traversal for nested state used by conditions
      const parts = key.split('.');
      let cur: unknown = Object.fromEntries(internal);
      for (const part of parts) {
        if (cur === null || typeof cur !== 'object') return null as T;
        cur = (cur as Record<string, unknown>)[part];
      }
      return (cur ?? null) as T;
    }),
    set: vi.fn(<T>(k: string, v: T) => { internal.set(k, v as unknown); }),
    delete: vi.fn((k: string) => { internal.delete(k); }),
    merge: vi.fn(),
    snapshot: vi.fn(() => Object.fromEntries(internal)),
    restore: vi.fn(),
  };
}

// ─── Registration ────────────────────────────────────────────────────────────

describe('TriggerRegistry — registration', () => {
  let registry: TriggerRegistry;

  beforeEach(() => {
    registry = new TriggerRegistry();
  });

  it('registers a trigger and retrieves it by ID', () => {
    const t = makeTrigger({ id: 't1' });
    registry.register(t);
    expect(registry.get('t1')).toEqual(t);
  });

  it('size increases after register', () => {
    registry.register(makeTrigger({ id: 't1' }));
    registry.register(makeTrigger({ id: 't2' }));
    expect(registry.size()).toBe(2);
  });

  it('ids() returns all registered trigger IDs', () => {
    registry.register(makeTrigger({ id: 't1' }));
    registry.register(makeTrigger({ id: 't2' }));
    expect(registry.ids().sort()).toEqual(['t1', 't2']);
  });

  it('throws when registering a duplicate ID', () => {
    registry.register(makeTrigger({ id: 'dup' }));
    expect(() => registry.register(makeTrigger({ id: 'dup' }))).toThrow(/already registered/);
  });

  it('unregister returns true when trigger exists', () => {
    registry.register(makeTrigger({ id: 't1' }));
    expect(registry.unregister('t1')).toBe(true);
  });

  it('unregister removes the trigger', () => {
    registry.register(makeTrigger({ id: 't1' }));
    registry.unregister('t1');
    expect(registry.get('t1')).toBeUndefined();
    expect(registry.size()).toBe(0);
  });

  it('unregister returns false for a non-existent trigger', () => {
    expect(registry.unregister('nonexistent')).toBe(false);
  });

  it('get returns undefined for an unknown ID', () => {
    expect(registry.get('unknown')).toBeUndefined();
  });

  it('size returns 0 when no triggers registered', () => {
    expect(registry.size()).toBe(0);
  });
});

// ─── Enable / Disable ──────────────────────────────────────────────────────────

describe('TriggerRegistry — enable/disable', () => {
  let registry: TriggerRegistry;

  beforeEach(() => {
    registry = new TriggerRegistry();
    registry.register(makeTrigger({ id: 't1', enabled: false }));
  });

  it('enable sets enabled to true', () => {
    registry.enable('t1');
    expect(registry.get('t1')?.enabled).toBe(true);
  });

  it('disable sets enabled to false', () => {
    registry.enable('t1');
    registry.disable('t1');
    expect(registry.get('t1')?.enabled).toBe(false);
  });

  it('enable throws for unknown trigger', () => {
    expect(() => registry.enable('missing')).toThrow(/not found/);
  });

  it('disable throws for unknown trigger', () => {
    expect(() => registry.disable('missing')).toThrow(/not found/);
  });

  it('disabled trigger is not returned by match()', () => {
    const store = makeStore();
    registry.register(makeTrigger({ id: 't2', enabled: false }));
    const matched = registry.match(makeEvent(), store);
    expect(matched.map((t) => t.id)).not.toContain('t2');
  });

  it('enabled trigger is returned by match()', () => {
    registry.enable('t1');
    const store = makeStore();
    const matched = registry.match(makeEvent(), store);
    expect(matched.map((t) => t.id)).toContain('t1');
  });
});

// ─── Event Type Matching ─────────────────────────────────────────────────────────

describe('TriggerRegistry — event type matching', () => {
  let registry: TriggerRegistry;
  let store: CoreStateStore;

  beforeEach(() => {
    registry = new TriggerRegistry();
    store = makeStore();
  });

  it('matches exact string type', () => {
    registry.register(makeTrigger({ id: 't1', event_match: { type: 'user:login' } }));
    const matched = registry.match(makeEvent({ type: 'user:login' }), store);
    expect(matched.map((t) => t.id)).toContain('t1');
  });

  it('does not match different string type', () => {
    registry.register(makeTrigger({ id: 't1', event_match: { type: 'user:login' } }));
    const matched = registry.match(makeEvent({ type: 'user:logout' }), store);
    expect(matched.map((t) => t.id)).not.toContain('t1');
  });

  it('matches RegExp type', () => {
    registry.register(makeTrigger({ id: 't1', event_match: { type: /user:.+/ } }));
    const matched = registry.match(makeEvent({ type: 'user:login' }), store);
    expect(matched.map((t) => t.id)).toContain('t1');
  });

  it('does not match non-matching RegExp', () => {
    registry.register(makeTrigger({ id: 't1', event_match: { type: /^agent:.+/ } }));
    const matched = registry.match(makeEvent({ type: 'user:login' }), store);
    expect(matched.map((t) => t.id)).not.toContain('t1');
  });

  it('matches glob with * wildcard (single segment)', () => {
    registry.register(makeTrigger({ id: 't1', event_match: { type: 'user:*' } }));
    const matched = registry.match(makeEvent({ type: 'user:login' }), store);
    expect(matched.map((t) => t.id)).toContain('t1');
  });

  it('glob * does not match across colons', () => {
    // * matches [^:]+ so 'user:*' should NOT match 'user:foo:bar'
    registry.register(makeTrigger({ id: 't1', event_match: { type: 'user:*' } }));
    const matched = registry.match(makeEvent({ type: 'user:foo:bar' }), store);
    expect(matched.map((t) => t.id)).not.toContain('t1');
  });

  it('matches glob with ** wildcard (any chars)', () => {
    registry.register(makeTrigger({ id: 't1', event_match: { type: 'user:**' } }));
    const matched = registry.match(makeEvent({ type: 'user:foo:bar' }), store);
    expect(matched.map((t) => t.id)).toContain('t1');
  });

  it('glob * wildcard alone matches any type', () => {
    registry.register(makeTrigger({ id: 't1', event_match: { type: '*' } }));
    const matched = registry.match(makeEvent({ type: 'anything:at:all' }), store);
    expect(matched.map((t) => t.id)).toContain('t1');
  });

  it('glob ** wildcard alone matches any type', () => {
    registry.register(makeTrigger({ id: 't1', event_match: { type: '**' } }));
    const matched = registry.match(makeEvent({ type: 'anything:at:all' }), store);
    expect(matched.map((t) => t.id)).toContain('t1');
  });

  it('matchOne returns skip_reason=type for non-matching type', () => {
    const t = makeTrigger({ id: 't1', event_match: { type: 'other:event' } });
    registry.register(t);
    const result = registry.matchOne(t, makeEvent({ type: 'test:event' }), {});
    expect(result.matched).toBe(false);
    expect(result.skip_reason).toBe('type');
  });
});

// ─── Source Filter ────────────────────────────────────────────────────────────

describe('TriggerRegistry — source filter', () => {
  let registry: TriggerRegistry;
  let store: CoreStateStore;

  beforeEach(() => {
    registry = new TriggerRegistry();
    store = makeStore();
  });

  it('matches when source matches single source filter', () => {
    registry.register(makeTrigger({ id: 't1', event_match: { type: 'test:event', source: 'human' } }));
    const matched = registry.match(makeEvent({ source: 'human' }), store);
    expect(matched.map((t) => t.id)).toContain('t1');
  });

  it('does not match when source does not match single source filter', () => {
    registry.register(makeTrigger({ id: 't1', event_match: { type: 'test:event', source: 'human' } }));
    const matched = registry.match(makeEvent({ source: 'internal' }), store);
    expect(matched.map((t) => t.id)).not.toContain('t1');
  });

  it('matches when source is in array source filter', () => {
    registry.register(makeTrigger({ id: 't1', event_match: { type: 'test:event', source: ['human', 'agent'] } }));
    const matched = registry.match(makeEvent({ source: 'agent' }), store);
    expect(matched.map((t) => t.id)).toContain('t1');
  });

  it('does not match when source is not in array source filter', () => {
    registry.register(makeTrigger({ id: 't1', event_match: { type: 'test:event', source: ['human', 'agent'] } }));
    const matched = registry.match(makeEvent({ source: 'time' }), store);
    expect(matched.map((t) => t.id)).not.toContain('t1');
  });

  it('matchOne returns skip_reason=source for non-matching source', () => {
    const t = makeTrigger({ id: 't1', event_match: { type: 'test:event', source: 'human' } });
    registry.register(t);
    const result = registry.matchOne(t, makeEvent({ source: 'internal' }), {});
    expect(result.matched).toBe(false);
    expect(result.skip_reason).toBe('source');
  });
});

// ─── Payload Matching ──────────────────────────────────────────────────────────

describe('TriggerRegistry — payload matching', () => {
  let registry: TriggerRegistry;
  let store: CoreStateStore;

  beforeEach(() => {
    registry = new TriggerRegistry();
    store = makeStore();
  });

  it('matches flat payload field equality', () => {
    registry.register(makeTrigger({
      id: 't1',
      event_match: { type: 'test:event', payload_match: { status: 'ok' } },
    }));
    const matched = registry.match(makeEvent({ payload: { status: 'ok', extra: 1 } }), store);
    expect(matched.map((t) => t.id)).toContain('t1');
  });

  it('does not match when payload field differs', () => {
    registry.register(makeTrigger({
      id: 't1',
      event_match: { type: 'test:event', payload_match: { status: 'ok' } },
    }));
    const matched = registry.match(makeEvent({ payload: { status: 'fail' } }), store);
    expect(matched.map((t) => t.id)).not.toContain('t1');
  });

  it('matches nested payload object', () => {
    registry.register(makeTrigger({
      id: 't1',
      event_match: { type: 'test:event', payload_match: { user: { role: 'admin' } } },
    }));
    const matched = registry.match(makeEvent({ payload: { user: { id: 1, role: 'admin' } } }), store);
    expect(matched.map((t) => t.id)).toContain('t1');
  });

  it('does not match when nested payload value differs', () => {
    registry.register(makeTrigger({
      id: 't1',
      event_match: { type: 'test:event', payload_match: { user: { role: 'admin' } } },
    }));
    const matched = registry.match(makeEvent({ payload: { user: { role: 'viewer' } } }), store);
    expect(matched.map((t) => t.id)).not.toContain('t1');
  });

  it('matches array payload field by value equality', () => {
    registry.register(makeTrigger({
      id: 't1',
      event_match: { type: 'test:event', payload_match: { tags: ['a', 'b'] } },
    }));
    const matched = registry.match(makeEvent({ payload: { tags: ['a', 'b'] } }), store);
    expect(matched.map((t) => t.id)).toContain('t1');
  });

  it('does not match when array payload differs', () => {
    registry.register(makeTrigger({
      id: 't1',
      event_match: { type: 'test:event', payload_match: { tags: ['a', 'b'] } },
    }));
    const matched = registry.match(makeEvent({ payload: { tags: ['a', 'c'] } }), store);
    expect(matched.map((t) => t.id)).not.toContain('t1');
  });

  it('does not match when payload is not an object', () => {
    registry.register(makeTrigger({
      id: 't1',
      event_match: { type: 'test:event', payload_match: { key: 'val' } },
    }));
    const matched = registry.match(makeEvent({ payload: null }), store);
    expect(matched.map((t) => t.id)).not.toContain('t1');
  });

  it('matchOne returns skip_reason=payload for non-matching payload', () => {
    const t = makeTrigger({
      id: 't1',
      event_match: { type: 'test:event', payload_match: { key: 'expected' } },
    });
    registry.register(t);
    const result = registry.matchOne(t, makeEvent({ payload: { key: 'wrong' } }), {});
    expect(result.matched).toBe(false);
    expect(result.skip_reason).toBe('payload');
  });
});

// ─── Condition Evaluation ────────────────────────────────────────────────────────

describe('TriggerRegistry — condition evaluation', () => {
  let registry: TriggerRegistry;

  beforeEach(() => {
    registry = new TriggerRegistry();
  });

  function triggerWithConditions(id: string, conditions: Trigger['conditions']): Trigger {
    const t = makeTrigger({ id, conditions });
    registry.register(t);
    return t;
  }

  it('eq: matches when field equals value', () => {
    const t = triggerWithConditions('t1', [{ field: 'session.phase', op: 'eq', value: 'active' }]);
    const result = registry.matchOne(t, makeEvent(), { session: { phase: 'active' } });
    expect(result.matched).toBe(true);
  });

  it('eq: does not match when field differs', () => {
    const t = triggerWithConditions('t1', [{ field: 'session.phase', op: 'eq', value: 'active' }]);
    const result = registry.matchOne(t, makeEvent(), { session: { phase: 'idle' } });
    expect(result.matched).toBe(false);
    expect(result.skip_reason).toBe('conditions');
  });

  it('neq: matches when field does not equal value', () => {
    const t = triggerWithConditions('t2', [{ field: 'phase', op: 'neq', value: 'stopped' }]);
    const result = registry.matchOne(t, makeEvent(), { phase: 'running' });
    expect(result.matched).toBe(true);
  });

  it('neq: does not match when field equals value', () => {
    const t = triggerWithConditions('t2', [{ field: 'phase', op: 'neq', value: 'stopped' }]);
    const result = registry.matchOne(t, makeEvent(), { phase: 'stopped' });
    expect(result.matched).toBe(false);
  });

  it('gt: matches when field > value', () => {
    const t = triggerWithConditions('t3', [{ field: 'count', op: 'gt', value: 5 }]);
    const result = registry.matchOne(t, makeEvent(), { count: 6 });
    expect(result.matched).toBe(true);
  });

  it('gt: does not match when field <= value', () => {
    const t = triggerWithConditions('t3', [{ field: 'count', op: 'gt', value: 5 }]);
    expect(registry.matchOne(t, makeEvent(), { count: 5 }).matched).toBe(false);
    expect(registry.matchOne(t, makeEvent(), { count: 4 }).matched).toBe(false);
  });

  it('gt: does not match when field is not a number', () => {
    const t = triggerWithConditions('t3n', [{ field: 'count', op: 'gt', value: 5 }]);
    const result = registry.matchOne(t, makeEvent(), { count: 'ten' });
    expect(result.matched).toBe(false);
  });

  it('lt: matches when field < value', () => {
    const t = triggerWithConditions('t4', [{ field: 'count', op: 'lt', value: 10 }]);
    const result = registry.matchOne(t, makeEvent(), { count: 3 });
    expect(result.matched).toBe(true);
  });

  it('lt: does not match when field >= value', () => {
    const t = triggerWithConditions('t4', [{ field: 'count', op: 'lt', value: 10 }]);
    expect(registry.matchOne(t, makeEvent(), { count: 10 }).matched).toBe(false);
    expect(registry.matchOne(t, makeEvent(), { count: 11 }).matched).toBe(false);
  });

  it('gte: matches when field >= value', () => {
    const t = triggerWithConditions('t5', [{ field: 'n', op: 'gte', value: 5 }]);
    expect(registry.matchOne(t, makeEvent(), { n: 5 }).matched).toBe(true);
    expect(registry.matchOne(t, makeEvent(), { n: 6 }).matched).toBe(true);
  });

  it('gte: does not match when field < value', () => {
    const t = triggerWithConditions('t5', [{ field: 'n', op: 'gte', value: 5 }]);
    expect(registry.matchOne(t, makeEvent(), { n: 4 }).matched).toBe(false);
  });

  it('lte: matches when field <= value', () => {
    const t = triggerWithConditions('t6', [{ field: 'n', op: 'lte', value: 5 }]);
    expect(registry.matchOne(t, makeEvent(), { n: 5 }).matched).toBe(true);
    expect(registry.matchOne(t, makeEvent(), { n: 4 }).matched).toBe(true);
  });

  it('lte: does not match when field > value', () => {
    const t = triggerWithConditions('t6', [{ field: 'n', op: 'lte', value: 5 }]);
    expect(registry.matchOne(t, makeEvent(), { n: 6 }).matched).toBe(false);
  });

  it('in: matches when field value is in expected array', () => {
    const t = triggerWithConditions('t7', [{ field: 'role', op: 'in', value: ['admin', 'mod'] }]);
    expect(registry.matchOne(t, makeEvent(), { role: 'admin' }).matched).toBe(true);
    expect(registry.matchOne(t, makeEvent(), { role: 'mod' }).matched).toBe(true);
  });

  it('in: does not match when field is not in expected array', () => {
    const t = triggerWithConditions('t7', [{ field: 'role', op: 'in', value: ['admin', 'mod'] }]);
    expect(registry.matchOne(t, makeEvent(), { role: 'viewer' }).matched).toBe(false);
  });

  it('in: does not match when value is not an array', () => {
    const t = triggerWithConditions('t7n', [{ field: 'role', op: 'in', value: 'admin' }]);
    expect(registry.matchOne(t, makeEvent(), { role: 'admin' }).matched).toBe(false);
  });

  it('exists: matches when field is present and non-null', () => {
    const t = triggerWithConditions('t8', [{ field: 'session', op: 'exists', value: null }]);
    expect(registry.matchOne(t, makeEvent(), { session: 'active' }).matched).toBe(true);
  });

  it('exists: does not match when field is undefined', () => {
    const t = triggerWithConditions('t8', [{ field: 'session', op: 'exists', value: null }]);
    expect(registry.matchOne(t, makeEvent(), {}).matched).toBe(false);
  });

  it('exists: does not match when field is null', () => {
    const t = triggerWithConditions('t8', [{ field: 'session', op: 'exists', value: null }]);
    expect(registry.matchOne(t, makeEvent(), { session: null }).matched).toBe(false);
  });

  it('multiple conditions: all must pass (AND semantics)', () => {
    const t = triggerWithConditions('t9', [
      { field: 'count', op: 'gt', value: 0 },
      { field: 'phase', op: 'eq', value: 'active' },
    ]);
    expect(registry.matchOne(t, makeEvent(), { count: 5, phase: 'active' }).matched).toBe(true);
    expect(registry.matchOne(t, makeEvent(), { count: 5, phase: 'idle' }).matched).toBe(false);
    expect(registry.matchOne(t, makeEvent(), { count: 0, phase: 'active' }).matched).toBe(false);
  });

  it('dot-path traversal: resolves nested state paths', () => {
    const t = triggerWithConditions('t10', [{ field: 'a.b.c', op: 'eq', value: 42 }]);
    expect(registry.matchOne(t, makeEvent(), { a: { b: { c: 42 } } }).matched).toBe(true);
    expect(registry.matchOne(t, makeEvent(), { a: { b: { c: 99 } } }).matched).toBe(false);
  });

  it('dot-path traversal: returns undefined for missing intermediate segment', () => {
    const t = triggerWithConditions('t11', [{ field: 'a.b.missing', op: 'exists', value: null }]);
    expect(registry.matchOne(t, makeEvent(), { a: { b: {} } }).matched).toBe(false);
  });
});

// ─── Circuit Breakers ───────────────────────────────────────────────────────────

describe('TriggerRegistry — circuit breakers', () => {
  let registry: TriggerRegistry;

  beforeEach(() => {
    registry = new TriggerRegistry();
  });

  describe('max_fires', () => {
    it('fires normally when fire_count < max_fires', () => {
      const t = makeTrigger({ id: 't1', max_fires: 2 });
      registry.register(t);
      const result = registry.matchOne(t, makeEvent(), {});
      expect(result.matched).toBe(true);
    });

    it('blocks when fire_count >= max_fires', () => {
      const t = makeTrigger({ id: 't1', max_fires: 2 });
      registry.register(t);
      registry.recordFire('t1');
      registry.recordFire('t1');
      const result = registry.matchOne(t, makeEvent(), {});
      expect(result.matched).toBe(false);
      expect(result.skip_reason).toBe('max_fires');
    });

    it('max_fires=0 is treated as unlimited', () => {
      const t = makeTrigger({ id: 't1', max_fires: 0 });
      registry.register(t);
      for (let i = 0; i < 100; i++) registry.recordFire('t1');
      expect(registry.matchOne(t, makeEvent(), {}).matched).toBe(true);
    });

    it('max_fires=undefined is treated as unlimited', () => {
      const t = makeTrigger({ id: 't1' }); // no max_fires
      registry.register(t);
      for (let i = 0; i < 10; i++) registry.recordFire('t1');
      expect(registry.matchOne(t, makeEvent(), {}).matched).toBe(true);
    });
  });

  describe('cooldown_ms', () => {
    it('fires normally when no previous fire', () => {
      const t = makeTrigger({ id: 't1', cooldown_ms: 5000 });
      registry.register(t);
      expect(registry.matchOne(t, makeEvent(), {}).matched).toBe(true);
    });

    it('blocks when within cooldown window', () => {
      vi.useFakeTimers();
      const t = makeTrigger({ id: 't1', cooldown_ms: 5000 });
      registry.register(t);
      registry.recordFire('t1'); // sets last_fired_at = now
      vi.advanceTimersByTime(100); // only 100ms elapsed
      const result = registry.matchOne(t, makeEvent(), {});
      expect(result.matched).toBe(false);
      expect(result.skip_reason).toBe('cooldown');
      vi.useRealTimers();
    });

    it('allows firing after cooldown expires', () => {
      vi.useFakeTimers();
      const t = makeTrigger({ id: 't1', cooldown_ms: 1000 });
      registry.register(t);
      registry.recordFire('t1');
      vi.advanceTimersByTime(1001);
      expect(registry.matchOne(t, makeEvent(), {}).matched).toBe(true);
      vi.useRealTimers();
    });
  });

  describe('chain_depth_limit', () => {
    it('fires when event chain depth is within limit', () => {
      const t = makeTrigger({ id: 't1', chain_depth_limit: 3 });
      registry.register(t);
      const event = makeEvent({ context: { chain_depth: 3 } });
      expect(registry.matchOne(t, event, {}).matched).toBe(true);
    });

    it('blocks when event chain depth exceeds limit', () => {
      const t = makeTrigger({ id: 't1', chain_depth_limit: 3 });
      registry.register(t);
      const event = makeEvent({ context: { chain_depth: 4 } });
      const result = registry.matchOne(t, event, {});
      expect(result.matched).toBe(false);
      expect(result.skip_reason).toBe('chain_depth');
    });

    it('defaults chain_depth to 0 when context is absent', () => {
      const t = makeTrigger({ id: 't1', chain_depth_limit: 0 });
      registry.register(t);
      const event = makeEvent(); // no context
      expect(registry.matchOne(t, event, {}).matched).toBe(true);
    });
  });
});

// ─── Fire Count and Reset ──────────────────────────────────────────────────────

describe('TriggerRegistry — fire counting and reset', () => {
  let registry: TriggerRegistry;

  beforeEach(() => {
    registry = new TriggerRegistry();
    registry.register(makeTrigger({ id: 't1' }));
    registry.register(makeTrigger({ id: 't2' }));
  });

  it('getFireCount returns 0 initially', () => {
    expect(registry.getFireCount('t1')).toBe(0);
  });

  it('recordFire increments fire_count', () => {
    registry.recordFire('t1');
    registry.recordFire('t1');
    expect(registry.getFireCount('t1')).toBe(2);
  });

  it('recordFire on unknown trigger is a no-op (no throw)', () => {
    expect(() => registry.recordFire('unknown')).not.toThrow();
  });

  it('getFireCount returns 0 for unknown trigger', () => {
    expect(registry.getFireCount('nonexistent')).toBe(0);
  });

  it('resetAllFireCounts resets all triggers to 0', () => {
    registry.recordFire('t1');
    registry.recordFire('t1');
    registry.recordFire('t2');
    registry.resetAllFireCounts();
    expect(registry.getFireCount('t1')).toBe(0);
    expect(registry.getFireCount('t2')).toBe(0);
  });

  it('resetFireCount resets a single trigger to 0', () => {
    registry.recordFire('t1');
    registry.recordFire('t1');
    registry.recordFire('t2');
    registry.resetFireCount('t1');
    expect(registry.getFireCount('t1')).toBe(0);
    expect(registry.getFireCount('t2')).toBe(1); // unchanged
  });

  it('resetFireCount throws for unknown trigger', () => {
    expect(() => registry.resetFireCount('unknown')).toThrow(/not found/);
  });

  it('resetAllFireCounts also resets last_fired_at (cooldown unblocked)', () => {
    vi.useFakeTimers();
    const t = makeTrigger({ id: 't3', cooldown_ms: 60_000 });
    registry.register(t);
    registry.recordFire('t3');
    // Immediately within cooldown
    expect(registry.matchOne(t, makeEvent(), {}).matched).toBe(false);
    registry.resetAllFireCounts();
    // After reset, last_fired_at=0, should not be blocked by cooldown
    expect(registry.matchOne(t, makeEvent(), {}).matched).toBe(true);
    vi.useRealTimers();
  });
});

// ─── Priority Ordering in match() ────────────────────────────────────────────────

describe('TriggerRegistry — priority ordering in match()', () => {
  it('returns matched triggers sorted by priority descending', () => {
    const registry = new TriggerRegistry();
    const store = makeStore();
    registry.register(makeTrigger({ id: 'low', priority: 1 }));
    registry.register(makeTrigger({ id: 'high', priority: 10 }));
    registry.register(makeTrigger({ id: 'med', priority: 5 }));

    const matched = registry.match(makeEvent(), store);
    expect(matched.map((t) => t.id)).toEqual(['high', 'med', 'low']);
  });

  it('triggers with undefined priority default to 0', () => {
    const registry = new TriggerRegistry();
    const store = makeStore();
    // Create trigger with no priority set (override createTrigger default)
    const t = {
      id: 'no_pri',
      event_match: { type: 'test:event' },
      actions: [],
      enabled: true,
    };
    registry.register(t);
    registry.register(makeTrigger({ id: 'high', priority: 5 }));
    const matched = registry.match(makeEvent(), store);
    expect(matched[0]?.id).toBe('high');
    expect(matched[1]?.id).toBe('no_pri');
  });
});

// ─── LRU Glob Cache ───────────────────────────────────────────────────────────

describe('TriggerRegistry — LRU glob cache', () => {
  it('reuses compiled regex for repeated glob patterns', () => {
    // Test that globs work correctly across multiple calls (cache doesn't corrupt results)
    const registry = new TriggerRegistry();
    const store = makeStore();
    registry.register(makeTrigger({ id: 't1', event_match: { type: 'user:*' } }));

    // Match multiple times to exercise cache hit path
    for (let i = 0; i < 5; i++) {
      const matched = registry.match(makeEvent({ type: 'user:login' }), store);
      expect(matched.map((t) => t.id)).toContain('t1');
    }
  });

  it('different glob patterns produce correct independent results', () => {
    const registry = new TriggerRegistry();
    const store = makeStore();
    registry.register(makeTrigger({ id: 't_user', event_match: { type: 'user:*' } }));
    registry.register(makeTrigger({ id: 't_agent', event_match: { type: 'agent:*' } }));

    const userMatched = registry.match(makeEvent({ type: 'user:click' }), store);
    expect(userMatched.map((t) => t.id)).toContain('t_user');
    expect(userMatched.map((t) => t.id)).not.toContain('t_agent');

    const agentMatched = registry.match(makeEvent({ type: 'agent:spawned' }), store);
    expect(agentMatched.map((t) => t.id)).toContain('t_agent');
    expect(agentMatched.map((t) => t.id)).not.toContain('t_user');
  });

  it('evicts LRU entries when more than 500 distinct glob patterns are used', () => {
    // Register 510 triggers each with a unique glob pattern to force LRU eviction
    const registry = new TriggerRegistry();
    const store = makeStore();
    for (let i = 0; i < 510; i++) {
      registry.register(makeTrigger({ id: `t${i}`, event_match: { type: `ns${i}:*` } }));
    }
    // The first 10 patterns should have been evicted from the LRU cache by now.
    // Matching against a surviving pattern should still work correctly.
    const matched = registry.match(makeEvent({ type: 'ns509:action' }), store);
    expect(matched.map((t) => t.id)).toContain('t509');
    // Matching against one of the evicted patterns should recompile and still work
    const matched2 = registry.match(makeEvent({ type: 'ns0:action' }), store);
    expect(matched2.map((t) => t.id)).toContain('t0');
  });
});
