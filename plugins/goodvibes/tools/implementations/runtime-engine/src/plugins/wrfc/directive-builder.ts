/**
 * Directive Builder — WRFC Plugin (Layer 3)
 *
 * Builds WRFC directives as Action objects that the event processor can
 * execute. Each factory returns an Action with type 'send_message' and
 * the structured <gv> payload as params.content.
 *
 * This module wraps the existing legacy-directive-builder.ts message constructors
 * and packages them as Action types that HandlerResult.actions accepts.
 */

import type { Action } from '../../core/types.js';
import {
  buildSpawnDirectiveMessage,
  buildWorkflowCompleteMessage,
  buildEscalationMessage,
  type SpawnDirectiveContext,
} from '../../extensions/directives/legacy-directive-builder.js';

// ─── Re-exports ───────────────────────────────────────────────────────────────

export type { SpawnDirectiveContext };

// ─── Action Builders ──────────────────────────────────────────────────────────

/**
 * Builds a spawn directive Action for the given agent type.
 *
 * The Action has type 'send_message' and carries the structured <gv> spawn
 * payload in params.content. The event processor delivers this to the
 * directive queue via its send_message action handler.
 *
 * @param params.wid   - Workflow ID for the spawn directive.
 * @param params.type  - Agent role to spawn ('engineer' | 'reviewer' | 'tester' | 'fixer').
 * @param params.task  - Task description for the spawned agent.
 * @param params.files - Optional files to include in context.
 * @returns Action with type 'send_message'.
 */
export function buildSpawnAction(params: {
  wid: string;
  type: 'engineer' | 'reviewer' | 'tester' | 'fixer';
  task: string;
  files?: string[];
}): Action {
  const context: SpawnDirectiveContext = {
    workflow_id: params.wid,
    ...(params.files && params.files.length > 0 && { files_modified: params.files }),
  };
  const content = buildSpawnDirectiveMessage(params.type, params.task, undefined, context);
  return {
    type: 'send_message',
    params: { content, priority: 20, target: 'subagent_stop' },
  };
}

/**
 * Builds a workflow-complete directive Action.
 *
 * @param wid - ID of the workflow that has passed review.
 * @returns Action with type 'send_message'.
 */
export function buildCompleteAction(wid: string): Action {
  const content = buildWorkflowCompleteMessage(wid);
  return {
    type: 'send_message',
    params: { content, priority: 20, target: 'subagent_stop' },
  };
}

/**
 * Structured params for buildEscalateAction.
 * Prefer this over embedding counts in a reason string.
 */
export interface EscalateParams {
  /** Number of fix attempts made before escalation. */
  fix_attempts?: number;
  /** Last known review score before escalation. */
  last_score?: number;
}

/**
 * Builds an escalate directive Action.
 *
 * @param wid    - ID of the workflow that exhausted its fix budget.
 * @param reason - Human-readable reason for escalation.
 * @param params - Optional structured params (preferred over parsing from reason string).
 * @returns Action with type 'send_message'.
 */
export function buildEscalateAction(wid: string, reason: string, params?: EscalateParams): Action {
  let fixAttempts: number;
  let lastScore: number;

  if (params !== undefined) {
    // Prefer structured params when provided
    fixAttempts = params.fix_attempts ?? 0;
    lastScore = params.last_score ?? 0;
  } else {
    // Fallback: parse from reason string for backward compatibility
    const fixMatch = reason.match(/(\d+)\s+fix/i);
    const scoreMatch = reason.match(/score[:\s]*(\d+(?:\.\d+)?)\/10/i);
    fixAttempts = fixMatch ? parseInt(fixMatch[1], 10) : 0;
    lastScore = scoreMatch ? parseFloat(scoreMatch[1]) : 0;
  }

  const content = buildEscalationMessage(wid, fixAttempts, lastScore);
  return {
    type: 'send_message',
    params: { content, priority: 30, target: 'subagent_stop' },
  };
}

/**
 * Builds a complete directive as a structured object (for direct use).
 * @deprecated Prefer buildCompleteAction for HandlerResult integration.
 * @since v1.3.0
 * @removal Planned removal — migrate to buildCompleteAction.
 */
export function buildCompleteDirective(wid: string): Action {
  return buildCompleteAction(wid);
}

/**
 * Builds an escalate directive as a structured object (for direct use).
 * @deprecated Prefer buildEscalateAction for HandlerResult integration.
 * @since v1.3.0
 * @removal Planned removal — migrate to buildEscalateAction.
 */
export function buildEscalateDirective(wid: string, reason: string): Action {
  return buildEscalateAction(wid, reason);
}

/**
 * Builds a spawn directive as a structured object (for direct use).
 * @deprecated Prefer buildSpawnAction for HandlerResult integration.
 * @since v1.3.0
 * @removal Planned removal — migrate to buildSpawnAction.
 */
export function buildSpawnDirective(params: {
  wid: string;
  type: 'engineer' | 'reviewer' | 'tester' | 'fixer';
  task: string;
  files?: string[];
}): Action {
  return buildSpawnAction(params);
}
