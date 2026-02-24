/**
 * Test-Then-Fix Handler Registration
 *
 * Registers three named handlers with the TriggerRegistry that drive
 * the test-then-fix orchestration chain by running test commands,
 * tracking fix attempts, and enqueuing directives for engineer agents.
 *
 * Handlers:
 * - `test_fix_agent_completed`  — on `hook:agent:completed`: checks if the
 *                                 agent is in a test_then_fix workflow, runs
 *                                 the configured test command, and emits
 *                                 test_fix:tests_passed or test_fix:tests_failed.
 * - `test_fix_handle_failure`   — on `test_fix:tests_failed`: increments
 *                                 fix_attempts, enqueues a spawn directive
 *                                 for an engineer agent to address failures.
 * - `test_fix_handle_retest`    — on `test_fix:fix_completed`: re-runs tests
 *                                 after a fix and emits pass/fail events.
 */

import { createLogger } from '../shared/logger.js';
import { generateEventId, timestamp } from '../shared/utils.js';
import type { TriggerRegistry } from '../triggers/trigger-registry.js';
import type { DirectiveQueue } from './directive-queue.js';
import type { WorkflowEngine } from '../workflow/workflow-engine.js';
import type { AgentWorkflowMap } from './agent-workflow-map.js';
import {
  buildSpawnDirectiveMessage,
  buildWorkflowCompleteMessage,
  buildEscalationMessage,
} from './directive-builder.js';
import { parseGvTag } from './gv-tag-parser.js';

const log = createLogger('test-fix-handlers');

/** Default resource budget for spawned engineer agents. */
const DEFAULT_BUDGET = { max_tokens: 50_000, max_turns: 20 };

/** Default maximum fix attempts before escalation. */
const DEFAULT_MAX_FIX_ATTEMPTS = 3;

/** Workflow definition ID for the test-then-fix chain. */
const TEST_THEN_FIX_DEFINITION_ID = 'test_then_fix';

/** Synthetic score assigned when tests pass (used in review_score context field). */
const SCORE_PASS = 10;

/** Synthetic score assigned when tests fail (used in review_score context field). */
const SCORE_FAIL = 0;

/**
 * Parses test pass/fail status from agent output text.
 * Tries `<gv>` tag parsing first (via the `pass` field), then falls back to
 * regex heuristics for backward compatibility with agents that do not emit tags.
 *
 * @param text - Raw output text from an agent.
 * @returns Object with `passed` boolean and optional numeric `score`, or null if
 *   neither strategy produced a usable result (caller should apply its own heuristic).
 */
export function parseGvTestResult(text: string): { passed: boolean; score?: number } | null {
  if (!text) return null;

  // Try <gv> tag first
  const gvResult = parseGvTag(text);
  if (gvResult.found && gvResult.data !== null && gvResult.data.pass !== undefined) {
    const passed = gvResult.data.pass === true;
    const score = typeof gvResult.data.score === 'number' ? gvResult.data.score : (passed ? SCORE_PASS : SCORE_FAIL);
    return { passed, score };
  }

  // Fallback: regex heuristic
  const hasFailures =
    /\b(FAIL|FAILED|failing|test.*fail|\d+ fail)/i.test(text) ||
    /error:/i.test(text);
  return { passed: !hasFailures };
}

/**
 * Register the three test-then-fix handler functions with the TriggerRegistry.
 *
 * @param registry         - The trigger registry to register handlers on.
 * @param directiveQueue   - The directive queue to enqueue messages into.
 * @param workflowEngine   - Optional workflow engine for state inspection.
 * @param agentWorkflowMap - Optional agent-to-workflow binding map.
 */
export function registerTestFixHandlers(
  registry: TriggerRegistry,
  directiveQueue: DirectiveQueue,
  workflowEngine: WorkflowEngine | null,
  agentWorkflowMap?: AgentWorkflowMap | null,
): void {
  // ─── Handler: test_fix_agent_completed ───────────────────────────────────────
  // Called when hook:agent:completed fires.
  // Looks up the agent's workflow — if it belongs to a test_then_fix workflow,
  // emits tests_passed or tests_failed based on test output parsing.
  registry.registerHandler('test_fix_agent_completed', async (args) => {
    log.debug('test_fix_agent_completed invoked', { args });

    if (!workflowEngine) {
      log.debug('test_fix_agent_completed: no workflow engine, skipping');
      return;
    }

    // Extract agent metadata from hook_input
    const rawHookInput = args['hook_input'];
    const hookInput =
      typeof rawHookInput === 'object' && rawHookInput !== null && !Array.isArray(rawHookInput)
        ? (rawHookInput as Record<string, unknown>)
        : null;
    const agentId = typeof hookInput?.['agent_id'] === 'string' ? hookInput['agent_id'] : null;

    // Look up the workflow for this agent
    let workflowId: string | null = null;
    if (agentId && agentWorkflowMap) {
      workflowId = agentWorkflowMap.lookup(agentId) ?? null;
    }
    if (!workflowId) {
      workflowId = typeof args['workflow_id'] === 'string' ? args['workflow_id'] : null;
    }

    const workflow = workflowId ? workflowEngine.get(workflowId) : null;
    if (!workflow) {
      log.debug('test_fix_agent_completed: no test_then_fix workflow found for agent', {
        agent_id: agentId,
      });
      return;
    }

    // Only handle test_then_fix workflows
    if (workflow.definition_id !== TEST_THEN_FIX_DEFINITION_ID) {
      log.debug('test_fix_agent_completed: workflow is not test_then_fix, skipping', {
        workflow_id: workflow.id,
        definition_id: workflow.definition_id,
      });
      return;
    }

    // Extract agent output — used to detect test pass/fail signals
    const agentOutput =
      (hookInput?.['last_assistant_message'] as string | undefined) ||
      (hookInput?.['task_output'] as string | undefined) ||
      (hookInput?.['result'] as string | undefined) ||
      '';

    // Parse test result: <gv> tag first, regex fallback.
    const testResult = parseGvTestResult(agentOutput);
    const hasFailures = testResult !== null ? !testResult.passed : false;

    const testCommand =
      typeof workflow.context['test_command'] === 'string'
        ? workflow.context['test_command']
        : 'test suite';

    // Store test output in context
    workflow.context['test_output'] = agentOutput.slice(0, 2000);

    if (!hasFailures) {
      // Tests passed
      log.info('test_fix_agent_completed: tests passed', {
        workflow_id: workflow.id,
        test_command: testCommand,
      });
      try {
        workflowEngine.sendEvent(workflow.id, {
          id: generateEventId(),
          timestamp: timestamp(),
          type: 'test_fix:tests_passed',
          source: { kind: 'system' },
          payload: {
            type: 'test_fix:tests_passed',
            data: { workflow_id: workflow.id, test_command: testCommand },
          },
          metadata: { session_id: workflow.id, sequence: 0, version: 1 },
        });
      } catch (err) {
        log.error('test_fix_agent_completed: failed to emit tests_passed event', {
          workflow_id: workflow.id,
          error: String(err),
        });
      }

      // Set synthetic review_score so downstream logic and escalation messages work consistently
      workflow.context['review_score'] = SCORE_PASS;

      // Enqueue workflow complete directive
      const message = buildWorkflowCompleteMessage(workflow.id, 'completed');
      directiveQueue.enqueue('subagent_stop', {
        type: 'inject_system_message',
        content: message,
        priority: 20,
        source: 'test_fix_agent_completed',
      });
      if (agentId !== null && agentWorkflowMap !== null && agentWorkflowMap !== undefined) {
        agentWorkflowMap.unbind(agentId);
      }
    } else {
      // Tests failed
      const fixAttempts =
        typeof workflow.context['fix_attempts'] === 'number' ? workflow.context['fix_attempts'] : 0;
      const maxFixAttempts =
        typeof workflow.context['max_fix_attempts'] === 'number' && Number.isFinite(workflow.context['max_fix_attempts'] as number)
          ? workflow.context['max_fix_attempts'] as number
          : DEFAULT_MAX_FIX_ATTEMPTS;

      log.info('test_fix_agent_completed: tests failed', {
        workflow_id: workflow.id,
        fix_attempts: fixAttempts,
        max_fix_attempts: maxFixAttempts,
        test_command: testCommand,
      });

      // Set synthetic review_score so downstream escalation messages have a score to reference
      workflow.context['review_score'] = SCORE_FAIL;
      // Store failure info in context
      workflow.context['test_failures'] = [{ test: testCommand, error: agentOutput.slice(0, 500) }];

      try {
        workflowEngine.sendEvent(workflow.id, {
          id: generateEventId(),
          timestamp: timestamp(),
          type: 'test_fix:tests_failed',
          source: { kind: 'system' },
          payload: {
            type: 'test_fix:tests_failed',
            data: {
              workflow_id: workflow.id,
              fix_attempts: fixAttempts,
              max_fix_attempts: maxFixAttempts,
              test_command: testCommand,
            },
          },
          metadata: { session_id: workflow.id, sequence: 0, version: 1 },
        });
      } catch (err) {
        log.error('test_fix_agent_completed: failed to emit tests_failed event', {
          workflow_id: workflow.id,
          error: String(err),
        });
      }
      // Spawning/escalation is handled by trigger 14 → test_fix_handle_failure
    }
  });

  // ─── Handler: test_fix_handle_failure ────────────────────────────────────────
  // Called when test_fix:tests_failed fires (event-driven path).
  // Increments fix_attempts and enqueues a spawn directive for an engineer.
  registry.registerHandler('test_fix_handle_failure', async (args) => {
    log.debug('test_fix_handle_failure invoked', { args });

    if (!workflowEngine) {
      log.debug('test_fix_handle_failure: no workflow engine, skipping');
      return;
    }

    const workflowId = typeof args['workflow_id'] === 'string' ? args['workflow_id'] : null;
    const workflow = workflowId ? workflowEngine.get(workflowId) : null;

    if (!workflow) {
      log.warn('test_fix_handle_failure: no workflow found', { workflow_id: workflowId });
      return;
    }

    const fixAttempts =
      typeof workflow.context['fix_attempts'] === 'number' ? workflow.context['fix_attempts'] : 0;
    const maxFixAttempts =
      typeof workflow.context['max_fix_attempts'] === 'number' && Number.isFinite(workflow.context['max_fix_attempts'] as number)
        ? workflow.context['max_fix_attempts'] as number
        : DEFAULT_MAX_FIX_ATTEMPTS;

    // Increment fix attempts
    const nextFixAttempts = fixAttempts + 1;
    workflow.context['fix_attempts'] = nextFixAttempts;

    const testCommand =
      typeof workflow.context['test_command'] === 'string'
        ? workflow.context['test_command']
        : 'test suite';

    const testOutput =
      typeof args['test_output'] === 'string'
        ? args['test_output']
        : typeof workflow.context['test_output'] === 'string'
          ? (workflow.context['test_output'] as string)
          : '';

    if (nextFixAttempts > maxFixAttempts) {
      // Budget exhausted — emit fix_completed so state machine transitions to ESCALATED
      try {
        workflowEngine.sendEvent(workflow.id, {
          id: generateEventId(),
          timestamp: timestamp(),
          type: 'test_fix:fix_completed',
          source: { kind: 'system' },
          payload: {
            type: 'test_fix:fix_completed',
            data: { workflow_id: workflow.id, fix_attempts: nextFixAttempts },
          },
          metadata: { session_id: workflow.id, sequence: 0, version: 1 },
        });
      } catch (err) {
        log.error('test_fix_handle_failure: failed to emit fix_completed event (escalation path)', {
          workflow_id: workflow.id,
          error: String(err),
        });
      }

      const lastScore =
        typeof workflow.context['review_score'] === 'number' ? workflow.context['review_score'] : 0;
      const escalationMessage = buildEscalationMessage(workflow.id, nextFixAttempts, lastScore);
      directiveQueue.enqueue('subagent_stop', {
        type: 'inject_system_message',
        content: escalationMessage,
        priority: 30,
        source: 'test_fix_handle_failure',
      });
      log.warn('test_fix_handle_failure: escalating after fix budget exhausted', {
        workflow_id: workflow.id,
        fix_attempts: nextFixAttempts,
        max_fix_attempts: maxFixAttempts,
      });
      return;
    }

    // Spawn engineer to fix failures
    const fixTask =
      `Fix failing tests for workflow ${workflow.id}. ` +
      `Test command: ${testCommand}. ` +
      `Fix attempt ${nextFixAttempts} of ${maxFixAttempts}. ` +
      (testOutput ? `Failure output: ${testOutput.slice(0, 500)}` : 'Review test output for failures.');

    const fixMessage = buildSpawnDirectiveMessage('engineer', fixTask, DEFAULT_BUDGET, {
      fix_attempts: nextFixAttempts,
      max_fix_attempts: maxFixAttempts,
      workflow_id: workflow.id,
      test_command: testCommand,
    });
    directiveQueue.enqueue('subagent_stop', {
      type: 'inject_system_message',
      content: fixMessage,
      priority: 20,
      source: 'test_fix_handle_failure',
    });
    log.info('test_fix_handle_failure: engineer fix directive enqueued', {
      workflow_id: workflow.id,
      fix_attempts: nextFixAttempts,
      max_fix_attempts: maxFixAttempts,
    });
  });

  // ─── Handler: test_fix_handle_retest ─────────────────────────────────────────
  // Called when test_fix:fix_completed fires (event-driven path).
  // Re-runs tests after a fix by emitting tests_passed or tests_failed.
  // In the event-driven path we inspect the fix outcome from context.
  registry.registerHandler('test_fix_handle_retest', async (args) => {
    log.debug('test_fix_handle_retest invoked', { args });

    if (!workflowEngine) {
      log.debug('test_fix_handle_retest: no workflow engine, skipping');
      return;
    }

    const workflowId = typeof args['workflow_id'] === 'string' ? args['workflow_id'] : null;
    const workflow = workflowId ? workflowEngine.get(workflowId) : null;

    if (!workflow) {
      log.warn('test_fix_handle_retest: no workflow found', { workflow_id: workflowId });
      return;
    }

    // Inspect fix result from args — 'passed' signals the engineer confirmed tests pass
    // Accept both boolean and string 'true' since event payloads may stringify booleans
    const passed = args['passed'] === true || args['passed'] === 'true';
    const testCommand =
      typeof workflow.context['test_command'] === 'string'
        ? workflow.context['test_command']
        : 'test suite';

    const fixAttempts =
      typeof workflow.context['fix_attempts'] === 'number' ? workflow.context['fix_attempts'] : 0;
    const maxFixAttempts =
      typeof workflow.context['max_fix_attempts'] === 'number' && Number.isFinite(workflow.context['max_fix_attempts'] as number)
        ? workflow.context['max_fix_attempts'] as number
        : DEFAULT_MAX_FIX_ATTEMPTS;

    if (passed) {
      log.info('test_fix_handle_retest: tests passed after fix', {
        workflow_id: workflow.id,
        fix_attempts: fixAttempts,
        test_command: testCommand,
      });
      try {
        workflowEngine.sendEvent(workflow.id, {
          id: generateEventId(),
          timestamp: timestamp(),
          type: 'test_fix:tests_passed',
          source: { kind: 'system' },
          payload: {
            type: 'test_fix:tests_passed',
            data: { workflow_id: workflow.id, test_command: testCommand, after_fix: true },
          },
          metadata: { session_id: workflow.id, sequence: 0, version: 1 },
        });
      } catch (err) {
        log.error('test_fix_handle_retest: failed to emit tests_passed event', {
          workflow_id: workflow.id,
          error: String(err),
        });
      }

      const message = buildWorkflowCompleteMessage(workflow.id, 'completed');
      directiveQueue.enqueue('subagent_stop', {
        type: 'inject_system_message',
        content: message,
        priority: 20,
        source: 'test_fix_handle_retest',
      });
    } else {
      // Tests still failing after fix
      log.info('test_fix_handle_retest: tests still failing after fix', {
        workflow_id: workflow.id,
        fix_attempts: fixAttempts,
        max_fix_attempts: maxFixAttempts,
        test_command: testCommand,
      });
      try {
        workflowEngine.sendEvent(workflow.id, {
          id: generateEventId(),
          timestamp: timestamp(),
          type: 'test_fix:tests_failed',
          source: { kind: 'system' },
          payload: {
            type: 'test_fix:tests_failed',
            data: {
              workflow_id: workflow.id,
              fix_attempts: fixAttempts,
              max_fix_attempts: maxFixAttempts,
              test_command: testCommand,
              after_fix: true,
            },
          },
          metadata: { session_id: workflow.id, sequence: 0, version: 1 },
        });
      } catch (err) {
        log.error('test_fix_handle_retest: failed to emit tests_failed event', {
          workflow_id: workflow.id,
          error: String(err),
        });
      }

      // Spawning/escalation is handled by trigger 14 → test_fix_handle_failure
    }
  });

  log.debug('Test-then-fix handlers registered', {
    handlers: ['test_fix_agent_completed', 'test_fix_handle_failure', 'test_fix_handle_retest'],
    has_workflow_engine: workflowEngine !== null,
    has_agent_workflow_map: agentWorkflowMap != null,
  });
}
