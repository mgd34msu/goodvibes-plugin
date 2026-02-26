/**
 * CronTrigger — Layer 2 Extension
 *
 * Extends Trigger with cron scheduling fields: schedule expression,
 * optional active-hours window, and timezone.
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

// ─── CronTrigger Interface ────────────────────────────────────────────────────

/**
 * A trigger that fires on a cron schedule.
 */
export interface CronTrigger extends Trigger {
  /** Discriminant field for reliable type narrowing. */
  trigger_type: 'cron';
  /** Standard cron expression defining the fire schedule (e.g. '0 9 * * 1-5'). */
  schedule: string;
  /** Optional time window during which the trigger may fire (e.g. '9am-10pm'). */
  active_hours?: string;
  /** IANA timezone identifier for schedule evaluation. Defaults to system timezone. */
  timezone?: string;
}

// ─── Type Guard ───────────────────────────────────────────────────────────────

/**
 * Narrows a Trigger to CronTrigger.
 */
export function isCronTrigger(trigger: Trigger): trigger is CronTrigger {
  return 'trigger_type' in trigger && (trigger as CronTrigger).trigger_type === 'cron';
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates a CronTrigger with sensible defaults.
 * `enabled` defaults to true via the base `createTrigger` helper.
 */
export function createCronTrigger(params: TriggerFactoryParams<{
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
    trigger_type: 'cron' as const,
    schedule: params.schedule,
    ...(params.active_hours !== undefined && { active_hours: params.active_hours }),
    ...(params.timezone !== undefined && { timezone: params.timezone }),
  };
}
