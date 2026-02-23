/**
 * TriggerRegistry Tests
 *
 * Tests for trigger registration, unregistration, enable/disable,
 * evaluation (cooldown, max_fires, condition matching), and handler delegation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TriggerRegistry } from '../trigger-registry.js';
import type { TriggerDefinition } from '../types.js';
import type { RuntimeEvent } from '../../events/types.js';
import type { TriggersConfig } from '../../shared/config.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_TRIGGERS_CONFIG: TriggersConfig = {
  max_triggers: 50,
  default_cooldown_ms: 5000,
  max_fires_per_session: 100,
};

function makeEvent(type: string, data?: Record<string, unknown>): RuntimeEvent {
  return {
    id: `evt_${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
    type: type as RuntimeEvent['type'],
    source: { kind: 'system' },
    payload: {
      type: type as RuntimeEvent['type'],
      data: data ?? {},
    } as RuntimeEvent['payload'],
  };
}

function makeTrigger(overrides: Partial<TriggerDefinition> = {}): TriggerDefinition {
  return {
    id: `trigger_${Math.random().toString(36).slice(2)}`,
    name: 'Test Trigger',
    description: 'Test',
    enabled: true,
    priority: 10,
    condition: { type: 'event', event_type: 'session:started' as RuntimeEvent['type'] },
    action: { type: 'invoke_handler', handler: 'noop', args_template: {} },
    fires_count: 0,
    ...overrides,
  };
}

function makeRegistry(config: Partial<TriggersConfig> = {}) {
  return new TriggerRegistry({ ...DEFAULT_TRIGGERS_CONFIG, ...config });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TriggerRegistry', () => {
  let registry: TriggerRegistry;

  beforeEach(() => {
    registry = makeRegistry();
    // Register a noop handler to prevent action failures
    registry.registerHandler('noop', vi.fn().mockResolvedValue(undefined));
  });

  // ── register ──────────────────────────────────────────────────────────────

  describe('register', () => {
    it('registers a trigger without throwing', () => {
      const t = makeTrigger({ id: 'test-1' });
      expect(() => registry.register(t)).not.toThrow();
    });

    it('registers multiple triggers', () => {
      registry.register(makeTrigger({ id: 'a' }));
      registry.register(makeTrigger({ id: 'b' }));
      expect(registry.list()).toHaveLength(2);
    });

    it('throws when max_triggers limit is reached', () => {
      const limitedRegistry = makeRegistry({ max_triggers: 2 });
      limitedRegistry.register(makeTrigger({ id: 'x' }));
      limitedRegistry.register(makeTrigger({ id: 'y' }));
      expect(() => limitedRegistry.register(makeTrigger({ id: 'z' }))).toThrow(
        'max_triggers limit reached',
      );
    });

    it('overwrites a trigger with the same id (Map.set semantics)', () => {
      // TriggerRegistry uses triggers.set() which overwrites
      registry.register(makeTrigger({ id: 'dup', name: 'First' }));
      registry.register(makeTrigger({ id: 'dup', name: 'Second' }));
      // max_triggers is checked against current size before set, but Map won't grow if key exists
      // Actually it throws if max_triggers reached, but here size=0->1->1 so no throw
      expect(registry.get('dup')?.name).toBe('Second');
    });
  });

  // ── unregister ────────────────────────────────────────────────────────────

  describe('unregister', () => {
    it('removes a registered trigger', () => {
      registry.register(makeTrigger({ id: 'rem-me' }));
      registry.unregister('rem-me');
      expect(registry.get('rem-me')).toBeUndefined();
    });

    it('is a no-op for unknown trigger id', () => {
      expect(() => registry.unregister('ghost')).not.toThrow();
    });

    it('decreases the list length after removal', () => {
      registry.register(makeTrigger({ id: 'keep' }));
      registry.register(makeTrigger({ id: 'remove' }));
      registry.unregister('remove');
      expect(registry.list()).toHaveLength(1);
    });
  });

  // ── setEnabled ────────────────────────────────────────────────────────────

  describe('setEnabled', () => {
    it('disables an enabled trigger', () => {
      registry.register(makeTrigger({ id: 'toggle', enabled: true }));
      registry.setEnabled('toggle', false);
      expect(registry.get('toggle')!.enabled).toBe(false);
    });

    it('enables a disabled trigger', () => {
      registry.register(makeTrigger({ id: 'toggle2', enabled: false }));
      registry.setEnabled('toggle2', true);
      expect(registry.get('toggle2')!.enabled).toBe(true);
    });

    it('is a no-op for unknown trigger id', () => {
      expect(() => registry.setEnabled('ghost', true)).not.toThrow();
    });
  });

  // ── get / list ────────────────────────────────────────────────────────────

  describe('get', () => {
    it('returns a registered trigger by id', () => {
      const t = makeTrigger({ id: 'find-me' });
      registry.register(t);
      expect(registry.get('find-me')).toBe(t);
    });

    it('returns undefined for unknown id', () => {
      expect(registry.get('nope')).toBeUndefined();
    });
  });

  describe('list', () => {
    it('returns all registered triggers', () => {
      registry.register(makeTrigger({ id: 'a' }));
      registry.register(makeTrigger({ id: 'b' }));
      const list = registry.list();
      expect(list).toHaveLength(2);
      const ids = list.map((t) => t.id);
      expect(ids).toContain('a');
      expect(ids).toContain('b');
    });

    it('returns empty array when no triggers registered', () => {
      expect(registry.list()).toHaveLength(0);
    });
  });

  // ── evaluate ──────────────────────────────────────────────────────────────

  describe('evaluate', () => {
    it('returns empty array when no triggers are registered', async () => {
      const results = await registry.evaluate(makeEvent('session:started'));
      expect(results).toHaveLength(0);
    });

    it('does not fire disabled triggers', async () => {
      registry.register(makeTrigger({ id: 'disabled', enabled: false }));
      const results = await registry.evaluate(makeEvent('session:started'));
      // Disabled triggers are filtered before evaluation
      expect(results).toHaveLength(0);
    });

    it('fires a matching enabled trigger', async () => {
      registry.register(makeTrigger({ id: 'fires', enabled: true }));
      const results = await registry.evaluate(makeEvent('session:started'));
      expect(results).toHaveLength(1);
      expect(results[0]!.fired).toBe(true);
      expect(results[0]!.trigger_id).toBe('fires');
    });

    it('does not fire when event type does not match condition', async () => {
      registry.register(
        makeTrigger({
          id: 'no-match',
          condition: { type: 'event', event_type: 'build:failed' as RuntimeEvent['type'] },
        }),
      );
      const results = await registry.evaluate(makeEvent('session:started'));
      expect(results[0]!.fired).toBe(false);
      expect(results[0]!.skipped_reason).toBeUndefined();
    });

    it('increments fires_count on successful fire', async () => {
      const t = makeTrigger({ id: 'counter' });
      registry.register(t);
      await registry.evaluate(makeEvent('session:started'));
      expect(registry.get('counter')!.fires_count).toBe(1);
      await registry.evaluate(makeEvent('session:started'));
      expect(registry.get('counter')!.fires_count).toBe(2);
    });

    it('sets last_fired timestamp after firing', async () => {
      const t = makeTrigger({ id: 'timestamped' });
      registry.register(t);
      expect(t.last_fired).toBeUndefined();
      await registry.evaluate(makeEvent('session:started'));
      expect(registry.get('timestamped')!.last_fired).toBeDefined();
    });

    it('skips trigger due to cooldown', async () => {
      const recentFired = new Date(Date.now() - 100).toISOString();
      const t = makeTrigger({
        id: 'cooldown-test',
        cooldown_ms: 5000,
        last_fired: recentFired,
      });
      registry.register(t);
      const results = await registry.evaluate(makeEvent('session:started'));
      expect(results[0]!.fired).toBe(false);
      expect(results[0]!.skipped_reason).toBe('cooldown');
    });

    it('fires after cooldown has expired', async () => {
      const oldFired = new Date(Date.now() - 10000).toISOString(); // 10s ago
      const t = makeTrigger({
        id: 'cooldown-expired',
        cooldown_ms: 1000, // 1s cooldown, well past
        last_fired: oldFired,
      });
      registry.register(t);
      const results = await registry.evaluate(makeEvent('session:started'));
      expect(results[0]!.fired).toBe(true);
    });

    it('skips trigger due to max_fires (trigger-level)', async () => {
      const t = makeTrigger({
        id: 'max-fires-test',
        max_fires: 2,
        fires_count: 2,
      });
      registry.register(t);
      const results = await registry.evaluate(makeEvent('session:started'));
      expect(results[0]!.fired).toBe(false);
      expect(results[0]!.skipped_reason).toBe('max_fires');
    });

    it('uses config max_fires_per_session when trigger has no max_fires set', async () => {
      const t = makeTrigger({
        id: 'config-max-fires',
        fires_count: 100, // equals config.max_fires_per_session
      });
      registry.register(t);
      const results = await registry.evaluate(makeEvent('session:started'));
      expect(results[0]!.fired).toBe(false);
      expect(results[0]!.skipped_reason).toBe('max_fires');
    });

    it('evaluates triggers in priority order (lower number first)', async () => {
      const handlerA = vi.fn().mockResolvedValue(undefined);
      const handlerB = vi.fn().mockResolvedValue(undefined);
      registry.registerHandler('handlerA', handlerA);
      registry.registerHandler('handlerB', handlerB);

      registry.register(
        makeTrigger({
          id: 'low-priority',
          priority: 100,
          action: { type: 'invoke_handler', handler: 'handlerB', args_template: {} },
        }),
      );
      registry.register(
        makeTrigger({
          id: 'high-priority',
          priority: 1,
          action: { type: 'invoke_handler', handler: 'handlerA', args_template: {} },
        }),
      );

      const order: string[] = [];
      handlerA.mockImplementation(async () => { order.push('A'); });
      handlerB.mockImplementation(async () => { order.push('B'); });

      await registry.evaluate(makeEvent('session:started'));
      expect(order).toEqual(['A', 'B']);
    });

    it('reports action_result in fired trigger result', async () => {
      registry.register(makeTrigger({ id: 'with-result' }));
      const results = await registry.evaluate(makeEvent('session:started'));
      expect(results[0]!.action_result).toBeDefined();
      expect(results[0]!.action_result!.success).toBe(true);
    });

    it('still records fire even when action fails', async () => {
      registry.registerHandler('failing', vi.fn().mockRejectedValue(new Error('boom')));
      registry.register(
        makeTrigger({
          id: 'action-fails',
          action: { type: 'invoke_handler', handler: 'failing', args_template: {} },
        }),
      );
      const results = await registry.evaluate(makeEvent('session:started'));
      expect(results[0]!.fired).toBe(true);
      expect(registry.get('action-fails')!.fires_count).toBe(1);
    });

    it('evaluates condition with payload filter', async () => {
      registry.register(
        makeTrigger({
          id: 'filtered',
          condition: {
            type: 'event',
            event_type: 'session:started' as RuntimeEvent['type'],
            filter: { mode: 'ci' },
          },
        }),
      );
      // Event without matching filter
      const r1 = await registry.evaluate(makeEvent('session:started', { mode: 'dev' }));
      expect(r1[0]!.fired).toBe(false);

      // Event with matching filter
      const r2 = await registry.evaluate(makeEvent('session:started', { mode: 'ci' }));
      expect(r2[0]!.fired).toBe(true);
    });
  });

  // ── getActionExecutor ────────────────────────────────────────────────────

  describe('getActionExecutor', () => {
    it('returns the internal ActionExecutor', () => {
      const executor = registry.getActionExecutor();
      expect(executor).toBeDefined();
      // Verify it's the same instance
      expect(executor).toBe(registry.getActionExecutor());
    });
  });

  // ── setEventBus ──────────────────────────────────────────────────────────

  describe('setDependencies', () => {
    it('wires the EventBus into the ActionExecutor for emit_event actions', async () => {
      const emitFn = vi.fn();
      const bus = { emit: emitFn };
      registry.setDependencies(bus);

      registry.register(
        makeTrigger({
          id: 'emit-test',
          action: {
            type: 'emit_event',
            event_type: 'system:error' as RuntimeEvent['type'],
            payload_template: {},
          },
        }),
      );

      const results = await registry.evaluate(makeEvent('session:started'));
      expect(results[0]!.fired).toBe(true);
      expect(emitFn).toHaveBeenCalled();
    });

    it('preserves handlers registered before setDependencies is called', async () => {
      const handlerFn = vi.fn().mockResolvedValue(undefined);
      registry.registerHandler('pre-wired', handlerFn);
      registry.setDependencies({ emit: vi.fn() });

      registry.register(
        makeTrigger({
          id: 'handler-test',
          action: { type: 'invoke_handler', handler: 'pre-wired', args_template: {} },
        }),
      );

      const results = await registry.evaluate(makeEvent('session:started'));
      expect(results[0]!.fired).toBe(true);
      expect(handlerFn).toHaveBeenCalledOnce();
    });
  });

  // ── registerHandler ──────────────────────────────────────────────────────

  describe('registerHandler', () => {
    it('registers a handler that gets invoked during evaluate', async () => {
      const handlerFn = vi.fn().mockResolvedValue(undefined);
      registry.registerHandler('my-handler', handlerFn);
      registry.register(
        makeTrigger({
          id: 'h-test',
          action: { type: 'invoke_handler', handler: 'my-handler', args_template: { key: 'val' } },
        }),
      );
      await registry.evaluate(makeEvent('session:started'));
      expect(handlerFn).toHaveBeenCalledTimes(1);
    });
  });
});
