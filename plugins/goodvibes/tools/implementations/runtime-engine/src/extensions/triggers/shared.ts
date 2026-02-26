/**
 * Shared types for trigger factories — Layer 2 Extensions.
 *
 * Centralises the TriggerFactoryParams utility type to avoid duplication
 * across WRFCTrigger, CronTrigger, and WebhookTrigger factories.
 */

import { Trigger } from '../../core/types.js';

// ─── Utility Type ─────────────────────────────────────────────────────────────

/**
 * Utility type for trigger factory params.
 * Inherits required base fields, makes optional base fields optional, and merges extension-specific fields.
 */
export type TriggerFactoryParams<T> = Pick<Trigger, 'id' | 'event_match' | 'actions'> &
  Partial<Omit<Trigger, 'id' | 'event_match' | 'actions' | 'enabled'>> &
  { enabled?: boolean } &
  T;
