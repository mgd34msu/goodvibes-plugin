/**
 * Review-Only Handler Registration
 *
 * Registers one named handler with the TriggerRegistry that drives
 * the review-only orchestration chain. This workflow completes after
 * a single review pass with no fix cycle.
 *
 * Handlers:
 * - `review_only_agent_completed` — on `hook:agent:completed`: checks if the
 *                                   agent is in a review_only workflow, extracts
 *                                   the review score from output, updates context,
 *                                   emits review_only:review_completed, and
 *                                   enqueues an informational directive.
 */

import { createLogger } from '../../shared/logger.js';
import { generateEventId, timestamp } from '../../shared/utils.js';
import type { TriggerRegistry } from '../triggers/trigger-registry.js';
import type { DirectiveQueue } from './directive-queue.js';
import type { WorkflowEngine } from '../workflow/workflow-engine.js';
import type { AgentWorkflowMap } from './agent-workflow-map.js';
import { buildWorkflowCompleteMessage } from './legacy-directive-builder.js';
import { extractReviewScore } from './gv-tag-parser.js';

const log = createLogger('review-only-handlers');

/** Workflow definition ID for the review-only chain. */
const REVIEW_ONLY_DEFINITION_ID = 'review_only';

/**
 * Register the review-only handler function with the TriggerRegistry.
 *
 * @param registry         - The trigger registry to register handlers on.
 * @param directiveQueue   - The directive queue to enqueue messages into.
 * @param workflowEngine   - Optional workflow engine for state inspection.
 * @param agentWorkflowMap - Optional agent-to-workflow binding map.
 */
export function registerReviewOnlyHandlers(
  registry: TriggerRegistry,
  directiveQueue: DirectiveQueue,
  workflowEngine: WorkflowEngine | null,
  agentWorkflowMap?: AgentWorkflowMap | null,
): void {
  // ─── Handler: review_only_agent_completed ────────────────────────────────────
  // Called when hook:agent:completed fires.
  // Only processes agents belonging to a review_only workflow.
  // Extracts review score, updates context, emits review_only:review_completed,
  // then enqueues an informational workflow complete directive.
  registry.registerHandler('review_only_agent_completed', async (args) => {
    log.debug('review_only_agent_completed invoked', { args });

    if (!workflowEngine) {
      log.debug('review_only_agent_completed: no workflow engine, skipping');
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
      log.debug('review_only_agent_completed: no review_only workflow found for agent', {
        agent_id: agentId,
      });
      return;
    }

    // Only handle review_only workflows
    if (workflow.definition_id !== REVIEW_ONLY_DEFINITION_ID) {
      log.debug('review_only_agent_completed: workflow is not review_only, skipping', {
        workflow_id: workflow.id,
        definition_id: workflow.definition_id,
      });
      return;
    }

    // Extract reviewer output and parse score
    const agentOutput =
      (hookInput?.['last_assistant_message'] as string | undefined) ||
      (hookInput?.['task_output'] as string | undefined) ||
      (hookInput?.['result'] as string | undefined);

    const score = extractReviewScore(agentOutput);

    // Update workflow context with review results
    if (score !== null) {
      workflow.context['review_score'] = score;
      log.info('review_only_agent_completed: review score extracted', {
        workflow_id: workflow.id,
        review_score: score,
        agent_id: agentId,
      });
    } else {
      log.warn('review_only_agent_completed: could not parse review score from output', {
        workflow_id: workflow.id,
        output_preview: agentOutput?.slice(0, 200),
      });
    }

    // Store the reviewer output in context
    if (agentOutput) {
      workflow.context['review_output'] = agentOutput.slice(0, 2000);
    }

    // Emit review_only:review_completed to advance the state machine
    try {
      workflowEngine.sendEvent(workflow.id, {
        id: generateEventId(),
        timestamp: timestamp(),
        type: 'review_only:review_completed',
        source: { kind: 'system' },
        payload: {
          type: 'review_only:review_completed',
          data: {
            workflow_id: workflow.id,
            review_score: score,
            agent_id: agentId,
          },
        },
        metadata: { session_id: workflow.id, sequence: 0, version: 1 },
      });
    } catch (err) {
      log.error('review_only_agent_completed: failed to emit review_completed event', {
        workflow_id: workflow.id,
        error: String(err),
      });
    }

    // Enqueue informational workflow complete directive
    const message = buildWorkflowCompleteMessage(workflow.id, 'completed');
    directiveQueue.enqueue('subagent_stop', {
      type: 'inject_system_message',
      content: message,
      priority: 20,
      source: 'review_only_agent_completed',
      workflow_id: workflow.id,
    });

    // Clean up agent-workflow binding
    if (agentId && agentWorkflowMap) {
      agentWorkflowMap.unbind(agentId);
    }

    log.info('review_only_agent_completed: review workflow complete directive enqueued', {
      workflow_id: workflow.id,
      review_score: score,
      agent_id: agentId,
    });
  });

  log.debug('Review-only handlers registered', {
    handlers: ['review_only_agent_completed'],
    has_workflow_engine: workflowEngine !== null,
    has_agent_workflow_map: agentWorkflowMap != null,
  });
}
