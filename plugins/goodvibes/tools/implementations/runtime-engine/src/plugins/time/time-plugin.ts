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
import type { Reconfigurable } from '../../shared/interfaces.js';

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

export class TimePlugin implements Reconfigurable {
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

    // 3. Persist updated schedule state when anything changed.
    // Heartbeat ticks may mutate scheduler item state (next_fire_at, last_fired_at,
    // fires_remaining) even when no scheduled events fired, so we check the dirty
    // flag rather than relying solely on scheduled_emitted > 0.
    if (this.scheduler.isDirty()) {
      this.scheduler.persist();
      this.scheduler.clearDirty();
    }

    return { heartbeat_emitted, scheduled_emitted };
  }

  // ─── Accessors ───────────────────────────────────────────────────────────────

  getHeartbeat(): HeartbeatManager { return this.heartbeat; }
  getScheduler(): EventScheduler { return this.scheduler; }

  /**
   * Apply runtime configuration changes to the time plugin.
   * Accepts a partial config keyed by subsection ('heartbeat', 'scheduler').
   * Throws on invalid input to trigger rollback in the caller.
   */
  reconfigure(config: Record<string, unknown>): void {
    const heartbeatConfig = config['heartbeat'] as Partial<HeartbeatConfig> | undefined;
    const schedulerConfig = config['scheduler'] as Partial<SchedulerConfig> | undefined;

    if (heartbeatConfig !== undefined && typeof heartbeatConfig === 'object') {
      if (typeof heartbeatConfig.interval_ms === 'number') {
        if (heartbeatConfig.interval_ms <= 0 || !Number.isFinite(heartbeatConfig.interval_ms)) {
          throw new Error(`TimePlugin.reconfigure: interval_ms must be a positive finite number, got ${heartbeatConfig.interval_ms}`);
        }
        this.heartbeat.setInterval(heartbeatConfig.interval_ms);
      }
      if (typeof heartbeatConfig.enabled === 'boolean') {
        if (heartbeatConfig.enabled) {
          this.heartbeat.enable();
        } else {
          this.heartbeat.disable();
        }
      }
    }

    // Scheduler config: max_scheduled_items is a construction-time parameter;
    // changes are noted but cannot be applied to a live scheduler without
    // reinitialisation. Log a no-op for observability.
    if (schedulerConfig !== undefined && typeof schedulerConfig === 'object') {
      if (schedulerConfig.max_scheduled_items !== undefined) {
        // max_scheduled_items is set at construction time; runtime changes have no effect.
        // Silently ignore to avoid breaking callers that pass through full config sections.
      }
    }
  }
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
