/**
 * Slack Normalizer — External Events Plugin (Layer 3)
 *
 * Normalizes Slack webhook/event API payloads into ExternalEvents.
 * Determines event type from payload structure.
 */

import { ExternalEvent, createExternalEvent } from '../../../extensions/events/factories.js';

interface SlackPayload {
  type?: string;
  event?: {
    type?: string;
    channel?: string;
    user?: string;
    text?: string;
    thread_ts?: string;
    ts?: string;
    [key: string]: unknown;
  };
  challenge?: string;
  token?: string;
  team_id?: string;
  [key: string]: unknown;
}

export function normalizeSlack(
  rawPayload: unknown,
  _headers?: Record<string, string>,
): ExternalEvent {
  const payload: SlackPayload =
    rawPayload !== null && typeof rawPayload === 'object'
      ? (rawPayload as SlackPayload)
      : {};

  // Slack URL verification challenge
  if (typeof payload.challenge === 'string') {
    return createExternalEvent({
      external_source: 'slack',
      type: 'webhook:slack:url_verification',
      raw_payload: rawPayload,
      payload: { challenge: payload.challenge },
      normalized: true,
    });
  }

  const eventType = payload.event?.type ?? payload.type ?? 'unknown';
  const canonicalType = `webhook:slack:${eventType}`;

  const normalizedPayload: Record<string, unknown> = {
    event_type: eventType,
    ...(payload.event?.channel !== undefined && { channel: payload.event.channel }),
    ...(payload.event?.user !== undefined && { user: payload.event.user }),
    ...(payload.event?.text !== undefined && { text: payload.event.text }),
    ...(payload.event?.thread_ts !== undefined && { thread_ts: payload.event.thread_ts }),
    ...(payload.team_id !== undefined && { team_id: payload.team_id }),
  };

  return createExternalEvent({
    external_source: 'slack',
    type: canonicalType,
    raw_payload: rawPayload,
    payload: normalizedPayload,
    normalized: true,
  });
}
