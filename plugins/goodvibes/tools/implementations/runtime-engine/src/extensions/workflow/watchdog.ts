/**
 * WatchdogCoordinator — Layer 2 workflow extension.
 *
 * Detects stale workflows stuck in transitional states (REVIEWING, FIXING)
 * and re-enqueues lost directives. Extracted from ProcessManager to isolate
 * watchdog concerns.
 *
 * This is Layer 2 of the directive delivery resilience strategy:
 * - Layer 1: PreToolUse hook drains pending directives on every tool call
 * - Layer 2: This watchdog catches cases where PreToolUse didn't fire or
 *   where the directive was drained but never acted on
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from '../../shared/logger.js';
import { toErrorMessage } from '../../shared/utils.js';
import { ensureDirSync } from '../../core/utils/fs-utils.js';
import { writeJsonSync } from '../../core/state/file-io.js';
import type { WorkflowEngine } from './workflow-engine.js';
import type { DirectiveQueue } from '../directives/directive-queue.js';
import type { AgentWorkflowMap } from '../directives/agent-workflow-map.js';
import type { WorkflowInstance } from './types.js';
import {
  buildSpawnDirectiveMessage,
  buildEscalationMessage,
} from '../directives/directive-builder.js';
import type { Directive } from '../../shared/ipc/protocol.js';

const logger = createLogger('watchdog');

/**
 * How long a workflow can sit in a transitional state (REVIEWING, FIXING)
 * before the watchdog considers it stale and re-enqueues the lost directive.
 * Two minutes gives the PreToolUse drain hook ample time to catch it first.
 */
const WATCHDOG_STALE_MS = 120_000;

/**
 * Cooldown between watchdog recovery attempts for the same workflow.
 * Prevents flooding the directive queue with duplicate re-enqueues.
 */
const WATCHDOG_COOLDOWN_MS = 120_000;

/** Check if a directive's content references a specific workflow ID. */
function isDirectiveForWorkflow(d: Directive, workflowId: string): boolean {
  return typeof d.content === 'string' && d.content.includes(workflowId);
}

/**
 * Dependencies required by WatchdogCoordinator.
 */
export interface WatchdogCoordinatorDeps {
  workflowEngine: WorkflowEngine;
  directiveQueue: DirectiveQueue;
  agentWorkflowMap: AgentWorkflowMap | null;
  stateDir: string;
}

/**
 * WatchdogCoordinator monitors active workflows for stale states and
 * recovers lost directives via re-enqueue or file-based fallback delivery.
 */
export class WatchdogCoordinator {
  /** Consecutive drain-stuck detection counts per workflow. */
  private readonly drainStuckCounts: Map<string, number> = new Map();

  /** Tracks last watchdog recovery timestamp per workflow to prevent duplicate re-enqueues. */
  private readonly watchdogRecovery: Map<string, number> = new Map();

  private readonly deps: WatchdogCoordinatorDeps;

  constructor(deps: WatchdogCoordinatorDeps) {
    this.deps = deps;
  }

  /**
   * Detect active workflows stuck in transitional states (REVIEWING, FIXING)
   * and re-enqueue lost directives.
   *
   * Only intervenes after WATCHDOG_STALE_MS (2 minutes) with a
   * WATCHDOG_COOLDOWN_MS (2 minute) cooldown between recovery attempts
   * for the same workflow.
   */
  checkStaleWorkflows(): void {
    const { workflowEngine, directiveQueue } = this.deps;
    if (!workflowEngine || !directiveQueue) return;

    const now = Date.now();
    const activeWorkflows = workflowEngine.listActive();

    // Clean up recovery entries for workflows that are no longer active
    for (const wid of this.watchdogRecovery.keys()) {
      if (!activeWorkflows.some((w) => w.id === wid)) {
        this.watchdogRecovery.delete(wid);
      }
    }
    for (const wid of this.drainStuckCounts.keys()) {
      if (!activeWorkflows.some((w) => w.id === wid)) {
        this.drainStuckCounts.delete(wid);
      }
    }

    // Snapshot pending directives once before the loop for efficiency and
    // snapshot consistency across all workflow evaluations in this tick.
    const pendingDirectives = directiveQueue.peek('subagent_stop');

    for (const workflow of activeWorkflows) {
      const rawState = workflow.current_state.toUpperCase();
      if (rawState !== 'REVIEWING' && rawState !== 'FIXING') continue;
      const state: 'REVIEWING' | 'FIXING' = rawState;

      const stateAge = now - new Date(workflow.updated_at).getTime();
      if (stateAge < WATCHDOG_STALE_MS) continue;

      // Respect cooldown to prevent duplicate re-enqueues
      const lastRecovery = this.watchdogRecovery.get(workflow.id);
      if (lastRecovery && (now - lastRecovery) < WATCHDOG_COOLDOWN_MS) continue;

      // Check if a directive for THIS workflow is already pending.
      const hasPendingForWorkflow = pendingDirectives.some(
        (d) => isDirectiveForWorkflow(d, workflow.id),
      );
      if (hasPendingForWorkflow) {
        const stuckCount = (this.drainStuckCounts.get(workflow.id) ?? 0) + 1;
        this.drainStuckCounts.set(workflow.id, stuckCount);

        if (stuckCount >= 3) {
          // Drain stuck for 3+ ticks (~30s) — escalate to file-based delivery.
          logger.warn('Watchdog: drain-stuck escalation — writing urgent directive file', {
            workflow_id: workflow.id,
            current_state: state,
            state_age_ms: stateAge,
            stuck_ticks: stuckCount,
          });

          this.writeUrgentDirectives(workflow.id);
          this.drainStuckCounts.delete(workflow.id);
        } else {
          logger.warn('Watchdog: stale workflow with pending directive — drain may be stuck', {
            workflow_id: workflow.id,
            current_state: state,
            state_age_ms: stateAge,
            pending_directives: pendingDirectives.length,
            stuck_ticks: stuckCount,
          });
        }
        continue;
      }

      // No pending directive — the directive was lost. Re-enqueue.
      logger.warn('Watchdog: recovering stale workflow — re-enqueueing directive', {
        workflow_id: workflow.id,
        current_state: state,
        state_age_ms: stateAge,
      });

      this.recoverStaleWorkflow(workflow, state);
      this.watchdogRecovery.set(workflow.id, now);
    }
  }

  /**
   * Re-enqueue the appropriate directive for a stale workflow.
   *
   * - REVIEWING: spawn a reviewer
   * - FIXING: spawn an engineer (or escalate if fix budget exhausted)
   */
  private recoverStaleWorkflow(
    workflow: WorkflowInstance,
    state: 'REVIEWING' | 'FIXING',
  ): void {
    const { directiveQueue, agentWorkflowMap } = this.deps;
    if (!directiveQueue) return;

    const filesModified = Array.isArray(workflow.context.files_modified)
      ? (workflow.context.files_modified as string[])
      : [];

    if (state === 'REVIEWING') {
      const task =
        `Review the work completed in workflow ${workflow.id}. ` +
        `Current state: ${workflow.current_state}. ` +
        (filesModified.length > 0
          ? `Files modified: ${filesModified.join(', ')}.`
          : 'Check all recently modified files.');

      const message = buildSpawnDirectiveMessage('reviewer', task, undefined, {
        files_modified: filesModified,
        workflow_id: workflow.id,
      });

      directiveQueue.enqueue('subagent_stop', {
        type: 'inject_system_message',
        content: message,
        priority: 25,
        source: 'watchdog',
        workflow_id: workflow.id,
      });

      if (agentWorkflowMap) {
        agentWorkflowMap.addPendingBind('reviewer', workflow.id);
        agentWorkflowMap.addPendingBind('goodvibes:reviewer', workflow.id);
      }

      logger.info('Watchdog: reviewer spawn directive re-enqueued', {
        workflow_id: workflow.id,
      });
    } else if (state === 'FIXING') {
      const fixAttempts =
        typeof workflow.context.fix_attempts === 'number' ? workflow.context.fix_attempts : 0;
      const maxFixAttempts =
        typeof workflow.context.max_fix_attempts === 'number'
          ? (workflow.context.max_fix_attempts as number)
          : 3;
      const lastScore =
        typeof workflow.context.review_score === 'number' ? workflow.context.review_score : 0;

      if (fixAttempts >= maxFixAttempts) {
        // Fix budget exhausted — should have escalated
        const escalationMessage = buildEscalationMessage(workflow.id, fixAttempts, lastScore);
        directiveQueue.enqueue('subagent_stop', {
          type: 'inject_system_message',
          content: escalationMessage,
          priority: 30,
          source: 'watchdog',
          workflow_id: workflow.id,
        });
        logger.warn('Watchdog: escalation directive re-enqueued (fix budget exhausted)', {
          workflow_id: workflow.id,
          fix_attempts: fixAttempts,
          max_fix_attempts: maxFixAttempts,
        });
      } else {
        // Still have fix budget — spawn engineer
        const reviewIssues = Array.isArray(workflow.context.review_issues)
          ? (workflow.context.review_issues as Array<{ dimension: string; severity: string; description: string }>)
          : [];
        const issuesSummary =
          reviewIssues.length > 0
            ? reviewIssues.map((i) => `[${i.severity}] ${i.dimension}: ${i.description}`).join('; ')
            : 'See previous review output for details.';

        const fixTask =
          `Fix the issues identified in the code review for workflow ${workflow.id}. ` +
          `Review score: ${lastScore}/10. Issues: ${issuesSummary}` +
          (filesModified.length > 0 ? ` Files: ${filesModified.join(', ')}.` : '');

        const fixMessage = buildSpawnDirectiveMessage('engineer', fixTask, undefined, {
          files_modified: filesModified,
          review_score: lastScore,
          review_issues: reviewIssues,
          fix_attempts: fixAttempts,
          max_fix_attempts: maxFixAttempts,
          workflow_id: workflow.id,
        });

        directiveQueue.enqueue('subagent_stop', {
          type: 'inject_system_message',
          content: fixMessage,
          priority: 25,
          source: 'watchdog',
          workflow_id: workflow.id,
        });

        if (agentWorkflowMap) {
          agentWorkflowMap.addPendingBind('engineer', workflow.id);
          agentWorkflowMap.addPendingBind('goodvibes:engineer', workflow.id);
        }

        logger.info('Watchdog: engineer fix directive re-enqueued', {
          workflow_id: workflow.id,
          fix_attempts: fixAttempts,
          max_fix_attempts: maxFixAttempts,
        });
      }
    }
  }

  /**
   * Write pending directives to a file-based fallback channel.
   *
   * When the IPC-based directive queue has directives that aren't being drained
   * (orchestrator idle — no hooks firing), this method writes them to a JSON file
   * that hook scripts check as an alternative delivery channel.
   *
   * @param workflowId - The workflow whose directives are stuck.
   */
  private writeUrgentDirectives(workflowId: string): void {
    const { directiveQueue, stateDir } = this.deps;
    if (!directiveQueue) return;

    // Use per-workflow drain to atomically extract only this workflow's directives.
    // Other workflows' directives remain in the queue untouched.
    const matching = directiveQueue.drain('subagent_stop', workflowId);

    if (matching.length === 0) {
      // Directive was consumed between peek and drain — nothing to write
      return;
    }

    const urgentPath = join(stateDir, 'urgent-directives.json');

    let writeSucceeded = false;
    try {
      // Ensure state directory exists
      ensureDirSync(stateDir);

      // Merge with any existing urgent directives (another workflow may have written)
      let existingDirectives: Directive[] = [];
      try {
        const existing = readFileSync(urgentPath, 'utf-8');
        const parsed = JSON.parse(existing) as { directives?: unknown[] };
        if (Array.isArray(parsed.directives)) {
          existingDirectives = parsed.directives as Directive[];
        }
      } catch (readErr) {
        logger.debug('Watchdog: no existing urgent-directives file (expected on first write)', {
          workflow_id: workflowId,
          error: readErr instanceof Error ? readErr.message : String(readErr),
        });
      }

      const merged = [...existingDirectives, ...matching];

      writeJsonSync(urgentPath, {
        written_at: new Date().toISOString(),
        directives: merged,
      });

      logger.info('Watchdog: urgent directives written to file', {
        workflow_id: workflowId,
        directive_count: matching.length,
        total_in_file: merged.length,
        path: urgentPath,
      });

      writeSucceeded = true;
    } catch (err) {
      logger.error('Watchdog: failed to write urgent directives file', {
        workflow_id: workflowId,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      // If file write failed, re-enqueue matching directives — they weren't delivered.
      if (!writeSucceeded) {
        for (const d of matching) {
          directiveQueue.enqueue('subagent_stop', d);
        }
      }
    }
  }
}
