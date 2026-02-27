/**
 * Built-in Trigger Definitions
 *
 * Sixteen pre-configured triggers that cover the most common automation scenarios:
 * build failure recovery, test failure recovery, budget monitoring,
 * spawn rate limiting, dev server recovery, WRFC auto-review chain,
 * WRFC review response, WRFC fix response, WRFC workflow start on agent spawn,
 * test-then-fix start, test-then-fix agent completed, test-then-fix failure handler,
 * test-then-fix retest handler, review-only start, and review-only agent completed.
 */

import type { TriggerDefinition } from './types.js';
import type { EventTypePattern } from '../events/types.js';

/**
 * Returns the full list of built-in trigger definitions (16 total).
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

    // ─── 7. WRFC Spawn Reviewer ─────────────────────────────────────────
    {
      id: 'builtin_wrfc_spawn_reviewer',
      name: 'wrfc_spawn_reviewer',
      description: 'Spawn a reviewer agent after an agent completes in a WRFC workflow',
      enabled: true,
      priority: 20,
      condition: {
        type: 'event',
        event_type: 'hook:agent:completed' as EventTypePattern,
      },
      action: {
        type: 'invoke_handler',
        handler: 'wrfc_chain_next',
        args_template: {
          event_id: '$event.id',
          event_type: '$event.type',
          // Pass individual hook_input fields to avoid template stringification of objects.
          // wrfc_chain_next reads agent_type, subagent_type, task_output, result from hook_input.
          // FIX-TRACE-A: Added last_assistant_message (the actual field SubagentStop sends)
          // and kept task_output/result as fallbacks for other hook sources.
          hook_input: {
            agent_id: '$event.payload.data.agent_id',
            agent_type: '$event.payload.data.agent_type',
            subagent_type: '$event.payload.data.subagent_type',
            last_assistant_message: '$event.payload.data.last_assistant_message',
            task_output: '$event.payload.data.task_output',
            result: '$event.payload.data.result',
          },
        },
      },
      max_fires: 500,
      fires_count: 0,
    },

    // ─── 8. WRFC Spawn Fixer ────────────────────────────────────────────
    {
      id: 'builtin_wrfc_spawn_fixer',
      name: 'wrfc_spawn_fixer',
      description: 'Spawn an engineer agent to fix issues after a review completes with score < 10',
      enabled: true,
      priority: 20,
      condition: {
        type: 'event',
        event_type: 'wrfc:review_completed',
      },
      action: {
        type: 'invoke_handler',
        handler: 'wrfc_review_response',
        args_template: {
          event_id: '$event.id',
          review_score: '$event.payload.data.review_score',
          review_issues: '$event.payload.data.review_issues',
          files_modified: '$event.payload.data.files_modified',
        },
      },
      max_fires: 500,
      fires_count: 0,
    },

    // ─── 9. WRFC Fix-Review Loop ─────────────────────────────────────────
    {
      id: 'builtin_wrfc_fix_review_loop',
      name: 'wrfc_fix_review_loop',
      description: 'Spawn a reviewer for re-review after a fix, or escalate if fix budget exhausted',
      enabled: true,
      priority: 20,
      condition: {
        type: 'event',
        event_type: 'wrfc:fix_completed',
      },
      action: {
        type: 'invoke_handler',
        handler: 'wrfc_fix_response',
        args_template: {
          event_id: '$event.id',
          fix_attempts: '$event.payload.data.fix_attempts',
          max_fix_attempts: '$event.payload.data.max_fix_attempts',
        },
      },
      max_fires: 500,
      fires_count: 0,
    },

    // ─── 10. WRFC Start Workflow on Agent Spawn ───────────────────────────
    {
      // Decision 2: invokes wrfc_agent_spawned handler which creates a workflow
      // with ID `wrfc_{agent_id}` and stores the agent_id to workflow_id binding.
      // If workflow_id is present in the event data, the agent is part of an
      // existing chain -- wrfc_agent_spawned will bind without creating a new workflow.
      id: 'builtin_wrfc_start_workflow',
      name: 'wrfc_start_workflow',
      description: 'Bind agent to a wrfc_loop workflow on agent spawn, creating one if needed (Decision 2)',
      enabled: true,
      priority: 10,
      condition: {
        type: 'event',
        event_type: 'hook:agent:spawned' as EventTypePattern,
      },
      action: {
        type: 'invoke_handler',
        handler: 'wrfc_agent_spawned',
        args_template: {
          agent_id: '$event.payload.data.agent_id',
          agent_type: '$event.payload.data.agent_type',
          workflow_id: '$event.payload.data.workflow_id',
          task: '$event.payload.data.task_description',
        },
      },
      max_fires: 500,
      fires_count: 0,
    },

    // ─── 11. Test-Then-Fix Start ──────────────────────────────────────────────────────────
    {
      id: 'builtin_test_fix_start',
      name: 'test_fix_start',
      description: 'Start a test_then_fix workflow when a test:failed event fires',
      enabled: true,
      priority: 20,
      condition: {
        type: 'event',
        event_type: 'test:failed',
      },
      action: {
        type: 'start_workflow',
        workflow_definition: 'test_then_fix',
        context_template: {
          trigger: 'test_failed',
          event_id: '$event.id',
          event_type: '$event.type',
        },
      },
      cooldown_ms: 60_000,
      max_fires: 10,
      fires_count: 0,
    },

    // ─── 12. Test-Then-Fix Agent Completed ──────────────────────────────────────────────
    {
      id: 'builtin_test_fix_agent_completed',
      name: 'test_fix_agent_completed',
      description: 'Route hook:agent:completed to the test_fix_agent_completed handler for test_then_fix workflows',
      enabled: true,
      priority: 19,
      condition: {
        type: 'event',
        event_type: 'hook:agent:completed' as EventTypePattern,
      },
      action: {
        type: 'invoke_handler',
        handler: 'test_fix_agent_completed',
        args_template: {
          hook_input: {
            agent_id: '$event.payload.data.agent_id',
            agent_type: '$event.payload.data.agent_type',
            subagent_type: '$event.payload.data.subagent_type',
            last_assistant_message: '$event.payload.data.last_assistant_message',
            task_output: '$event.payload.data.task_output',
            result: '$event.payload.data.result',
          },
        },
      },
      max_fires: 50,
      fires_count: 0,
    },

    // ─── 13. Review-Only Start ────────────────────────────────────────────────────────────
    {
      id: 'builtin_review_only_start',
      name: 'review_only_start',
      description: 'Start a review_only workflow when a review:requested event fires',
      enabled: true,
      priority: 20,
      condition: {
        type: 'event',
        event_type: 'review:requested',
      },
      action: {
        type: 'start_workflow',
        workflow_definition: 'review_only',
        context_template: {
          trigger: 'review_requested',
          event_id: '$event.id',
          event_type: '$event.type',
        },
      },
      cooldown_ms: 60_000,
      max_fires: 20,
      fires_count: 0,
    },

    // ─── 14. Test-Fix Handle Failure ─────────────────────────────────────────────────
    {
      id: 'builtin_test_fix_handle_failure',
      name: 'test_fix_handle_failure',
      description: 'Invoke test_fix_handle_failure handler when tests fail in a test_then_fix workflow',
      enabled: true,
      priority: 20,
      condition: {
        type: 'event',
        event_type: 'test_fix:tests_failed',
      },
      action: {
        type: 'invoke_handler',
        handler: 'test_fix_handle_failure',
        args_template: {
          workflow_id: '$event.payload.data.workflow_id',
          test_output: '$event.payload.data.test_output',
          fix_attempts: '$event.payload.data.fix_attempts',
        },
      },
      max_fires: 50,
      fires_count: 0,
    },

    // ─── 15. Test-Fix Handle Retest ───────────────────────────────────────────────────
    {
      id: 'builtin_test_fix_handle_retest',
      name: 'test_fix_handle_retest',
      description: 'Invoke test_fix_handle_retest handler when a fix completes in a test_then_fix workflow',
      enabled: true,
      priority: 20,
      condition: {
        type: 'event',
        event_type: 'test_fix:fix_completed',
      },
      action: {
        type: 'invoke_handler',
        handler: 'test_fix_handle_retest',
        args_template: {
          workflow_id: '$event.payload.data.workflow_id',
          passed: '$event.payload.data.passed',
          fix_attempts: '$event.payload.data.fix_attempts',
        },
      },
      max_fires: 50,
      fires_count: 0,
    },

    // ─── 16. Review-Only Agent Completed ───────────────────────────────────────────────
    {
      id: 'builtin_review_only_agent_completed',
      name: 'review_only_agent_completed',
      description: 'Route hook:agent:completed to the review_only_agent_completed handler for review_only workflows',
      enabled: true,
      priority: 20,
      condition: {
        type: 'event',
        event_type: 'hook:agent:completed' as EventTypePattern,
      },
      action: {
        type: 'invoke_handler',
        handler: 'review_only_agent_completed',
        args_template: {
          hook_input: {
            agent_id: '$event.payload.data.agent_id',
            agent_type: '$event.payload.data.agent_type',
            subagent_type: '$event.payload.data.subagent_type',
            last_assistant_message: '$event.payload.data.last_assistant_message',
            task_output: '$event.payload.data.task_output',
            result: '$event.payload.data.result',
          },
        },
      },
      max_fires: 50,
      fires_count: 0,
    },
  ];
}
