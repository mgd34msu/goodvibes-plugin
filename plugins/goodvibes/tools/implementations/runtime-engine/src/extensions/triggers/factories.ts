/**
 * Trigger Factories — Layer 2 Extensions
 *
 * Consolidated factory functions for all typed Trigger subtypes:
 * WRFCTrigger, CronTrigger, WebhookTrigger.
 *
 * Also exports the shared TriggerFactoryParams utility type.
 */

import { Trigger, createTrigger } from '../../core/types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Shared Utility Type
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Utility type for trigger factory params.
 * Inherits required base fields, makes optional base fields optional, and merges extension-specific fields.
 */
type TriggerFactoryParams<T> = Pick<Trigger, 'id' | 'event_match' | 'actions'> &
  Partial<Omit<Trigger, 'id' | 'event_match' | 'actions' | 'enabled'>> &
  { enabled?: boolean } &
  T;

// ─────────────────────────────────────────────────────────────────────────────
// WRFCTrigger
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A trigger specialised for WRFC quality-loop workflows.
 * Adds score gating, fix attempt budgeting, and workflow state filtering.
 */
interface WRFCTrigger extends Trigger {
  /** Discriminant field for reliable type narrowing. */
  trigger_type: 'wrfc';
  /** Minimum review score (0–10) required to pass the quality gate. */
  score_threshold?: number;
  /** Maximum number of fix iterations before the workflow is abandoned. */
  max_fix_attempts?: number;
  /** Only fire if the associated workflow is in one of these states. */
  workflow_state_filter?: string[];
}

/**
 * Narrows a Trigger to WRFCTrigger.
 */
function isWRFCTrigger(trigger: Trigger): trigger is WRFCTrigger {
  return 'trigger_type' in trigger && (trigger as WRFCTrigger).trigger_type === 'wrfc';
}

/**
 * Creates a WRFCTrigger with sensible defaults.
 * `enabled` defaults to true via the base `createTrigger` helper.
 */
export function createWRFCTrigger(params: TriggerFactoryParams<{
  score_threshold?: number;
  max_fix_attempts?: number;
  workflow_state_filter?: string[];
}>): WRFCTrigger {
  if (params.score_threshold !== undefined && (params.score_threshold < 0 || params.score_threshold > 10)) {
    throw new RangeError(`score_threshold must be between 0 and 10, got ${params.score_threshold}`);
  }
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
    trigger_type: 'wrfc',
    ...(params.score_threshold !== undefined && { score_threshold: params.score_threshold }),
    ...(params.max_fix_attempts !== undefined && { max_fix_attempts: params.max_fix_attempts }),
    ...(params.workflow_state_filter !== undefined && { workflow_state_filter: params.workflow_state_filter }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CronTrigger
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A trigger that fires on a cron schedule.
 */
interface CronTrigger extends Trigger {
  /** Discriminant field for reliable type narrowing. */
  trigger_type: 'cron';
  /** Standard cron expression defining the fire schedule (e.g. '0 9 * * 1-5'). */
  schedule: string;
  /** Optional time window during which the trigger may fire (e.g. '9am-10pm'). */
  active_hours?: string;
  /** IANA timezone identifier for schedule evaluation. Defaults to system timezone. */
  timezone?: string;
}

/**
 * Narrows a Trigger to CronTrigger.
 */
function isCronTrigger(trigger: Trigger): trigger is CronTrigger {
  return 'trigger_type' in trigger && (trigger as CronTrigger).trigger_type === 'cron';
}

/**
 * Creates a CronTrigger with sensible defaults.
 * `enabled` defaults to true via the base `createTrigger` helper.
 */
function createCronTrigger(params: TriggerFactoryParams<{
  schedule: string;
  active_hours?: string;
  timezone?: string;
}>): CronTrigger {
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
    trigger_type: 'cron',
    schedule: params.schedule,
    ...(params.active_hours !== undefined && { active_hours: params.active_hours }),
    ...(params.timezone !== undefined && { timezone: params.timezone }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// WebhookTrigger
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A trigger that activates when an external webhook payload is received.
 */
interface WebhookTrigger extends Trigger {
  /** Discriminant field for reliable type narrowing. */
  trigger_type: 'webhook';
  /** Optional URL path pattern to match against the incoming webhook path. */
  url_pattern?: string;
  /** Optional JSON Schema for validating the incoming payload before firing. */
  payload_schema?: Record<string, unknown>;
  /** Name of the payload normalizer to apply (e.g. 'github', 'generic'). */
  normalize_with?: string;
}

/**
 * Narrows a Trigger to WebhookTrigger.
 */
function isWebhookTrigger(trigger: Trigger): trigger is WebhookTrigger {
  return 'trigger_type' in trigger && (trigger as WebhookTrigger).trigger_type === 'webhook';
}

/**
 * Creates a WebhookTrigger with sensible defaults.
 * `enabled` defaults to true via the base `createTrigger` helper.
 */
function createWebhookTrigger(params: TriggerFactoryParams<{
  url_pattern?: string;
  payload_schema?: Record<string, unknown>;
  normalize_with?: string;
}>): WebhookTrigger {
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
    trigger_type: 'webhook',
    ...(params.url_pattern !== undefined && { url_pattern: params.url_pattern }),
    ...(params.payload_schema !== undefined && { payload_schema: params.payload_schema }),
    ...(params.normalize_with !== undefined && { normalize_with: params.normalize_with }),
  };
}
