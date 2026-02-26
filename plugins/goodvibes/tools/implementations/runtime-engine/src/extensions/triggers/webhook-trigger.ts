/**
 * WebhookTrigger — Layer 2 Extension
 *
 * Extends Trigger with webhook-specific routing: URL path pattern matching,
 * optional payload schema validation, and named normalizer selection.
 */

import { Trigger, createTrigger } from '../../core/types.js';
import { TriggerFactoryParams } from './shared.js';

// ─── WebhookTrigger Interface ─────────────────────────────────────────────────

/**
 * A trigger that activates when an external webhook payload is received.
 */
export interface WebhookTrigger extends Trigger {
  /** Discriminant field for reliable type narrowing. */
  trigger_type: 'webhook';
  /** Optional URL path pattern to match against the incoming webhook path. */
  url_pattern?: string;
  /** Optional JSON Schema for validating the incoming payload before firing. */
  payload_schema?: Record<string, unknown>;
  /** Name of the payload normalizer to apply (e.g. 'github', 'generic'). */
  normalize_with?: string;
}

// ─── Type Guard ───────────────────────────────────────────────────────────────

/**
 * Narrows a Trigger to WebhookTrigger.
 */
export function isWebhookTrigger(trigger: Trigger): trigger is WebhookTrigger {
  return 'trigger_type' in trigger && (trigger as WebhookTrigger).trigger_type === 'webhook';
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates a WebhookTrigger with sensible defaults.
 * `enabled` defaults to true via the base `createTrigger` helper.
 */
export function createWebhookTrigger(params: TriggerFactoryParams<{
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
