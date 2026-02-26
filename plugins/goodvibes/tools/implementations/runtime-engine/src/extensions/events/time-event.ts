/**
 * TimeEvent — Layer 2 Extension
 *
 * Extends RuntimeEvent for events sourced from the time subsystem.
 * Covers heartbeats, cron schedules, one-shot timers, and scheduled events.
 */

import { RuntimeEvent, EventContext, createEvent } from '../../core/types.js';

// ─── Time Type ────────────────────────────────────────────────────────────────

/**
 * Discriminant for the category of time-based event.
 */
export type TimeType = 'heartbeat' | 'cron' | 'scheduled' | 'one_shot';

// ─── TimeEvent Interface ──────────────────────────────────────────────────────

/**
 * A runtime event sourced from the time subsystem.
 */
export interface TimeEvent extends RuntimeEvent {
  /** Time events always originate from the time source. */
  source: 'time';
  /** Category of this time event. */
  time_type: TimeType;
  /** Interval in milliseconds (heartbeat events). */
  interval_ms?: number;
  /** Cron expression defining the schedule (cron events). */
  schedule?: string;
  /** Maximum number of times this event series may fire before expiry. */
  ttl?: number;
  /** Fires remaining before expiry (decremented on each fire). */
  fires_remaining?: number;
  /** Unix epoch ms when the event was originally scheduled. */
  scheduled_at?: number;
}

// ─── Type Guard ───────────────────────────────────────────────────────────────

/**
 * Narrows a RuntimeEvent to TimeEvent.
 */
export function isTimeEvent(event: RuntimeEvent): event is TimeEvent {
  return event.source === 'time' && 'time_type' in event;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Derives a default event type string from a TimeType.
 */
function defaultTimeEventType(timeType: TimeType): string {
  switch (timeType) {
    case 'heartbeat': return 'tick:heartbeat';
    case 'cron':      return 'cron:tick';
    case 'scheduled': return 'schedule:tick';
    case 'one_shot':  return 'schedule:one_shot';
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates a TimeEvent with sensible defaults.
 * Priority defaults to 10 (time events are low priority).
 */
export function createTimeEvent(params: {
  time_type: TimeType;
  /**
   * Defaults to the category-specific type: `tick:heartbeat`, `cron:tick`,
   * `schedule:tick`, or `schedule:one_shot`. Intentionally loose string
   * to allow Layer 3 extensions to supply custom type identifiers.
   */
  type?: string;
  interval_ms?: number;
  schedule?: string;
  ttl?: number;
  fires_remaining?: number;
  scheduled_at?: number;
  payload?: unknown;
  /** Default 10 — time events are low priority. */
  priority?: number;
  context?: EventContext;
}): TimeEvent {
  const base = createEvent({
    source: 'time',
    type: params.type ?? defaultTimeEventType(params.time_type),
    payload: params.payload ?? {},
    priority: params.priority ?? 10,
    context: params.context,
  });
  return {
    ...base,
    source: 'time',
    time_type: params.time_type,
    ...(params.interval_ms !== undefined && { interval_ms: params.interval_ms }),
    ...(params.schedule !== undefined && { schedule: params.schedule }),
    ...(params.ttl !== undefined && { ttl: params.ttl }),
    ...(params.fires_remaining !== undefined && { fires_remaining: params.fires_remaining }),
    ...(params.scheduled_at !== undefined && { scheduled_at: params.scheduled_at }),
  };
}
