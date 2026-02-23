/**
 * WRFC Handler Registration
 *
 * Registers three named handlers with the TriggerRegistry that advance
 * the WRFC (Gather-Plan-Write-Review-Fix-Check) orchestration chain by enqueuing
 * directives into the DirectiveQueue.
 *
 * Handlers:
 * - `wrfc_chain_next`      — after an agent completes, spawn a reviewer
 * - `wrfc_review_response` — after review, either complete or spawn a fixer
 * - `wrfc_fix_response`    — after a fix, either escalate or re-review
 */

import { createLogger } from '../shared/logger.js';
import type { TriggerRegistry } from '../triggers/trigger-registry.js';
import type { DirectiveQueue } from './directive-queue.js';
import type { WorkflowEngine } from '../workflow/workflow-engine.js';
import type { AgentCoordinator } from '../agents/agent-coordinator.js';
import {
  buildSpawnDirectiveMessage,
  buildWorkflowCompleteMessage,
  buildEscalationMessage,
} from './directive-builder.js';

const log = createLogger('wrfc-handlers');

/** Default resource budget for spawned review/fix agents. */
const DEFAULT_BUDGET = { max_tokens: 50_000, max_turns: 20 };

// Only spawn reviewer when agent completes during the WRITING phase
// GATHERING and PLANNING agents produce context, not reviewable code
const REVIEWABLE_STATES = new Set(['WRITING']);

/**
 * Register the three WRFC handler functions with the TriggerRegistry.
 *
 * @param registry          - The trigger registry to register handlers on.
 * @param directiveQueue    - The directive queue to enqueue messages into.
 * @param workflowEngine    - Optional workflow engine for state inspection.
 * @param agentCoordinator  - Optional agent coordinator (reserved for future use).
 */
export function registerWRFCHandlers(
  registry: TriggerRegistry,
  directiveQueue: DirectiveQueue,
  workflowEngine: WorkflowEngine | null,
  agentCoordinator: AgentCoordinator | null,
): void {
  // ─── Handler 1: wrfc_chain_next ─────────────────────────────────────────────
  // Called when hook:agent:completed fires.
  // If there is an active workflow in a reviewable state, spawn a reviewer.
  registry.registerHandler('wrfc_chain_next', async (args) => {
    log.debug('wrfc_chain_next invoked', { args });

    if (!workflowEngine) {
      log.debug('wrfc_chain_next: no workflow engine, skipping');
      return;
    }

    // Find the target workflow - prefer explicit ID from event, fall back to most recent active
    const workflowId = typeof args['workflow_id'] === 'string' ? args['workflow_id'] : null;
    let workflow = workflowId ? workflowEngine.get(workflowId) : null;
    if (!workflow) {
      const activeWorkflows = workflowEngine.listActive();
      if (activeWorkflows.length === 0) {
        log.debug('wrfc_chain_next: no active workflows, skipping');
        return;
      }
      workflow = activeWorkflows[activeWorkflows.length - 1];
    }
    const currentState = workflow.current_state.toUpperCase();

    if (!REVIEWABLE_STATES.has(currentState)) {
      log.debug('wrfc_chain_next: workflow state not reviewable', {
        workflow_id: workflow.id,
        current_state: workflow.current_state,
      });
      return;
    }

    const filesModified = Array.isArray(workflow.context.files_modified)
      ? (workflow.context.files_modified as string[])
      : [];

    const task =
      `Review the work completed in workflow ${workflow.id}. ` +
      `Current state: ${workflow.current_state}. ` +
      (filesModified.length > 0
        ? `Files modified: ${filesModified.join(', ')}.`
        : 'No files recorded yet.');

    const message = buildSpawnDirectiveMessage('reviewer', task, DEFAULT_BUDGET, {
      files_modified: filesModified,
      workflow_id: workflow.id,
    });

    directiveQueue.enqueue('subagent_stop', {
      type: 'inject_system_message',
      content: message,
      priority: 20,
      source: 'wrfc_chain_next',
    });

    log.info('wrfc_chain_next: reviewer directive enqueued', {
      workflow_id: workflow.id,
      current_state: workflow.current_state,
    });
  });

  // ─── Handler 2: wrfc_review_response ────────────────────────────────────────
  // Called when wrfc:review_completed fires.
  // If score >= 10, complete the workflow; otherwise spawn an engineer fixer.
  registry.registerHandler('wrfc_review_response', async (args) => {
    log.debug('wrfc_review_response invoked', { args });

    const rawScore = args['review_score'];
    const reviewScore = typeof rawScore === 'number' ? rawScore : Number(rawScore ?? 0);

    // Parse review_issues — may arrive as a string from template resolution
    let reviewIssues: Array<{ dimension: string; severity: string; description: string }> = [];
    const rawIssues = args['review_issues'];
    if (Array.isArray(rawIssues)) {
      reviewIssues = rawIssues as typeof reviewIssues;
    } else if (typeof rawIssues === 'string' && rawIssues.length > 0) {
      try {
        const parsed: unknown = JSON.parse(rawIssues);
        if (Array.isArray(parsed)) {
          reviewIssues = parsed as typeof reviewIssues;
        }
      } catch {
        log.warn('wrfc_review_response: could not parse review_issues', { raw: rawIssues });
      }
    }

    // Parse files_modified
    let filesModified: string[] = [];
    const rawFiles = args['files_modified'];
    if (Array.isArray(rawFiles)) {
      filesModified = rawFiles as string[];
    } else if (typeof rawFiles === 'string' && rawFiles.length > 0) {
      try {
        const parsed: unknown = JSON.parse(rawFiles);
        if (Array.isArray(parsed)) filesModified = parsed as string[];
      } catch {
        filesModified = [rawFiles];
      }
    }

    // Find the target workflow - prefer explicit ID from event, fall back to most recent active
    const workflowId =
      typeof args['workflow_id'] === 'string'
        ? args['workflow_id']
        : (() => {
            const activeWorkflows = workflowEngine?.listActive() ?? [];
            return activeWorkflows[activeWorkflows.length - 1]?.id ?? 'unknown';
          })();

    if (reviewScore >= 10) {
      // Workflow complete — enqueue completion message
      const message = buildWorkflowCompleteMessage(workflowId, 'completed');
      directiveQueue.enqueue('subagent_stop', {
        type: 'inject_system_message',
        content: message,
        priority: 20,
        source: 'wrfc_review_response',
      });
      log.info('wrfc_review_response: workflow complete directive enqueued', {
        workflow_id: workflowId,
        review_score: reviewScore,
      });
      return;
    }

    // Score < 10 — spawn an engineer to fix the issues
    const wf = workflowEngine?.get(workflowId);
    const fixAttempts = typeof wf?.context.fix_attempts === 'number' ? wf.context.fix_attempts : 0;
    const maxFixAttempts = typeof wf?.context.max_fix_attempts === 'number' ? wf.context.max_fix_attempts : 3;

    const issuesSummary =
      reviewIssues.length > 0
        ? reviewIssues.map((i) => `[${i.severity}] ${i.dimension}: ${i.description}`).join('; ')
        : 'See previous review output for details.';

    const task =
      `Fix the issues identified in the code review for workflow ${workflowId}. ` +
      `Review score: ${reviewScore}/10. Issues: ${issuesSummary}`;

    const message = buildSpawnDirectiveMessage('engineer', task, DEFAULT_BUDGET, {
      files_modified: filesModified,
      review_score: reviewScore,
      review_issues: reviewIssues,
      fix_attempts: fixAttempts,
      max_fix_attempts: maxFixAttempts,
      workflow_id: workflowId,
    });

    directiveQueue.enqueue('subagent_stop', {
      type: 'inject_system_message',
      content: message,
      priority: 20,
      source: 'wrfc_review_response',
    });

    log.info('wrfc_review_response: engineer fix directive enqueued', {
      workflow_id: workflowId,
      review_score: reviewScore,
      issues_count: reviewIssues.length,
    });
  });

  // ─── Handler 3: wrfc_fix_response ───────────────────────────────────────────
  // Called when wrfc:fix_completed fires.
  // If fix budget exhausted, escalate; otherwise spawn a reviewer for re-review.
  registry.registerHandler('wrfc_fix_response', async (args) => {
    log.debug('wrfc_fix_response invoked', { args });

    const rawFix = args['fix_attempts'];
    const fixAttempts = typeof rawFix === 'number' ? rawFix : Number(rawFix ?? 0);

    const rawMax = args['max_fix_attempts'];
    const maxFixAttempts = typeof rawMax === 'number' ? rawMax : Number(rawMax ?? 3);

    // Find the target workflow - prefer explicit ID from event, fall back to most recent active
    const fixWorkflowId = typeof args['workflow_id'] === 'string' ? args['workflow_id'] : null;
    let fixWorkflow = fixWorkflowId ? workflowEngine?.get(fixWorkflowId) ?? null : null;
    if (!fixWorkflow) {
      const activeWorkflows = workflowEngine?.listActive() ?? [];
      fixWorkflow = activeWorkflows[activeWorkflows.length - 1] ?? null;
    }
    const workflowId = fixWorkflow?.id ?? 'unknown';
    const workflow = fixWorkflow;

    const filesModified = Array.isArray(workflow?.context.files_modified)
      ? (workflow.context.files_modified as string[])
      : [];

    if (fixAttempts >= maxFixAttempts) {
      // Escalate — fix budget exhausted
      const lastScore =
        typeof workflow?.context.review_score === 'number'
          ? (workflow.context.review_score as number)
          : 0;

      const message = buildEscalationMessage(workflowId, fixAttempts, lastScore);
      directiveQueue.enqueue('subagent_stop', {
        type: 'inject_system_message',
        content: message,
        priority: 30,
        source: 'wrfc_fix_response',
      });
      log.warn('wrfc_fix_response: escalation directive enqueued', {
        workflow_id: workflowId,
        fix_attempts: fixAttempts,
        max_fix_attempts: maxFixAttempts,
      });
      return;
    }

    // More attempts available — spawn a reviewer for re-review
    const task =
      `Re-review the code after fix attempt ${fixAttempts} of ${maxFixAttempts} for workflow ${workflowId}. ` +
      (filesModified.length > 0
        ? `Files modified: ${filesModified.join(', ')}.`
        : 'Check all recently modified files.');

    const message = buildSpawnDirectiveMessage('reviewer', task, DEFAULT_BUDGET, {
      files_modified: filesModified,
      fix_attempts: fixAttempts,
      max_fix_attempts: maxFixAttempts,
      workflow_id: workflowId,
    });

    directiveQueue.enqueue('subagent_stop', {
      type: 'inject_system_message',
      content: message,
      priority: 20,
      source: 'wrfc_fix_response',
    });

    log.info('wrfc_fix_response: re-review directive enqueued', {
      workflow_id: workflowId,
      fix_attempts: fixAttempts,
      max_fix_attempts: maxFixAttempts,
    });
  });

  log.debug('WRFC handlers registered', {
    handlers: ['wrfc_chain_next', 'wrfc_review_response', 'wrfc_fix_response'],
    has_workflow_engine: workflowEngine !== null,
    has_agent_coordinator: agentCoordinator !== null,
  });
}
