/**
 * EventScheduler — Layer 3 Plugin
 *
 * Manages scheduled heartbeats, one-shot delayed events, and cron-like
 * recurring events. Driven externally — no internal timers.
 * Optionally persists schedule state to a StateStoreInterface for
 * recovery across sessions.
 */

import { StateStoreInterface } from '../../core/types.js';
import { TimeEvent, createTimeEvent } from '../../extensions/events/time-event.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/** A single scheduled item managed by the EventScheduler. */
export interface ScheduledItem {
  id: string;
  time_type: 'heartbeat' | 'cron' | 'scheduled' | 'one_shot';
  /** Namespaced event type string emitted when this item fires, e.g. 'tick:build_monitor'. */
  event_type: string;
  /** Recurrence interval in ms (recurring items only). */
  interval_ms?: number;
  /** Unix epoch ms for the next scheduled fire. */
  next_fire_at: number;
  /** Maximum total fires before the item is removed. Undefined = unlimited. */
  ttl?: number;
  /** Remaining fires before expiry (decremented on each fire). */
  fires_remaining?: number;
  /** The original max_fires value (informational). */
  max_fires?: number;
  /** Arbitrary payload forwarded into the emitted event. */
  payload?: unknown;
  /** Cancel reference tag — cancel all items sharing this ref via cancelByRef(). */
  ref?: string;
  /** Unix epoch ms when this item was created. */
  created_at: number;
  /** Unix epoch ms of the last time this item fired. */
  last_fired_at?: number;
  /** Optional active-hours restriction (cron items only). */
  active_hours?: {
    start: number;
    end: number;
    /**
     * Optional UTC offset in hours to apply when evaluating active_hours.
     * Defaults to system local time (getHours()) when omitted.
     * Document: pass 0 for UTC, or the appropriate offset for a fixed timezone.
     */
    timezone_offset_hours?: number;
  };
  /** Priority forwarded into the emitted TimeEvent. Defaults to 10. */
  priority?: number;
}

export interface SchedulerConfig {
  /** Maximum number of simultaneously scheduled items. Default 100. */
  max_scheduled_items: number;
  /** Whether to persist schedules to the state store. Default true. */
  persist_schedules: boolean;
}

/** Key used to store schedules in the StateStoreInterface. */
const PERSIST_KEY = 'time_plugin.schedules';

// ─── EventScheduler ───────────────────────────────────────────────────────────

export class EventScheduler {
  private items = new Map<string, ScheduledItem>();

  constructor(
    private config: SchedulerConfig,
    private store?: StateStoreInterface,
  ) {}

  // ─── Scheduling API ──────────────────────────────────────────────────────────

  /**
   * Schedule a recurring heartbeat event with an optional TTL.
   * Example: "check CI every 10 seconds for 5 fires".
   */
  scheduleHeartbeat(params: {
    id: string;
    event_type: string;
    interval_ms: number;
    /** Max number of times to fire before auto-removing. Undefined = unlimited. */
    ttl?: number;
    payload?: unknown;
    ref?: string;
  }): ScheduledItem {
    this._assertCapacity();
    if (this.items.has(params.id)) {
      throw new Error(`EventScheduler: item with id '${params.id}' already exists`);
    }
    const now = Date.now();
    const item: ScheduledItem = {
      id: params.id,
      time_type: 'heartbeat',
      event_type: params.event_type,
      interval_ms: params.interval_ms,
      next_fire_at: now + params.interval_ms,
      created_at: now,
      ...(params.ttl !== undefined && {
        ttl: params.ttl,
        fires_remaining: params.ttl,
        max_fires: params.ttl,
      }),
      ...(params.payload !== undefined && { payload: params.payload }),
      ...(params.ref !== undefined && { ref: params.ref }),
    };
    this.items.set(params.id, item);
    return item;
  }

  /**
   * Schedule a one-shot delayed event.
   * Example: "send a notification in 60 seconds".
   */
  scheduleOneShot(params: {
    id: string;
    event_type: string;
    delay_ms: number;
    payload?: unknown;
    ref?: string;
  }): ScheduledItem {
    this._assertCapacity();
    if (this.items.has(params.id)) {
      throw new Error(`EventScheduler: item with id '${params.id}' already exists`);
    }
    const now = Date.now();
    const item: ScheduledItem = {
      id: params.id,
      time_type: 'one_shot',
      event_type: params.event_type,
      next_fire_at: now + params.delay_ms,
      created_at: now,
      ttl: 1,
      fires_remaining: 1,
      max_fires: 1,
      ...(params.payload !== undefined && { payload: params.payload }),
      ...(params.ref !== undefined && { ref: params.ref }),
    };
    this.items.set(params.id, item);
    return item;
  }

  /**
   * Schedule a cron-like recurring event using a simple interval.
   * Supports an optional active-hours window (0–23 hour range).
   * Example: "ping every 5 minutes, only between 9am and 6pm".
   */
  scheduleCron(params: {
    id: string;
    event_type: string;
    /** Simplified scheduling: interval in ms instead of a cron expression. */
    interval_ms: number;
    payload?: unknown;
    ref?: string;
    /** Hour range (0–23) during which the event may fire. */
    active_hours?: { start: number; end: number };
  }): ScheduledItem {
    this._assertCapacity();
    if (this.items.has(params.id)) {
      throw new Error(`EventScheduler: item with id '${params.id}' already exists`);
    }
    const now = Date.now();
    const item: ScheduledItem = {
      id: params.id,
      time_type: 'cron',
      event_type: params.event_type,
      interval_ms: params.interval_ms,
      next_fire_at: now + params.interval_ms,
      created_at: now,
      ...(params.payload !== undefined && { payload: params.payload }),
      ...(params.ref !== undefined && { ref: params.ref }),
      ...(params.active_hours !== undefined && { active_hours: params.active_hours }),
    };
    this.items.set(params.id, item);
    return item;
  }

  // ─── Tick ────────────────────────────────────────────────────────────────────

  /**
   * Evaluate all scheduled items against the current time.
   * Returns TimeEvents for every item whose next_fire_at has elapsed.
   * Decrements fires_remaining and removes expired items automatically.
   */
  tick(): TimeEvent[] {
    const now = Date.now();
    const events: TimeEvent[] = [];
    const toRemove: string[] = [];

    for (const [id, item] of this.items) {
      if (item.next_fire_at > now) continue;

      // Active-hours check for cron items
      if (item.active_hours !== undefined) {
        const { start, end, timezone_offset_hours } = item.active_hours;
        // Use local time by default; apply timezone_offset_hours for fixed-offset zones.
        // Note: active_hours is evaluated in local system time unless timezone_offset_hours is specified.
        const utcHour = new Date(now).getUTCHours();
        const hour = timezone_offset_hours !== undefined
          ? ((utcHour + timezone_offset_hours) % 24 + 24) % 24
          : new Date(now).getHours();
        // Support overnight windows (e.g. start=22, end=6)
        const inWindow = start <= end
          ? hour >= start && hour < end
          : hour >= start || hour < end;
        if (!inWindow) {
          // Outside active window — advance next_fire_at and skip
          if (item.interval_ms !== undefined) {
            item.next_fire_at = now + item.interval_ms;
          }
          continue;
        }
      }

      // Build the TimeEvent
      const event = createTimeEvent({
        time_type: item.time_type,
        type: item.event_type,
        interval_ms: item.interval_ms,
        ...(item.fires_remaining !== undefined && { fires_remaining: item.fires_remaining }),
        ...(item.ttl !== undefined && { ttl: item.ttl }),
        scheduled_at: item.created_at,
        payload: item.payload ?? {},
        priority: item.priority ?? 10,
        context: item.ref !== undefined ? { ref: item.ref } : undefined,
      });
      events.push(event);

      // Update state
      item.last_fired_at = now;

      // Decrement fires_remaining for items with a TTL
      if (item.fires_remaining !== undefined) {
        item.fires_remaining--;
        if (item.fires_remaining <= 0) {
          toRemove.push(id);
          continue;
        }
      }

      // Advance next_fire_at for recurring items
      if (item.interval_ms !== undefined) {
        item.next_fire_at = now + item.interval_ms;
      }
    }

    for (const id of toRemove) {
      this.items.delete(id);
    }

    return events;
  }

  // ─── Cancellation ────────────────────────────────────────────────────────────

  /** Cancel a single scheduled item by ID. Returns true if the item existed. */
  cancel(id: string): boolean {
    return this.items.delete(id);
  }

  /**
   * Cancel all scheduled items that share a given ref tag.
   * Returns the number of items removed.
   */
  cancelByRef(ref: string): number {
    const toDelete: string[] = [];
    for (const [id, item] of this.items) {
      if (item.ref === ref) toDelete.push(id);
    }
    for (const id of toDelete) this.items.delete(id);
    return toDelete.length;
  }

  // ─── Accessors ───────────────────────────────────────────────────────────────

  getItem(id: string): ScheduledItem | undefined {
    return this.items.get(id);
  }

  getAllItems(): ScheduledItem[] {
    return Array.from(this.items.values());
  }

  size(): number {
    return this.items.size;
  }

  // ─── Persistence ─────────────────────────────────────────────────────────────

  /**
   * Persist all current schedules to the state store.
   * No-op if persist_schedules is false or no store was provided.
   */
  persist(): void {
    if (!this.config.persist_schedules || this.store === undefined) return;
    const snapshot = Array.from(this.items.values());
    this.store.set<ScheduledItem[]>(PERSIST_KEY, snapshot);
  }

  /**
   * Restore schedules from the state store.
   * Stale items (next_fire_at in the past) are re-scheduled to fire immediately.
   * No-op if persist_schedules is false or no store was provided.
   */
  restore(): void {
    if (!this.config.persist_schedules || this.store === undefined) return;
    const snapshot = this.store.get<ScheduledItem[]>(PERSIST_KEY);
    if (!Array.isArray(snapshot)) return;

    const now = Date.now();
    this.items.clear();
    for (const item of snapshot) {
      // Re-schedule stale items to fire on the next tick
      if (item.next_fire_at < now) {
        item.next_fire_at = now;
      }
      this.items.set(item.id, item);
    }
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  private _assertCapacity(): void {
    if (this.items.size >= this.config.max_scheduled_items) {
      throw new Error(
        `EventScheduler capacity exceeded: max ${this.config.max_scheduled_items} items`,
      );
    }
  }
}
