/**
 * WRFCTrigger — Layer 2 Extension
 *
 * Extends Trigger with WRFC (Write-Review-Fix-Confirm) specific fields:
 * score thresholds, fix attempt limits, and workflow state filtering.
 */

import { Trigger, createTrigger } from '../../core/types.js';

// ─── Utility Type ─────────────────────────────────────────────────────────────

/**
 * Utility type for trigger factory params.
 * Inherits required base fields, makes optional base fields optional, and merges extension-specific fields.
 */
type TriggerFactoryParams<T> = Pick<Trigger, 'id' | 'event_match' | 'actions'> &
  Partial<Omit<Trigger, 'id' | 'event_match' | 'actions' | 'enabled'>> &
  { enabled?: boolean } &
  T;

// ─── WRFCTrigger Interface ────────────────────────────────────────────────────

/**
 * A trigger specialised for WRFC quality-loop workflows.
 * Adds score gating, fix attempt budgeting, and workflow state filtering.
 */
export interface WRFCTrigger extends Trigger {
  /** Discriminant field for reliable type narrowing. */
  trigger_type: 'wrfc';
  /** Minimum review score (0–10) required to pass the quality gate. */
  score_threshold?: number;
  /** Maximum number of fix iterations before the workflow is abandoned. */
  max_fix_attempts?: number;
  /** Only fire if the associated workflow is in one of these states. */
  workflow_state_filter?: string[];
}

// ─── Type Guard ───────────────────────────────────────────────────────────────

/**
 * Narrows a Trigger to WRFCTrigger.
 */
export function isWRFCTrigger(trigger: Trigger): trigger is WRFCTrigger {
  return 'trigger_type' in trigger && (trigger as WRFCTrigger).trigger_type === 'wrfc';
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates a WRFCTrigger with sensible defaults.
 * `enabled` defaults to true via the base `createTrigger` helper.
 */
export function createWRFCTrigger(params: TriggerFactoryParams<{
  score_threshold?: number;
  max_fix_attempts?: number;
  workflow_state_filter?: string[];
}>): WRFCTrigger {
  const base = createTrigger({
    id: params.id,
    event_match: params.event_match,
    actions: params.actions,
    conditions: params.conditions,
    max_fires: params.max_fires,
    cooldown_ms: params.cooldown_ms,
    chain_depth_limit: params.chain_depth_limit,
    retry: params.retry,
    enabled: params.enabled ?? true,
    priority: params.priority,
  });
  return {
    ...base,
    trigger_type: 'wrfc' as const,
    ...(params.score_threshold !== undefined && { score_threshold: params.score_threshold }),
    ...(params.max_fix_attempts !== undefined && { max_fix_attempts: params.max_fix_attempts }),
    ...(params.workflow_state_filter !== undefined && { workflow_state_filter: params.workflow_state_filter }),
  };
}
