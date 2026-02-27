/**
 * Generic Normalizer — External Events Plugin (Layer 3)
 *
 * Passthrough normalizer for unknown/unrecognized sources.
 * Wraps raw payload in an ExternalEvent with minimal transformation.
 */

import { ExternalEvent, createExternalEvent } from '../../../extensions/events/factories.js';

// ─── Generic Normalizer ───────────────────────────────────────────────────────

/**
 * Normalizes an arbitrary payload into an ExternalEvent.
 * Uses the source as external_source and constructs a generic type string.
 */
export function normalizeGeneric(
  rawPayload: unknown,
  source: string,
  headers?: Record<string, string>,
): ExternalEvent {
  // Attempt to extract a meaningful event type from payload if it has one
  let eventType = `webhook:${source}:event`;

  if (rawPayload !== null && typeof rawPayload === 'object' && !Array.isArray(rawPayload)) {
    const p = rawPayload as Record<string, unknown>;
    // Common convention: payload has an 'event', 'type', or 'action' field
    const extracted = p['event'] ?? p['type'] ?? p['action'];
    if (typeof extracted === 'string' && extracted.length > 0) {
      // Sanitize: replace spaces and non-alphanumeric chars with underscores
      const sanitized = extracted.replace(/[^a-zA-Z0-9_:.-]/g, '_').toLowerCase();
      eventType = `webhook:${source}:${sanitized}`;
    }
  }

  // Include headers in payload for downstream consumers
  const normalizedPayload: Record<string, unknown> = {
    data: rawPayload,
    ...(headers !== undefined && Object.keys(headers).length > 0 && { headers }),
  };

  return createExternalEvent({
    external_source: source,
    type: eventType,
    raw_payload: rawPayload,
    payload: normalizedPayload,
    normalized: false, // Generic normalizer does not perform deep normalization
  });
}
