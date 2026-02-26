/**
 * ExternalEvent — Layer 2 Extension
 *
 * Extends RuntimeEvent for events sourced from external webhooks and integrations
 * (GitHub, Slack, CI systems, payment processors, etc.).
 */

import { RuntimeEvent, EventContext, createEvent } from '../../core/types.js';

// ─── ExternalEvent Interface ──────────────────────────────────────────────────

/**
 * A runtime event sourced from an external system via webhook or integration.
 */
export interface ExternalEvent extends RuntimeEvent {
  /** External events always originate from the external source. */
  source: 'external';
  /** Identifier for the originating external system (e.g. 'github', 'slack', 'ci', 'stripe'). */
  external_source: string;
  /** The original, unmodified webhook payload. */
  raw_payload: unknown;
  /** Whether the payload was normalized by an adapter into a canonical shape. */
  normalized: boolean;
}

// ─── Type Guard ───────────────────────────────────────────────────────────────

/**
 * Narrows a RuntimeEvent to ExternalEvent.
 */
export function isExternalEvent(event: RuntimeEvent): event is ExternalEvent {
  return (
    event.source === 'external' &&
    'external_source' in event &&
    'raw_payload' in event
  );
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates an ExternalEvent with sensible defaults.
 * Priority defaults to 30 — external events are lower priority than internal/agent events.
 */
export function createExternalEvent(params: {
  external_source: string;
  /** e.g. 'webhook:github:pr_opened', 'webhook:stripe:payment_succeeded' */
  type: string;
  raw_payload: unknown;
  /** Whether the payload was normalized by an adapter. Default false. */
  normalized?: boolean;
  /** Normalized/canonical payload for matching, if different from raw_payload. */
  payload?: unknown;
  /** Default 30 — external events are lower priority. */
  priority?: number;
  context?: EventContext;
}): ExternalEvent {
  const base = createEvent({
    source: 'external',
    type: params.type,
    payload: params.payload ?? params.raw_payload,
    priority: params.priority ?? 30,
    context: params.context,
  });
  return {
    ...base,
    source: 'external' as const,
    external_source: params.external_source,
    raw_payload: params.raw_payload,
    normalized: params.normalized ?? false,
  };
}
