/**
 * TimePlugin — Layer 3 Plugin
 *
 * Orchestrates the heartbeat manager and event scheduler.
 * Called on each external tick (e.g. from systemd timer, cron, or launchd).
 * Emits time events to the provided EventQueueInterface.
 */

import { EventQueueInterface, StateStoreInterface } from '../../core/types.js';
import { HeartbeatManager, HeartbeatConfig } from './heartbeat.js';
import { EventScheduler, SchedulerConfig } from './scheduler.js';

// ─── Config ───────────────────────────────────────────────────────────────────

export interface TimePluginConfig {
  heartbeat: HeartbeatConfig;
  scheduler: SchedulerConfig;
}

export interface TimePluginContext {
  queue: EventQueueInterface;
  store: StateStoreInterface;
  config: TimePluginConfig;
}

// ─── TimePlugin ───────────────────────────────────────────────────────────────

export class TimePlugin {
  private heartbeat: HeartbeatManager;
  private scheduler: EventScheduler;
  private queue: EventQueueInterface;

  constructor(ctx: TimePluginContext) {
    this.queue = ctx.queue;
    this.heartbeat = new HeartbeatManager(ctx.config.heartbeat);
    this.scheduler = new EventScheduler(ctx.config.scheduler, ctx.store);

    // Restore any persisted schedules from the state store
    this.scheduler.restore();
  }

  /**
   * Called on each external tick (from system scheduler).
   *
   * Execution order:
   * 1. Emit heartbeat event (if interval has elapsed and heartbeat is enabled)
   * 2. Evaluate all scheduled items, emit events for those that are due
   * 3. Persist updated schedule state to the store
   *
   * Returns a summary of what was emitted this tick.
   */
  onTick(): { heartbeat_emitted: boolean; scheduled_emitted: number } {
    let heartbeat_emitted = false;
    let scheduled_emitted = 0;

    // 1. Heartbeat
    const heartbeatEvent = this.heartbeat.tick();
    if (heartbeatEvent !== null) {
      this.queue.enqueue(heartbeatEvent);
      heartbeat_emitted = true;
    }

    // 2. Scheduled events
    const scheduledEvents = this.scheduler.tick();
    for (const event of scheduledEvents) {
      this.queue.enqueue(event);
      scheduled_emitted++;
    }

    // 3. Persist updated schedule state (only when something changed)
    if (scheduled_emitted > 0) {
      this.scheduler.persist();
    }

    return { heartbeat_emitted, scheduled_emitted };
  }

  // ─── Accessors ───────────────────────────────────────────────────────────────

  getHeartbeat(): HeartbeatManager { return this.heartbeat; }
  getScheduler(): EventScheduler { return this.scheduler; }
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

/**
 * Returns a TimePluginConfig with sensible production defaults.
 * Default heartbeat interval: 60 seconds.
 * Default scheduler capacity: 100 items, persistence enabled.
 */
export function getDefaultTimeConfig(): TimePluginConfig {
  return {
    heartbeat: {
      interval_ms: 60_000,
      enabled: true,
    },
    scheduler: {
      max_scheduled_items: 100,
      persist_schedules: true,
    },
  };
}
