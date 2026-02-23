/**
 * Built-in Trigger Definitions
 *
 * Six pre-configured triggers that cover the most common automation scenarios:
 * build failure recovery, test failure recovery, budget monitoring,
 * spawn rate limiting, dev server recovery, and WRFC auto-review.
 */

import type { TriggerDefinition } from './types.js';

/**
 * Returns the full list of built-in trigger definitions.
 *
 * These are registered into the TriggerRegistry at engine startup.
 * All built-in triggers use `builtin_` prefix in their IDs.
 *
 * @returns Array of built-in TriggerDefinition objects.
 */
export function getBuiltinTriggers(): TriggerDefinition[] {
  return [
    // ─── 1. Auto Fix Build ────────────────────────────────────────────────────
    {
      id: 'builtin_auto_fix_build',
      name: 'auto_fix_build',
      description: 'Start fix loop when build fails 2 times within 60 seconds',
      enabled: true,
      priority: 10,
      condition: {
        type: 'threshold',
        event_type: 'build:failed',
        count: 2,
        window_ms: 60_000,
      },
      action: {
        type: 'start_workflow',
        workflow_definition: 'fix_loop',
        context_template: {
          trigger: 'build_failure',
          event_id: '$event.id',
          event_type: '$event.type',
        },
      },
      cooldown_ms: 120_000,
      max_fires: 5,
      fires_count: 0,
    },

    // ─── 2. Auto Fix Test ─────────────────────────────────────────────────────
    {
      id: 'builtin_auto_fix_test',
      name: 'auto_fix_test',
      description: 'Start fix loop when a test fails after an agent completes',
      enabled: true,
      priority: 20,
      condition: {
        type: 'sequence',
        events: ['agent:completed', 'test:failed'],
        window_ms: 120_000,
      },
      action: {
        type: 'start_workflow',
        workflow_definition: 'fix_loop',
        context_template: {
          trigger: 'test_failure',
          event_id: '$event.id',
          event_type: '$event.type',
        },
      },
      cooldown_ms: 120_000,
      max_fires: 5,
      fires_count: 0,
    },

    // ─── 3. Budget Warning ────────────────────────────────────────────────────
    {
      id: 'builtin_budget_warning',
      name: 'budget_warning',
      description: 'Fire on any agent:progress event. NOTE: this trigger fires on every agent:progress event regardless of cost level — actual budget threshold checks (cost > 80%) must be implemented in the invoke_handler action or by filtering payload fields in the handler, not in this condition.',
      enabled: true,
      priority: 30,
      condition: {
        type: 'event',
        event_type: 'agent:progress',
        // Note: deep payload filtering is not supported in EventCondition —
        // the TriggerRegistry/ConditionEvaluator filter checks top-level data fields.
        // Budget threshold logic requires the invoke_handler approach for real use;
        // here we demonstrate a basic field match.
      },
      action: {
        type: 'emit_event',
        event_type: 'agent:budget_warning',
        payload_template: {
          source_event_id: '$event.id',
          agent_id: '$event.payload.data.agent_id',
          triggered_by: 'budget_warning_trigger',
        },
      },
      cooldown_ms: 30_000,
      max_fires: 20,
      fires_count: 0,
    },

    // ─── 4. Sequential Spawn Alert ────────────────────────────────────────────
    {
      id: 'builtin_sequential_spawn_alert',
      name: 'sequential_spawn_alert',
      description: 'Emit system:error (warning severity) when 3 or more agents are spawned within 30 seconds',
      enabled: true,
      priority: 40,
      condition: {
        type: 'threshold',
        event_type: 'agent:spawned',
        count: 3,
        window_ms: 30_000,
      },
      action: {
        type: 'emit_event',
        event_type: 'system:error',
        payload_template: {
          error: 'High agent spawn rate detected: 3+ agents spawned within 30 seconds',
          component: 'trigger-registry',
          severity: 'warning',
          triggered_by_event: '$event.id',
        },
      },
      cooldown_ms: 60_000,
      max_fires: 10,
      fires_count: 0,
    },

    // ─── 5. Dev Server Recovery ───────────────────────────────────────────────
    {
      id: 'builtin_devserver_recovery',
      name: 'devserver_recovery',
      description: 'Invoke the restartDevServer handler when the dev server reports an error',
      enabled: true,
      priority: 15,
      condition: {
        type: 'event',
        event_type: 'devserver:error',
      },
      action: {
        type: 'invoke_handler',
        handler: 'restartDevServer',
        args_template: {
          event_id: '$event.id',
          error: '$event.payload.data.error',
          pid: '$event.payload.data.pid',
          port: '$event.payload.data.port',
          command: '$event.payload.data.command',
        },
      },
      cooldown_ms: 30_000,
      max_fires: 10,
      fires_count: 0,
    },

    // ─── 6. WRFC Auto Review ──────────────────────────────────────────────────
    {
      id: 'builtin_wrfc_auto_review',
      name: 'wrfc_auto_review',
      description: 'Send wrfc:review_started to the workflow when writing starts then an agent completes',
      enabled: true,
      priority: 25,
      condition: {
        type: 'sequence',
        events: ['wrfc:writing_started', 'agent:completed'],
        window_ms: 600_000, // 10 minutes
      },
      action: {
        type: 'send_workflow_event',
        context_template: {
          event: 'wrfc:review_started',
          triggered_by: '$event.id',
          agent_event_type: '$event.type',
        },
      },
      cooldown_ms: 60_000,
      max_fires: 20,
      fires_count: 0,
    },
  ];
}
