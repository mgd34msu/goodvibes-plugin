/**
 * HeartbeatManager — Layer 3 Plugin
 *
 * Manages the default heartbeat pulse. Purely reactive to external ticks —
 * no internal timers. Debounces rapid ticks to enforce the configured interval.
 */

import { TimeEvent, createTimeEvent } from '../../extensions/events/time-event.js';

// ─── Config ───────────────────────────────────────────────────────────────────

export interface HeartbeatConfig {
  /** Minimum interval between heartbeat events in milliseconds. Default 60000 (60s). */
  interval_ms: number;
  /** Whether the heartbeat is active. Default true. */
  enabled: boolean;
  /** Priority of emitted heartbeat events. Defaults to 10. */
  priority?: number;
}

// ─── HeartbeatManager ────────────────────────────────────────────────────────

/**
 * Stateless scanner that emits heartbeat events on external ticks.
 * Debounces at 80% of the configured interval to prevent duplicate fires
 * when the external scheduler runs slightly early.
 */
export class HeartbeatManager {
  private lastTickAt: number = 0;
  private tickCount: number = 0;

  constructor(private config: HeartbeatConfig) {}

  /**
   * Called on each external tick.
   * Returns a heartbeat TimeEvent if enough time has elapsed since the last tick,
   * or null if the interval has not yet elapsed (debounce guard).
   */
  tick(): TimeEvent | null {
    if (!this.config.enabled) return null;

    const now = Date.now();
    // Debounce: require at least 80% of the interval to have elapsed
    if (this.lastTickAt > 0 && now - this.lastTickAt < this.config.interval_ms * 0.8) {
      return null;
    }

    this.lastTickAt = now;
    this.tickCount++;

    return createTimeEvent({
      time_type: 'heartbeat',
      type: 'tick:heartbeat',
      interval_ms: this.config.interval_ms,
      payload: { tick_count: this.tickCount, timestamp: now },
      priority: this.config.priority ?? 10,
    });
  }

  // ─── Accessors ───────────────────────────────────────────────────────────────

  getTickCount(): number { return this.tickCount; }
  getLastTickAt(): number { return this.lastTickAt; }
  isEnabled(): boolean { return this.config.enabled; }
  enable(): void { this.config.enabled = true; }
  disable(): void { this.config.enabled = false; }

  /** Update the heartbeat interval at runtime. */
  setInterval(interval_ms: number): void {
    this.config.interval_ms = interval_ms;
  }

  /** Reset internal state (tick count and last fire time). */
  reset(): void {
    this.lastTickAt = 0;
    this.tickCount = 0;
  }
}
