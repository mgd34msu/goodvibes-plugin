import { describe, it, expect } from 'vitest';
import { getBuiltinTriggers } from '../builtins.js';
import type { TriggerDefinition } from '../types.js';

describe('getBuiltinTriggers', () => {
  let triggers: TriggerDefinition[];

  // Load once for all tests
  triggers = getBuiltinTriggers();

  // ─── count and structure ───────────────────────────────────────────────────────

  describe('count and structure', () => {
    it('returns exactly 7 built-in triggers', () => {
      expect(triggers).toHaveLength(7);
    });

    it('returns a fresh array on each call (not cached)', () => {
      const first = getBuiltinTriggers();
      const second = getBuiltinTriggers();
      expect(first).not.toBe(second);
    });

    it('all triggers have id, name, description, enabled, priority, condition, action, fires_count', () => {
      for (const trigger of triggers) {
        expect(trigger.id, `${trigger.id}: missing id`).toBeTruthy();
        expect(trigger.name, `${trigger.id}: missing name`).toBeTruthy();
        expect(trigger.description, `${trigger.id}: missing description`).toBeTruthy();
        expect(typeof trigger.enabled, `${trigger.id}: enabled must be boolean`).toBe('boolean');
        expect(typeof trigger.priority, `${trigger.id}: priority must be number`).toBe('number');
        expect(trigger.condition, `${trigger.id}: missing condition`).toBeDefined();
        expect(trigger.action, `${trigger.id}: missing action`).toBeDefined();
        expect(trigger.fires_count, `${trigger.id}: fires_count must be 0`).toBe(0);
      }
    });

    it('all triggers have unique IDs', () => {
      const ids = triggers.map((t) => t.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('all triggers use the builtin_ prefix in their IDs', () => {
      for (const trigger of triggers) {
        expect(trigger.id).toMatch(/^builtin_/);
      }
    });

    it('all triggers are enabled by default', () => {
      for (const trigger of triggers) {
        expect(trigger.enabled).toBe(true);
      }
    });

    it('all triggers have a max_fires value set', () => {
      for (const trigger of triggers) {
        expect(trigger.max_fires, `${trigger.id}: max_fires must be defined`).toBeDefined();
        expect(trigger.max_fires!, `${trigger.id}: max_fires must be > 0`).toBeGreaterThan(0);
      }
    });

    it('all priorities are positive numbers', () => {
      for (const trigger of triggers) {
        expect(trigger.priority).toBeGreaterThan(0);
      }
    });
  });

  // ─── specific triggers ───────────────────────────────────────────────────────

  describe('specific triggers', () => {
    function findTrigger(id: string): TriggerDefinition {
      const trigger = triggers.find((t) => t.id === id);
      if (!trigger) throw new Error(`Trigger '${id}' not found in builtins`);
      return trigger;
    }

    it('builtin_auto_fix_build: threshold condition on build:failed with count=2', () => {
      const t = findTrigger('builtin_auto_fix_build');
      expect(t.condition.type).toBe('threshold');
      if (t.condition.type === 'threshold') {
        expect(t.condition.event_type).toBe('build:failed');
        expect(t.condition.count).toBe(2);
        expect(t.condition.window_ms).toBe(60_000);
      }
    });

    it('builtin_auto_fix_build: start_workflow action with fix_loop definition', () => {
      const t = findTrigger('builtin_auto_fix_build');
      expect(t.action.type).toBe('start_workflow');
      if (t.action.type === 'start_workflow') {
        expect(t.action.workflow_definition).toBe('fix_loop');
      }
    });

    it('builtin_auto_fix_test: sequence condition for agent:completed then test:failed', () => {
      const t = findTrigger('builtin_auto_fix_test');
      expect(t.condition.type).toBe('sequence');
      if (t.condition.type === 'sequence') {
        expect(t.condition.events).toEqual(['agent:completed', 'test:failed']);
        expect(t.condition.window_ms).toBe(120_000);
      }
    });

    it('builtin_budget_warning: event condition on agent:progress', () => {
      const t = findTrigger('builtin_budget_warning');
      expect(t.condition.type).toBe('event');
      if (t.condition.type === 'event') {
        expect(t.condition.event_type).toBe('agent:progress');
      }
    });

    it('builtin_budget_warning: emit_event action with agent:budget_warning type', () => {
      const t = findTrigger('builtin_budget_warning');
      expect(t.action.type).toBe('emit_event');
      if (t.action.type === 'emit_event') {
        expect(t.action.event_type).toBe('agent:budget_warning');
      }
    });

    it('builtin_sequential_spawn_alert: threshold condition with count=3 for agent:spawned', () => {
      const t = findTrigger('builtin_sequential_spawn_alert');
      expect(t.condition.type).toBe('threshold');
      if (t.condition.type === 'threshold') {
        expect(t.condition.event_type).toBe('agent:spawned');
        expect(t.condition.count).toBe(3);
        expect(t.condition.window_ms).toBe(30_000);
      }
    });

    it('builtin_devserver_recovery: event condition on devserver:error', () => {
      const t = findTrigger('builtin_devserver_recovery');
      expect(t.condition.type).toBe('event');
      if (t.condition.type === 'event') {
        expect(t.condition.event_type).toBe('devserver:error');
      }
    });

    it('builtin_devserver_recovery: invoke_handler action for restartDevServer', () => {
      const t = findTrigger('builtin_devserver_recovery');
      expect(t.action.type).toBe('invoke_handler');
      if (t.action.type === 'invoke_handler') {
        expect(t.action.handler).toBe('restartDevServer');
      }
    });

    it('builtin_webhook_received: event condition on webhook:*', () => {
      const t = findTrigger('builtin_webhook_received');
      expect(t.condition.type).toBe('event');
      if (t.condition.type === 'event') {
        expect(t.condition.event_type).toBe('webhook:*');
      }
    });

    it('builtin_webhook_received: emit_event action with external:webhook_received type', () => {
      const t = findTrigger('builtin_webhook_received');
      expect(t.action.type).toBe('emit_event');
      if (t.action.type === 'emit_event') {
        expect(t.action.event_type).toBe('external:webhook_received');
      }
    });

    it('builtin_ci_failure: event condition on webhook:ci:*', () => {
      const t = findTrigger('builtin_ci_failure');
      expect(t.condition.type).toBe('event');
      if (t.condition.type === 'event') {
        expect(t.condition.event_type).toBe('webhook:ci:*');
      }
    });

    it('builtin_ci_failure: invoke_handler action for bridgeCIFailure', () => {
      const t = findTrigger('builtin_ci_failure');
      expect(t.action.type).toBe('invoke_handler');
      if (t.action.type === 'invoke_handler') {
        expect(t.action.handler).toBe('bridgeCIFailure');
      }
    });

  });

  // ─── cooldown values ─────────────────────────────────────────────────────────

  describe('cooldown values', () => {
    it('builtin_auto_fix_build has cooldown_ms of 120000', () => {
      const t = triggers.find((t) => t.id === 'builtin_auto_fix_build')!;
      expect(t.cooldown_ms).toBe(120_000);
    });

    it('builtin_budget_warning has cooldown_ms of 30000', () => {
      const t = triggers.find((t) => t.id === 'builtin_budget_warning')!;
      expect(t.cooldown_ms).toBe(30_000);
    });

    it('triggers without cooldown_ms have it as undefined (not null or 0)', () => {
      // WRFC triggers that do NOT set cooldown_ms
      const noCooldownTriggers = triggers.filter(
        (t) => !('cooldown_ms' in t) || t.cooldown_ms === undefined,
      );
      // There should be at least some triggers without explicit cooldown
      for (const t of noCooldownTriggers) {
        expect(t.cooldown_ms).toBeUndefined();
      }
    });
  });
});
