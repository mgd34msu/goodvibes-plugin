import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TriggerRegistry } from '../trigger-registry.js';
import type { TriggerDefinition } from '../types.js';
import type { TriggersConfig } from '../../../shared/config.js';
import type { RuntimeEvent } from '../../events/types.js';

// Mock logger
vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock utils
vi.mock('../../../shared/utils.js', () => ({
  generateEventId: () => 'generated-id',
  timestamp: () => 1000000,
  toErrorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}));

// Mock legacy-directive-builder
vi.mock('../../directives/legacy-directive-builder.js', () => ({
  buildSpawnDirectiveMessage: () => 'mock-directive-message',
}));

const DEFAULT_CONFIG: TriggersConfig = {
  max_triggers: 50,
  default_cooldown_ms: 0,
  max_fires_per_session: 10,
  handler_timeout_ms: 30_000,
};

function makeTrigger(overrides: Partial<TriggerDefinition> = {}): TriggerDefinition {
  return {
    id: 'trigger-1',
    name: 'Test Trigger',
    description: 'A test trigger',
    enabled: true,
    priority: 10,
    condition: { type: 'event', event_type: 'test:event' as never },
    action: { type: 'emit_event', event_type: 'test:emitted' as never, payload_template: {} },
    fires_count: 0,
    ...overrides,
  };
}

function makeEvent(type: string, data: Record<string, unknown> = {}, id = 'evt-1'): RuntimeEvent {
  return {
    id,
    type: type as RuntimeEvent['type'],
    timestamp: new Date().toISOString(),
    source: { kind: 'system' } as RuntimeEvent['source'],
    payload: {
      type: type as RuntimeEvent['payload']['type'],
      data,
    } as RuntimeEvent['payload'],
    metadata: { sequence: 1, version: 1, session_id: '' },
  };
}

describe('TriggerRegistry', () => {
  let registry: TriggerRegistry;

  beforeEach(() => {
    registry = new TriggerRegistry(DEFAULT_CONFIG);
  });

  // ─── register ────────────────────────────────────────────────────────────────

  describe('register', () => {
    it('registers a trigger and makes it accessible via get()', () => {
      const trigger = makeTrigger();
      registry.register(trigger);
      expect(registry.get('trigger-1')).toBe(trigger);
    });

    it('returns undefined for an unregistered trigger ID', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });

    it('registers multiple triggers with unique IDs', () => {
      registry.register(makeTrigger({ id: 't1' }));
      registry.register(makeTrigger({ id: 't2' }));
      expect(registry.get('t1')).toBeDefined();
      expect(registry.get('t2')).toBeDefined();
    });

    it('overwrites an existing trigger with the same ID (last write wins)', () => {
      const first = makeTrigger({ name: 'First' });
      const second = makeTrigger({ name: 'Second' });
      registry.register(first);
      registry.register(second);
      expect(registry.get('trigger-1')?.name).toBe('Second');
    });

    it('throws QueueError when max_triggers limit is exceeded', () => {
      const smallRegistry = new TriggerRegistry({ ...DEFAULT_CONFIG, max_triggers: 2 });
      smallRegistry.register(makeTrigger({ id: 't1' }));
      smallRegistry.register(makeTrigger({ id: 't2' }));
      expect(() => smallRegistry.register(makeTrigger({ id: 't3' }))).toThrow();
    });

    it('includes trigger ID in the limit error message', () => {
      const smallRegistry = new TriggerRegistry({ ...DEFAULT_CONFIG, max_triggers: 1 });
      smallRegistry.register(makeTrigger({ id: 't1' }));
      expect(() => smallRegistry.register(makeTrigger({ id: 't2' }))).toThrow('t2');
    });

    it('allows registration up to the exact max_triggers limit', () => {
      const smallRegistry = new TriggerRegistry({ ...DEFAULT_CONFIG, max_triggers: 3 });
      smallRegistry.register(makeTrigger({ id: 't1' }));
      smallRegistry.register(makeTrigger({ id: 't2' }));
      expect(() => smallRegistry.register(makeTrigger({ id: 't3' }))).not.toThrow();
    });
  });

  // ─── unregister ───────────────────────────────────────────────────────────

  describe('unregister', () => {
    it('removes a registered trigger', () => {
      registry.register(makeTrigger());
      registry.unregister('trigger-1');
      expect(registry.get('trigger-1')).toBeUndefined();
    });

    it('is a no-op when trigger does not exist', () => {
      expect(() => registry.unregister('nonexistent')).not.toThrow();
    });

    it('frees up capacity for new registrations after unregister', () => {
      const smallRegistry = new TriggerRegistry({ ...DEFAULT_CONFIG, max_triggers: 1 });
      smallRegistry.register(makeTrigger({ id: 't1' }));
      smallRegistry.unregister('t1');
      expect(() => smallRegistry.register(makeTrigger({ id: 't2' }))).not.toThrow();
    });
  });

  // ─── setEnabled ───────────────────────────────────────────────────────────

  describe('setEnabled', () => {
    it('disables a trigger', () => {
      registry.register(makeTrigger({ enabled: true }));
      registry.setEnabled('trigger-1', false);
      expect(registry.get('trigger-1')?.enabled).toBe(false);
    });

    it('enables a disabled trigger', () => {
      registry.register(makeTrigger({ enabled: false }));
      registry.setEnabled('trigger-1', true);
      expect(registry.get('trigger-1')?.enabled).toBe(true);
    });

    it('is a no-op (no throw) when trigger does not exist', () => {
      expect(() => registry.setEnabled('nonexistent', false)).not.toThrow();
    });
  });

  // ─── list ─────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('returns an empty array when no triggers are registered', () => {
      expect(registry.list()).toEqual([]);
    });

    it('returns all registered triggers', () => {
      registry.register(makeTrigger({ id: 't1' }));
      registry.register(makeTrigger({ id: 't2' }));
      const triggers = registry.list();
      expect(triggers).toHaveLength(2);
      const ids = triggers.map((t) => t.id);
      expect(ids).toContain('t1');
      expect(ids).toContain('t2');
    });

    it('does not include unregistered triggers', () => {
      registry.register(makeTrigger({ id: 't1' }));
      registry.register(makeTrigger({ id: 't2' }));
      registry.unregister('t1');
      const triggers = registry.list();
      expect(triggers).toHaveLength(1);
      expect(triggers[0].id).toBe('t2');
    });
  });

  // ─── getActionExecutor ───────────────────────────────────────────────────────

  describe('getActionExecutor', () => {
    it('returns an object with a registerHandler method', () => {
      const executor = registry.getActionExecutor();
      expect(typeof executor.registerHandler).toBe('function');
    });
  });

  // ─── registerHandler ────────────────────────────────────────────────────────

  describe('registerHandler', () => {
    it('registers a handler that can be invoked via evaluate', async () => {
      const handlerFn = vi.fn().mockResolvedValue(undefined);
      registry.registerHandler('myHandler', handlerFn);
      registry.register(
        makeTrigger({
          action: {
            type: 'invoke_handler',
            handler: 'myHandler',
            args_template: {},
          },
        }),
      );
      const event = makeEvent('test:event');
      const results = await registry.evaluate(event);
      expect(results[0].fired).toBe(true);
      expect(handlerFn).toHaveBeenCalledOnce();
    });

    it('handler survives setDependencies() call', async () => {
      const handlerFn = vi.fn().mockResolvedValue(undefined);
      registry.registerHandler('persistentHandler', handlerFn);
      // Replace the executor via setDependencies
      const mockBus = { emit: vi.fn() };
      registry.setDependencies(mockBus as any);
      // Handler should still be accessible after setDependencies
      registry.register(
        makeTrigger({
          action: {
            type: 'invoke_handler',
            handler: 'persistentHandler',
            args_template: {},
          },
        }),
      );
      const event = makeEvent('test:event');
      const results = await registry.evaluate(event);
      expect(results[0].fired).toBe(true);
      expect(handlerFn).toHaveBeenCalledOnce();
    });
  });

  // ─── evaluate ─────────────────────────────────────────────────────────────

  describe('evaluate', () => {
    it('returns empty array when no triggers are registered', async () => {
      const event = makeEvent('test:event');
      const results = await registry.evaluate(event);
      expect(results).toEqual([]);
    });

    it('returns result with fired=true when condition is met', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      registry.registerHandler('h1', handler);
      registry.register(
        makeTrigger({
          action: { type: 'invoke_handler', handler: 'h1', args_template: {} },
        }),
      );
      const event = makeEvent('test:event');
      const results = await registry.evaluate(event);
      expect(results).toHaveLength(1);
      expect(results[0].fired).toBe(true);
      expect(results[0].trigger_id).toBe('trigger-1');
    });

    it('returns result with fired=false when condition is not met', async () => {
      registry.register(makeTrigger({ condition: { type: 'event', event_type: 'different:event' as never } }));
      const event = makeEvent('test:event');
      const results = await registry.evaluate(event);
      expect(results).toHaveLength(1);
      expect(results[0].fired).toBe(false);
    });

    it('skips disabled triggers (not included in results)', async () => {
      registry.register(makeTrigger({ enabled: false }));
      const event = makeEvent('test:event');
      const results = await registry.evaluate(event);
      // Disabled triggers are filtered out before evaluation
      expect(results).toHaveLength(0);
    });

    it('evaluates triggers in priority order (lower priority number first)', async () => {
      const callOrder: string[] = [];
      registry.registerHandler('handlerA', async () => { callOrder.push('A'); });
      registry.registerHandler('handlerB', async () => { callOrder.push('B'); });
      registry.register(
        makeTrigger({
          id: 'high-priority',
          priority: 5,
          action: { type: 'invoke_handler', handler: 'handlerA', args_template: {} },
        }),
      );
      registry.register(
        makeTrigger({
          id: 'low-priority',
          priority: 100,
          action: { type: 'invoke_handler', handler: 'handlerB', args_template: {} },
        }),
      );
      const event = makeEvent('test:event');
      await registry.evaluate(event);
      expect(callOrder[0]).toBe('A');
      expect(callOrder[1]).toBe('B');
    });

    it('skips trigger due to cooldown when fired too recently', async () => {
      const trigger = makeTrigger({
        cooldown_ms: 5000,
        last_fired: Date.now() - 100, // fired 100ms ago, within 5000ms cooldown
      });
      registry.register(trigger);
      const event = makeEvent('test:event');
      const results = await registry.evaluate(event);
      expect(results[0].fired).toBe(false);
      expect(results[0].skipped_reason).toBe('cooldown');
    });

    it('fires trigger when cooldown has elapsed', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      registry.registerHandler('cooldownHandler', handler);
      const trigger = makeTrigger({
        cooldown_ms: 100,
        last_fired: Date.now() - 200, // fired 200ms ago, beyond 100ms cooldown
        action: { type: 'invoke_handler', handler: 'cooldownHandler', args_template: {} },
      });
      registry.register(trigger);
      const event = makeEvent('test:event');
      const results = await registry.evaluate(event);
      expect(results[0].fired).toBe(true);
    });

    it('skips trigger due to max_fires when fire count is exhausted', async () => {
      const trigger = makeTrigger({ max_fires: 3, fires_count: 3 });
      registry.register(trigger);
      const event = makeEvent('test:event');
      const results = await registry.evaluate(event);
      expect(results[0].fired).toBe(false);
      expect(results[0].skipped_reason).toBe('max_fires');
    });

    it('uses config max_fires_per_session when trigger has no max_fires', async () => {
      const configWithLimit: TriggersConfig = { ...DEFAULT_CONFIG, max_fires_per_session: 2 };
      const limitedRegistry = new TriggerRegistry(configWithLimit);
      const handler = vi.fn().mockResolvedValue(undefined);
      limitedRegistry.registerHandler('h', handler);
      const trigger = makeTrigger({
        fires_count: 2, // Already at config limit
        action: { type: 'invoke_handler', handler: 'h', args_template: {} },
      });
      limitedRegistry.register(trigger);
      const event = makeEvent('test:event');
      const results = await limitedRegistry.evaluate(event);
      expect(results[0].fired).toBe(false);
      expect(results[0].skipped_reason).toBe('max_fires');
    });

    it('increments fires_count after firing', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      registry.registerHandler('counterHandler', handler);
      const trigger = makeTrigger({
        fires_count: 0,
        action: { type: 'invoke_handler', handler: 'counterHandler', args_template: {} },
      });
      registry.register(trigger);
      const event = makeEvent('test:event');
      await registry.evaluate(event);
      expect(registry.get('trigger-1')?.fires_count).toBe(1);
    });

    it('updates last_fired after firing', async () => {
      const before = Date.now();
      const handler = vi.fn().mockResolvedValue(undefined);
      registry.registerHandler('lastFiredHandler', handler);
      const trigger = makeTrigger({
        action: { type: 'invoke_handler', handler: 'lastFiredHandler', args_template: {} },
      });
      registry.register(trigger);
      const event = makeEvent('test:event');
      await registry.evaluate(event);
      const after = Date.now();
      const lastFired = registry.get('trigger-1')?.last_fired;
      expect(lastFired).toBeGreaterThanOrEqual(before);
      expect(lastFired).toBeLessThanOrEqual(after);
    });

    it('records action_result in TriggerResult when trigger fires', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      registry.registerHandler('resultHandler', handler);
      const trigger = makeTrigger({
        action: { type: 'invoke_handler', handler: 'resultHandler', args_template: {} },
      });
      registry.register(trigger);
      const results = await registry.evaluate(makeEvent('test:event'));
      expect(results[0].fired).toBe(true);
      expect(results[0].action_result).toBeDefined();
      expect(results[0].action_result?.success).toBe(true);
    });

    it('fires trigger with failed action and records action_result.success=false', async () => {
      registry.register(
        makeTrigger({
          action: {
            type: 'invoke_handler',
            handler: 'nonexistentHandler',
            args_template: {},
          },
        }),
      );
      const results = await registry.evaluate(makeEvent('test:event'));
      expect(results[0].fired).toBe(true);
      expect(results[0].action_result?.success).toBe(false);
    });
  });

  // ─── restoreTriggerState ─────────────────────────────────────────────────────

  describe('restoreTriggerState', () => {
    it('restores fires_count for a registered trigger', () => {
      registry.register(makeTrigger());
      registry.restoreTriggerState([{ triggerId: 'trigger-1', firesCount: 5 }]);
      expect(registry.get('trigger-1')?.fires_count).toBe(5);
    });

    it('restores last_fired for a registered trigger', () => {
      registry.register(makeTrigger());
      const ts = Date.now() - 10000;
      registry.restoreTriggerState([{ triggerId: 'trigger-1', firesCount: 3, lastFired: ts }]);
      expect(registry.get('trigger-1')?.last_fired).toBe(ts);
    });

    it('does not set last_fired when it is not provided in state entry', () => {
      registry.register(makeTrigger({ last_fired: undefined }));
      registry.restoreTriggerState([{ triggerId: 'trigger-1', firesCount: 2 }]);
      expect(registry.get('trigger-1')?.last_fired).toBeUndefined();
    });

    it('silently ignores state entries for unknown trigger IDs', () => {
      expect(() =>
        registry.restoreTriggerState([{ triggerId: 'nonexistent', firesCount: 5 }]),
      ).not.toThrow();
    });

    it('handles an empty state array without error', () => {
      expect(() => registry.restoreTriggerState([])).not.toThrow();
    });

    it('restores state for multiple triggers simultaneously', () => {
      registry.register(makeTrigger({ id: 't1', fires_count: 0 }));
      registry.register(makeTrigger({ id: 't2', fires_count: 0 }));
      registry.restoreTriggerState([
        { triggerId: 't1', firesCount: 3 },
        { triggerId: 't2', firesCount: 7 },
      ]);
      expect(registry.get('t1')?.fires_count).toBe(3);
      expect(registry.get('t2')?.fires_count).toBe(7);
    });
  });

  // ─── getTriggerStates ────────────────────────────────────────────────────────

  describe('getTriggerStates', () => {
    it('returns an empty array when no triggers are registered', () => {
      expect(registry.getTriggerStates()).toEqual([]);
    });

    it('returns state snapshots for all registered triggers', () => {
      registry.register(makeTrigger({ id: 't1', fires_count: 3 }));
      registry.register(makeTrigger({ id: 't2', fires_count: 7 }));
      const states = registry.getTriggerStates();
      expect(states).toHaveLength(2);
      const t1State = states.find((s) => s.triggerId === 't1');
      const t2State = states.find((s) => s.triggerId === 't2');
      expect(t1State?.firesCount).toBe(3);
      expect(t2State?.firesCount).toBe(7);
    });

    it('includes lastFired when set', () => {
      const ts = Date.now();
      registry.register(makeTrigger({ fires_count: 1, last_fired: ts }));
      const states = registry.getTriggerStates();
      expect(states[0].lastFired).toBe(ts);
    });

    it('has undefined lastFired when not set', () => {
      registry.register(makeTrigger({ fires_count: 0, last_fired: undefined }));
      const states = registry.getTriggerStates();
      expect(states[0].lastFired).toBeUndefined();
    });
  });

  // ─── resetAllFireCounts ──────────────────────────────────────────────────────

  describe('resetAllFireCounts', () => {
    it('resets fires_count to 0 for all triggers', () => {
      registry.register(makeTrigger({ id: 't1', fires_count: 5 }));
      registry.register(makeTrigger({ id: 't2', fires_count: 10 }));
      registry.resetAllFireCounts();
      expect(registry.get('t1')?.fires_count).toBe(0);
      expect(registry.get('t2')?.fires_count).toBe(0);
    });

    it('clears last_fired timestamps', () => {
      registry.register(makeTrigger({ id: 't1', fires_count: 5, last_fired: Date.now() }));
      registry.resetAllFireCounts();
      expect(registry.get('t1')?.last_fired).toBeUndefined();
    });

    it('does not throw when no triggers are registered', () => {
      expect(() => registry.resetAllFireCounts()).not.toThrow();
    });

    it('allows triggers to fire again after reset', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      registry.registerHandler('resetHandler', handler);
      const trigger = makeTrigger({
        max_fires: 1,
        fires_count: 1, // Already at max
        action: { type: 'invoke_handler', handler: 'resetHandler', args_template: {} },
      });
      registry.register(trigger);
      // Verify it's blocked
      let results = await registry.evaluate(makeEvent('test:event'));
      expect(results[0].fired).toBe(false);
      expect(results[0].skipped_reason).toBe('max_fires');
      // Reset and try again
      registry.resetAllFireCounts();
      results = await registry.evaluate(makeEvent('test:event'));
      expect(results[0].fired).toBe(true);
    });
  });

  // ─── setDependencies ────────────────────────────────────────────────────────

  describe('setDependencies', () => {
    it('accepts null dependencies without throwing', () => {
      const mockBus = { emit: vi.fn() };
      expect(() => registry.setDependencies(mockBus as any, null, null, null)).not.toThrow();
    });

    it('replaces the internal executor while preserving action handlers', async () => {
      const handlerFn = vi.fn().mockResolvedValue(undefined);
      // Register handler before setDependencies
      registry.registerHandler('earlyHandler', handlerFn);
      const mockBus = { emit: vi.fn() };
      registry.setDependencies(mockBus as any);
      // Handler should still work after setDependencies
      registry.register(
        makeTrigger({
          action: { type: 'invoke_handler', handler: 'earlyHandler', args_template: {} },
        }),
      );
      const results = await registry.evaluate(makeEvent('test:event'));
      expect(results[0].fired).toBe(true);
      expect(handlerFn).toHaveBeenCalledOnce();
    });
  });
});
