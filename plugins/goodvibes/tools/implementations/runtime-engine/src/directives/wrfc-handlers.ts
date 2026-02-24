/**
 * WRFC Handler Registration
 *
 * Registers four named handlers with the TriggerRegistry that drive
 * the WRFC (Gather-Plan-Write-Review-Fix-Check) orchestration chain by
 * creating workflow instances, maintaining agent-to-workflow bindings,
 * and enqueuing directives into the DirectiveQueue.
 *
 * Handlers:
 * - `wrfc_agent_spawned`  — on `hook:agent:spawned`: creates a new workflow
 *                           (or binds to an existing one if workflow_id is
 *                           present in the event). Stores the agent_id → workflow_id
 *                           binding in the AgentWorkflowMap.
 * - `wrfc_chain_next`     — on `hook:agent:completed`: looks up the workflow
 *                           via the AgentWorkflowMap, checks whether the agent
 *                           type is on the auto-complete whitelist, then routes
 *                           to review, fix, escalation, or auto-complete.
 * - `wrfc_review_response` — after review (event-driven path), either complete
 *                           or spawn a fixer. Delegates to handleReviewResult.
 * - `wrfc_fix_response`   — after a fix (event-driven path), either escalate
 *                           or re-review. Delegates to handleFixResult.
 */

import { createLogger } from '../shared/logger.js';
import { generateEventId, timestamp } from '../shared/utils.js';
import type { TriggerRegistry } from '../triggers/trigger-registry.js';
import type { DirectiveQueue } from './directive-queue.js';
import type { WorkflowEngine } from '../workflow/workflow-engine.js';
import type { AgentCoordinator } from '../agents/agent-coordinator.js';
import type { WorkflowInstance } from '../workflow/types.js';
import type { AgentWorkflowMap } from './agent-workflow-map.js';
import {
  buildSpawnDirectiveMessage,
  buildWorkflowCompleteMessage,
  buildEscalationMessage,
} from './directive-builder.js';
import { extractReviewScore, extractFiles } from './gv-tag-parser.js';

const log = createLogger('wrfc-handlers');

/** Default resource budget for spawned review/fix agents. */
const DEFAULT_BUDGET = { max_tokens: 50_000, max_turns: 20 };

/** Agent type identifiers that are treated as reviewers. */
const REVIEWER_AGENT_TYPES = new Set(['reviewer', 'goodvibes:reviewer']);

/** Agent type identifiers that are treated as engineers (fixers). */
const ENGINEER_AGENT_TYPES = new Set(['engineer', 'goodvibes:engineer']);

/** Default minimum review score to pass (configurable per workflow). */
const DEFAULT_MIN_REVIEW_SCORE = 9.5;

/** Default maximum fix attempts before escalation. */
const DEFAULT_MAX_FIX_ATTEMPTS = 3;


/**
 * Agent types that auto-complete without entering the WRFC review cycle.
 *
 * Only non-work agent types that produce no reviewable output are listed.
 * When in doubt, err toward review (false negatives are harmless;
 * false positives — skipping review on real work — are dangerous).
 *
 * goodvibes agent types (goodvibes:engineer, goodvibes:reviewer, etc.)
 * are intentionally NOT listed — they always get reviewed.
 */
export const AUTO_COMPLETE_AGENT_TYPES = new Set([
  'Explore',
  'Plan',
  'Bash',
  'general-purpose',
]);


// ─── Shared Result-Handling Helpers ────────────────────────────────────────────────────

/**
 * Shared logic for handling a completed review.
 *
 * Sends the wrfc:review_completed state-machine event, writes
 * min_review_score into workflow context so guards evaluate correctly,
 * then either enqueues a workflow-complete directive or a fixer directive.
 */
function handleReviewResult(params: {
  workflowEngine: WorkflowEngine;
  directiveQueue: DirectiveQueue;
  workflow: WorkflowInstance;
  score: number;
  filesModified: string[];
  reviewIssues?: Array<{ dimension: string; severity: string; description: string }>;
  source: string;
  agentWorkflowMap?: AgentWorkflowMap | null;
  agentId?: string;
}): void {
  const {
    workflowEngine,
    directiveQueue,
    workflow,
    score,
    filesModified,
    reviewIssues = [],
    source,
    agentWorkflowMap,
    agentId,
  } = params;

  const minScore =
    typeof workflow.context.min_review_score === 'number'
      ? workflow.context.min_review_score
      : DEFAULT_MIN_REVIEW_SCORE;

  const maxFixAttempts =
    typeof workflow.context.max_fix_attempts === 'number'
      ? workflow.context.max_fix_attempts
      : DEFAULT_MAX_FIX_ATTEMPTS;

  const fixAttempts =
    typeof workflow.context.fix_attempts === 'number' ? workflow.context.fix_attempts : 0;

  // Write configurable thresholds into context BEFORE sendEvent so guards evaluate correctly
  workflow.context.review_score = score;
  workflow.context.min_review_score = minScore;
  workflow.context.max_fix_attempts = maxFixAttempts;

  // Advance state machine
  try {
    workflowEngine.sendEvent(workflow.id, {
      id: generateEventId(),
      timestamp: timestamp(),
      type: 'wrfc:review_completed',
      source: { kind: 'system' },
      payload: {
        type: 'wrfc:review_completed',
        data: { review_score: score },
      },
      metadata: { session_id: workflow.id, sequence: 0, version: 1 },
    });
  } catch (err) {
    log.error('handleReviewResult: failed to advance workflow state', { workflow_id: workflow.id, error: String(err) });
  }

  if (score >= minScore) {
    // Score meets threshold → complete workflow
    const message = buildWorkflowCompleteMessage(workflow.id, 'completed');
    directiveQueue.enqueue('subagent_stop', {
      type: 'inject_system_message',
      content: message,
      priority: 20,
      source,
    });
    // Clean up agent-workflow binding
    if (agentId && agentWorkflowMap) {
      agentWorkflowMap.unbind(agentId);
    }
    log.info(`${source}: workflow complete directive enqueued`, {
      workflow_id: workflow.id,
      review_score: score,
      min_review_score: minScore,
    });
  } else {
    // Score below threshold → spawn fixer
    const issuesSummary =
      reviewIssues.length > 0
        ? reviewIssues.map((i) => `[${i.severity}] ${i.dimension}: ${i.description}`).join('; ')
        : 'See previous review output for details.';

    const fixTask =
      `Fix the issues identified in the code review for workflow ${workflow.id}. ` +
      `Review score: ${score}/10 (threshold: ${minScore}). Issues: ${issuesSummary}` +
      (filesModified.length > 0 ? ` Files: ${filesModified.join(', ')}.` : '');

    const fixMessage = buildSpawnDirectiveMessage('engineer', fixTask, DEFAULT_BUDGET, {
      files_modified: filesModified,
      review_score: score,
      review_issues: reviewIssues,
      fix_attempts: fixAttempts,
      max_fix_attempts: maxFixAttempts,
      workflow_id: workflow.id,
    });

    directiveQueue.enqueue('subagent_stop', {
      type: 'inject_system_message',
      content: fixMessage,
      priority: 20,
      source,
    });
    log.info(`${source}: engineer fix directive enqueued`, {
      workflow_id: workflow.id,
      review_score: score,
      min_review_score: minScore,
      issues_count: reviewIssues.length,
    });
  }
}

/**
 * Shared logic for handling a completed fix attempt.
 *
 * Increments fix_attempts in context, sends the wrfc:fix_completed
 * state-machine event so guards (which compare fix_attempts against
 * max_fix_attempts) evaluate against current values, then either
 * enqueues an escalation directive or a re-review directive.
 */
/** Sends the wrfc:fix_completed state-machine event. */
function sendFixCompletedEvent(
  workflowEngine: WorkflowEngine,
  workflowId: string,
  fixAttempts: number,
  logContext: { source: string },
): void {
  try {
    workflowEngine.sendEvent(workflowId, {
      id: generateEventId(),
      timestamp: timestamp(),
      type: 'wrfc:fix_completed',
      source: { kind: 'system' },
      payload: {
        type: 'wrfc:fix_completed',
        data: { fix_attempts: fixAttempts },
      },
      metadata: { session_id: workflowId, sequence: 0, version: 1 },
    });
  } catch (err) {
    log.error(`${logContext.source}: failed to advance workflow state (fix_completed)`, { workflow_id: workflowId, error: String(err) });
  }
}

function handleFixResult(params: {
  workflowEngine: WorkflowEngine;
  directiveQueue: DirectiveQueue;
  workflow: WorkflowInstance;
  incomingFixAttempts: number;
  maxFixAttempts: number;
  filesModified: string[];
  source: string;
  agentWorkflowMap?: AgentWorkflowMap | null;
  agentId?: string;
}): void {
  const {
    workflowEngine,
    directiveQueue,
    workflow,
    incomingFixAttempts,
    maxFixAttempts,
    filesModified,
    source,
    agentWorkflowMap,
    agentId,
  } = params;

  // Increment and persist fix attempts in context
  const fixAttempts = incomingFixAttempts + 1;
  workflow.context.fix_attempts = fixAttempts;
  workflow.context.max_fix_attempts = maxFixAttempts;

  if (fixAttempts >= maxFixAttempts) {
    // Fix budget exhausted → send event to advance state, then escalate
    const lastScore =
      typeof workflow.context.review_score === 'number' ? workflow.context.review_score : 0;

    // Advance state machine BEFORE enqueuing escalation directive
    sendFixCompletedEvent(workflowEngine, workflow.id, fixAttempts, { source: 'handleFixResult' });

    const escalationMessage = buildEscalationMessage(workflow.id, fixAttempts, lastScore);
    directiveQueue.enqueue('subagent_stop', {
      type: 'inject_system_message',
      content: escalationMessage,
      priority: 30,
      source,
    });
    // Clean up agent-workflow binding on escalation
    if (agentId && agentWorkflowMap) {
      agentWorkflowMap.unbind(agentId);
    }
    log.warn(`${source}: escalation directive enqueued`, {
      workflow_id: workflow.id,
      fix_attempts: fixAttempts,
      max_fix_attempts: maxFixAttempts,
    });
  } else {
    // Still have fix budget → advance state machine and spawn reviewer for re-check
    sendFixCompletedEvent(workflowEngine, workflow.id, fixAttempts, { source: 'handleFixResult' });

    const recheckTask =
      `Re-review the code after fix attempt ${fixAttempts} of ${maxFixAttempts} for workflow ${workflow.id}. ` +
      (filesModified.length > 0
        ? `Files modified: ${filesModified.join(', ')}.`
        : 'Check all recently modified files.');

    const recheckMessage = buildSpawnDirectiveMessage('reviewer', recheckTask, DEFAULT_BUDGET, {
      files_modified: filesModified,
      fix_attempts: fixAttempts,
      max_fix_attempts: maxFixAttempts,
      workflow_id: workflow.id,
    });

    directiveQueue.enqueue('subagent_stop', {
      type: 'inject_system_message',
      content: recheckMessage,
      priority: 20,
      source,
    });
    log.info(`${source}: re-review directive enqueued`, {
      workflow_id: workflow.id,
      fix_attempts: fixAttempts,
      max_fix_attempts: maxFixAttempts,
    });
  }
}

/**
 * Register the four WRFC handler functions with the TriggerRegistry.
 *
 * @param registry          - The trigger registry to register handlers on.
 * @param directiveQueue    - The directive queue to enqueue messages into.
 * @param workflowEngine    - Optional workflow engine for state inspection.
 * @param agentCoordinator  - Optional agent coordinator (reserved for future use).
 * @param agentWorkflowMap  - Optional agent-to-workflow binding map. When provided,
 *                            enables deterministic per-agent workflow routing and
 *                            auto-complete whitelist evaluation.
 */
export function registerWRFCHandlers(
  registry: TriggerRegistry,
  directiveQueue: DirectiveQueue,
  workflowEngine: WorkflowEngine | null,
  agentCoordinator: AgentCoordinator | null,
  agentWorkflowMap?: AgentWorkflowMap | null,
): void {
  // ─── Handler 0: wrfc_agent_spawned ────────────────────────────────────────────────────
  // Called on hook:agent:spawned.
  // Decision 2: creates a workflow with ID `wrfc_{agent_id}` (or binds to
  // an existing one if workflow_id is supplied in the event — meaning this
  // agent is part of an already-running chain) and stores the binding.
  registry.registerHandler('wrfc_agent_spawned', async (args) => {
    log.debug('wrfc_agent_spawned invoked', { args });

    const agentId = typeof args['agent_id'] === 'string' ? args['agent_id'] : null;
    if (!agentId) {
      log.debug('wrfc_agent_spawned: no agent_id in args, skipping');
      return;
    }

    const agentType = typeof args['agent_type'] === 'string' ? args['agent_type'] : '';

    // Determine the workflow_id for this agent
    const incomingWorkflowId =
      typeof args['workflow_id'] === 'string' && args['workflow_id'].length > 0
        ? args['workflow_id']
        : null;

    const workflowId = incomingWorkflowId ?? `wrfc_${agentId}`;

    // Store the binding so wrfc_chain_next can look it up on completion
    if (agentWorkflowMap) {
      agentWorkflowMap.bind(agentId, workflowId);
    }

    // Only create a new workflow instance for chain originators (no incoming workflow_id)
    if (!incomingWorkflowId && workflowEngine) {
      try {
        workflowEngine.create(
          'wrfc_loop',
          {
            trigger: 'agent_spawned',
            agent_id: agentId,
            agent_type: agentType,
            task: typeof args['task'] === 'string' ? args['task'] : '',
          },
          workflowId,
        );
        log.info('wrfc_agent_spawned: created workflow for originator agent', {
          agent_id: agentId,
          agent_type: agentType,
          workflow_id: workflowId,
        });

        // Advance state machine through IDLE → GATHERING → PLANNING → WRITING.
        // The originator agent IS the writer — gathering/planning phases are
        // conceptually complete by the time the orchestrator spawns an agent.
        // Without these sendEvent calls, the workflow stays in IDLE forever
        // because WorkflowEngine.create() only emits workflow:created to the
        // EventBus (external notification), NOT through sendEvent() (state machine).
        const advanceEvents = [
          { type: 'workflow:created' as const },   // IDLE → GATHERING
          { type: 'wrfc:plan_submitted' as const }, // GATHERING → PLANNING
          { type: 'wrfc:writing_started' as const }, // PLANNING → WRITING
        ];
        for (const evt of advanceEvents) {
          try {
            workflowEngine.sendEvent(workflowId, {
              id: generateEventId(),
              timestamp: timestamp(),
              type: evt.type,
              source: { kind: 'system' },
              payload: {
                type: evt.type,
                data: { workflow_id: workflowId, auto_advance: true },
              },
              metadata: { session_id: workflowId, sequence: 0, version: 1 },
            });
          } catch (advErr) {
            log.error('wrfc_agent_spawned: failed to advance workflow state', {
              workflow_id: workflowId,
              event: evt.type,
              error: String(advErr),
            });
            break; // Stop advancing on first failure
          }
        }
        log.info('wrfc_agent_spawned: workflow advanced to WRITING', {
          workflow_id: workflowId,
        });
      } catch (err) {
        log.error('wrfc_agent_spawned: failed to create workflow', {
          agent_id: agentId,
          workflow_id: workflowId,
          error: String(err),
        });
        // Unbind on failure so the map stays consistent
        if (agentWorkflowMap) {
          agentWorkflowMap.unbind(agentId);
        }
      }
    } else if (incomingWorkflowId) {
      log.info('wrfc_agent_spawned: bound chain agent to existing workflow', {
        agent_id: agentId,
        agent_type: agentType,
        workflow_id: workflowId,
      });
    }
  });

  // ─── Handler 1: wrfc_chain_next ──────────────────────────────────────────────────────────
  // Universal router called when hook:agent:completed fires.
  // Decision 2: looks up the workflow via agent_id from the AgentWorkflowMap
  // instead of falling back to "most recent active".
  // Decision 3: checks the auto-complete whitelist before entering WRFC review.
  registry.registerHandler('wrfc_chain_next', async (args) => {
    log.debug('wrfc_chain_next invoked', { args });

    if (!workflowEngine) {
      log.debug('wrfc_chain_next: no workflow engine, skipping');
      return;
    }

    // Extract agent metadata from hook_input
    const rawHookInput = args['hook_input'];
    const hookInput = (typeof rawHookInput === 'object' && rawHookInput !== null && !Array.isArray(rawHookInput))
      ? rawHookInput as Record<string, unknown>
      : null;
    const agentId = typeof hookInput?.['agent_id'] === 'string' ? hookInput['agent_id'] : null;
    const agentType = (hookInput?.['agent_type'] ?? hookInput?.['subagent_type'] ?? '') as string;

    // Decision 2: look up workflow via agent_id map, fall back to explicit workflow_id,
    // then fall back to most-recent active (backward compatibility).
    let workflowId: string | null = null;
    if (agentId && agentWorkflowMap) {
      workflowId = agentWorkflowMap.lookup(agentId) ?? null;
    }
    if (!workflowId) {
      workflowId = typeof args['workflow_id'] === 'string' ? args['workflow_id'] : null;
    }

    let workflow = workflowId ? workflowEngine.get(workflowId) : null;
    if (!workflow) {
      const activeWorkflows = workflowEngine.listActive();
      if (activeWorkflows.length === 0) {
        log.debug('wrfc_chain_next: no active workflows, skipping');
        return;
      }
      workflow = activeWorkflows[activeWorkflows.length - 1];
    }
    const currentState = (workflow.current_state ?? '').toUpperCase();

    // Decision 3: Auto-complete whitelist check.
    // Only applies when the agent just completed (WRITING state = agent did work).
    // If the agent type is on the whitelist, skip review and auto-complete.
    // Safety-net: if the workflow is still in an early state (IDLE, GATHERING, PLANNING),
    // treat it the same as WRITING — the agent already did work, we just failed to
    // advance the state machine. This prevents silent fall-through.
    const earlyStates = new Set(['IDLE', 'GATHERING', 'PLANNING']);
    const effectiveState = earlyStates.has(currentState) ? 'WRITING' : currentState;

    if (earlyStates.has(currentState)) {
      log.warn('wrfc_chain_next: workflow stuck in early state, treating as WRITING', {
        workflow_id: workflow.id,
        actual_state: currentState,
        effective_state: 'WRITING',
      });
      // Try to advance the workflow to WRITING before proceeding
      const advanceEvents = [
        ...(currentState === 'IDLE' ? [{ type: 'workflow:created' as const }] : []),
        ...(currentState === 'IDLE' || currentState === 'GATHERING' ? [{ type: 'wrfc:plan_submitted' as const }] : []),
        { type: 'wrfc:writing_started' as const },
      ];
      for (const evt of advanceEvents) {
        try {
          workflowEngine.sendEvent(workflow.id, {
            id: generateEventId(),
            timestamp: timestamp(),
            type: evt.type,
            source: { kind: 'system' },
            payload: {
              type: evt.type,
              data: { workflow_id: workflow.id, recovery_advance: true },
            },
            metadata: { session_id: workflow.id, sequence: 0, version: 1 },
          });
        } catch (recErr) {
          log.debug('wrfc_chain_next: recovery advance failed (best-effort)', {
            workflow_id: workflow.id,
            event: evt.type,
            error: String(recErr),
          });
        }
      }
    }

    if (effectiveState === 'WRITING' && agentType && AUTO_COMPLETE_AGENT_TYPES.has(agentType)) {
      const message = buildWorkflowCompleteMessage(workflow.id, 'completed');
      directiveQueue.enqueue('subagent_stop', {
        type: 'inject_system_message',
        content: message,
        priority: 20,
        source: 'wrfc_chain_next',
      });
      // Clean up the binding
      if (agentId && agentWorkflowMap) {
        agentWorkflowMap.unbind(agentId);
      }
      log.info('wrfc_chain_next: auto-complete for whitelisted agent type', {
        workflow_id: workflow.id,
        agent_type: agentType,
        agent_id: agentId,
      });
      return;
    }

    if (effectiveState === 'WRITING') {
      // ── WRITING state: engineer completed → spawn reviewer ─────────────────────
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

      // Advance state machine: WRITING → REVIEWING so subsequent hook:agent:completed
      // events route to the REVIEWING branch instead of re-spawning another reviewer.
      try {
        workflowEngine.sendEvent(workflow.id, {
          id: generateEventId(),
          timestamp: timestamp(),
          type: 'wrfc:review_started',
          source: { kind: 'system' },
          payload: {
            type: 'wrfc:review_started',
            data: { workflow_id: workflow.id },
          },
          metadata: { session_id: workflow.id, sequence: 0, version: 1 },
        });
      } catch (err) {
        log.error('wrfc_chain_next: failed to advance workflow state WRITING→REVIEWING', {
          workflow_id: workflow.id,
          error: String(err),
        });
      }

      log.info('wrfc_chain_next: reviewer directive enqueued, state advanced to REVIEWING', {
        workflow_id: workflow.id,
        current_state: workflow.current_state,
      });
    } else if (effectiveState === 'REVIEWING') {
      // ── REVIEWING state: reviewer completed → delegate to handleReviewResult
      const isReviewer = REVIEWER_AGENT_TYPES.has(agentType);

      if (!isReviewer) {
        log.debug('wrfc_chain_next: REVIEWING state but agent is not a reviewer, skipping', {
          workflow_id: workflow.id,
          agent_type: agentType,
        });
        return;
      }

      // FIX-TRACE-B: Added last_assistant_message as the primary source of reviewer output.
      // SubagentStop sends rawInput with last_assistant_message (not task_output/result).
      // task_output and result are kept as fallbacks for other hook sources.
      const taskOutput =
        (hookInput?.['last_assistant_message'] as string | undefined) ||
        (hookInput?.['task_output'] as string | undefined) ||
        (hookInput?.['result'] as string | undefined);
      const score = extractReviewScore(taskOutput);

      if (score === null) {
        log.warn('wrfc_chain_next: could not parse review score from reviewer output', {
          workflow_id: workflow.id,
          task_output_preview: taskOutput?.slice(0, 200),
        });
        return;
      }

      const filesModified = Array.isArray(workflow.context.files_modified)
        ? (workflow.context.files_modified as string[])
        : [];

      handleReviewResult({
        workflowEngine,
        directiveQueue,
        workflow,
        score,
        filesModified,
        source: 'wrfc_chain_next',
        agentWorkflowMap,
        agentId,
      });
    } else if (effectiveState === 'FIXING') {
      // ── FIXING state: engineer completed fix → delegate to handleFixResult ─
      const isEngineer = ENGINEER_AGENT_TYPES.has(agentType);

      if (!isEngineer) {
        log.debug('wrfc_chain_next: FIXING state but agent is not an engineer, skipping', {
          workflow_id: workflow.id,
          agent_type: agentType,
        });
        return;
      }

      // Extract files from engineer output via <gv> tag
      const fixOutput =
        (hookInput?.['last_assistant_message'] as string | undefined) ||
        (hookInput?.['task_output'] as string | undefined) ||
        (hookInput?.['result'] as string | undefined);
      const engineerFiles = extractFiles(fixOutput);
      if (engineerFiles.length > 0) {
        // Merge engineer-reported files into workflow context
        const existingFiles = Array.isArray(workflow.context.files_modified)
          ? (workflow.context.files_modified as string[])
          : [];
        const mergedFiles = [...new Set([...existingFiles, ...engineerFiles])];
        workflow.context.files_modified = mergedFiles;
        log.debug('wrfc_chain_next: updated files_modified from engineer <gv> tag', {
          workflow_id: workflow.id,
          new_files: engineerFiles,
          total_files: mergedFiles.length,
        });
      }

      const prevAttempts =
        typeof workflow.context.fix_attempts === 'number' ? workflow.context.fix_attempts : 0;

      const maxFixAttempts =
        typeof workflow.context.max_fix_attempts === 'number'
          ? workflow.context.max_fix_attempts
          : DEFAULT_MAX_FIX_ATTEMPTS;

      const filesModified = Array.isArray(workflow.context.files_modified)
        ? (workflow.context.files_modified as string[])
        : [];

      handleFixResult({
        workflowEngine,
        directiveQueue,
        workflow,
        incomingFixAttempts: prevAttempts,
        maxFixAttempts,
        filesModified,
        source: 'wrfc_chain_next',
        agentWorkflowMap,
        agentId,
      });
    } else {
      log.debug('wrfc_chain_next: workflow state not handled', {
        workflow_id: workflow.id,
        current_state: workflow.current_state,
      });
    }
  });

  // ─── Handler 2: wrfc_review_response ──────────────────────────────────────────
  // Called when wrfc:review_completed fires (event-driven path).
  // Delegates to handleReviewResult for score-based routing.
  registry.registerHandler('wrfc_review_response', async (args) => {
    log.debug('wrfc_review_response invoked', { args });

    const rawScore = args['review_score'];
    const reviewScore = typeof rawScore === 'number' ? rawScore : parseFloat(String(rawScore ?? ''));
    if (isNaN(reviewScore)) {
      log.warn('wrfc_review_response: invalid review_score, cannot route', { raw_score: rawScore });
      return;
    }

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
      } catch (err) {
        log.debug('wrfc_review_response: JSON.parse failed for files_modified, treating as single path', { raw: rawFiles, error: String(err) });
        filesModified = [rawFiles];
      }
    }

    // Find the target workflow - prefer explicit ID from event, fall back to most recent active
    const rawWid = args['workflow_id'];
    const workflowId = (typeof rawWid === 'string' && rawWid.length > 0)
      ? rawWid
      : (() => { const active = workflowEngine?.listActive() ?? []; return active[active.length - 1]?.id ?? 'unknown'; })();

    const wf = workflowEngine?.get(workflowId);
    if (!wf || !workflowEngine) {
      // Fallback: no workflow object available (e.g., triggered by event without active workflow).
      // Enqueue directive directly without advancing state machine — backward compatibility path.
      const minScore = (typeof args['min_review_score'] === 'number') ? args['min_review_score'] : DEFAULT_MIN_REVIEW_SCORE;
      if (reviewScore >= minScore) {
        const message = buildWorkflowCompleteMessage(workflowId, 'completed');
        directiveQueue.enqueue('subagent_stop', {
          type: 'inject_system_message',
          content: message,
          priority: 20,
          source: 'wrfc_review_response',
        });
        log.info('wrfc_review_response: workflow complete directive enqueued (no workflow object)', {
          workflow_id: workflowId,
          review_score: reviewScore,
        });
      } else {
        const issuesSummary =
          reviewIssues.length > 0
            ? reviewIssues.map((i) => `[${i.severity}] ${i.dimension}: ${i.description}`).join('; ')
            : 'See previous review output for details.';
        const task =
          `Fix the issues identified in the code review for workflow ${workflowId}. ` +
          `Review score: ${reviewScore}/10. Issues: ${issuesSummary}` +
          (filesModified.length > 0 ? ` Files: ${filesModified.join(', ')}.` : '');
        const message = buildSpawnDirectiveMessage('engineer', task, DEFAULT_BUDGET, {
          files_modified: filesModified,
          review_score: reviewScore,
          review_issues: reviewIssues,
          workflow_id: workflowId,
        });
        directiveQueue.enqueue('subagent_stop', {
          type: 'inject_system_message',
          content: message,
          priority: 20,
          source: 'wrfc_review_response',
        });
        log.info('wrfc_review_response: engineer fix directive enqueued (no workflow object)', {
          workflow_id: workflowId,
          review_score: reviewScore,
        });
      }
      return;
    }

    handleReviewResult({
      workflowEngine,
      directiveQueue,
      workflow: wf,
      score: reviewScore,
      filesModified,
      reviewIssues,
      source: 'wrfc_review_response',
    });
  });

  // ─── Handler 3: wrfc_fix_response ─────────────────────────────────────────────────
  // Called when wrfc:fix_completed fires (event-driven path).
  // Delegates to handleFixResult for budget-check routing.
  registry.registerHandler('wrfc_fix_response', async (args) => {
    log.debug('wrfc_fix_response invoked', { args });

    const rawFix = args['fix_attempts'];
    const fixAttempts = typeof rawFix === 'number' ? rawFix : parseInt(String(rawFix ?? '0'), 10);
    if (isNaN(fixAttempts)) {
      log.warn('wrfc_fix_response: invalid fix_attempts, cannot route', { raw_fix: rawFix });
      return;
    }

    const rawMax = args['max_fix_attempts'];
    const rawMaxParsed = typeof rawMax === 'number' ? rawMax : parseInt(String(rawMax ?? ''), 10);
    const maxFixAttempts = isNaN(rawMaxParsed) ? DEFAULT_MAX_FIX_ATTEMPTS : rawMaxParsed;

    // Find the target workflow - prefer explicit ID from event, fall back to most recent active
    const fixWorkflowId = typeof args['workflow_id'] === 'string' ? args['workflow_id'] : null;
    let fixWorkflow = fixWorkflowId ? workflowEngine?.get(fixWorkflowId) ?? null : null;
    if (!fixWorkflow) {
      const activeWorkflows = workflowEngine?.listActive() ?? [];
      fixWorkflow = activeWorkflows[activeWorkflows.length - 1] ?? null;
    }

    if (!fixWorkflow || !workflowEngine) {
      // Fallback: no workflow object available (e.g., triggered by event without active workflow).
      // Enqueue directive directly without advancing state machine — backward compatibility path.
      const fallbackId = fixWorkflowId ?? 'unknown';
      const resolvedAttempts = fixAttempts + 1;
      if (resolvedAttempts >= maxFixAttempts) {
        const message = buildEscalationMessage(fallbackId, resolvedAttempts, 0);
        directiveQueue.enqueue('subagent_stop', {
          type: 'inject_system_message',
          content: message,
          priority: 30,
          source: 'wrfc_fix_response',
        });
        log.warn('wrfc_fix_response: escalation directive enqueued (no workflow object)', {
          workflow_id: fallbackId,
          fix_attempts: resolvedAttempts,
          max_fix_attempts: maxFixAttempts,
        });
      } else {
        const recheckTask = `Re-review the code after fix attempt ${resolvedAttempts} of ${maxFixAttempts} for workflow ${fallbackId}. Check all recently modified files.`;
        const recheckMessage = buildSpawnDirectiveMessage('reviewer', recheckTask, DEFAULT_BUDGET, {
          fix_attempts: resolvedAttempts,
          max_fix_attempts: maxFixAttempts,
          workflow_id: fallbackId,
        });
        directiveQueue.enqueue('subagent_stop', {
          type: 'inject_system_message',
          content: recheckMessage,
          priority: 20,
          source: 'wrfc_fix_response',
        });
        log.info('wrfc_fix_response: re-review directive enqueued (no workflow object)', {
          workflow_id: fallbackId,
          fix_attempts: resolvedAttempts,
          max_fix_attempts: maxFixAttempts,
        });
      }
      return;
    }

    const filesModified = Array.isArray(fixWorkflow.context.files_modified)
      ? (fixWorkflow.context.files_modified as string[])
      : [];

    // fixAttempts from args is the count BEFORE this fix completed (passed in spawn message).
    // handleFixResult will increment it to reflect the completed attempt.
    handleFixResult({
      workflowEngine,
      directiveQueue,
      workflow: fixWorkflow,
      incomingFixAttempts: fixAttempts,
      maxFixAttempts,
      filesModified,
      source: 'wrfc_fix_response',
    });
  });

  log.debug('WRFC handlers registered', {
    handlers: ['wrfc_agent_spawned', 'wrfc_chain_next', 'wrfc_review_response', 'wrfc_fix_response'],
    has_workflow_engine: workflowEngine !== null,
    has_agent_coordinator: agentCoordinator !== null,
    has_agent_workflow_map: agentWorkflowMap != null,
  });
}
