/**
 * Timer — Core managed interval abstraction.
 *
 * A lifecycle-managed setInterval wrapper that provides idempotent
 * start/stop, automatic unref, and runtime interval reconfiguration.
 * Part of the core layer — used by all higher layers.
 *
 * @example
 * ```typescript
 * const timer = new Timer({
 *   callback: () => logger.info('tick'),
 *   intervalMs: 10_000,
 *   label: 'heartbeat',
 * });
 * timer.start();           // idempotent, auto-unrefs handle
 * timer.reconfigure(5_000); // atomically stops, updates, restarts
 * timer.stop();             // idempotent
 * ```
 */

import { createLogger } from '../../shared/logger.js';

const logger = createLogger('timer');

export class Timer {
  private handle: ReturnType<typeof setInterval> | null = null;
  private intervalMs: number;
  private readonly callback: () => void;
  private readonly label: string;

  constructor(opts: { callback: () => void; intervalMs: number; label?: string }) {
    this.callback = opts.callback;
    this.intervalMs = opts.intervalMs;
    this.label = opts.label ?? 'timer';
  }

  /** Start the timer. Idempotent — no-op if already running. */
  start(): void {
    if (this.handle) return;
    if (this.intervalMs <= 0) {
      logger.warn('cannot start timer — intervalMs must be > 0', {
        label: this.label,
        intervalMs: this.intervalMs,
      });
      return;
    }
    this.handle = setInterval(() => {
      try {
        this.callback();
      } catch (err) {
        logger.warn('timer callback threw', {
          label: this.label,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }, this.intervalMs);
    this.handle.unref();
    logger.debug('timer started', { label: this.label, intervalMs: this.intervalMs });
  }

  /** Stop the timer. Idempotent — no-op if not running. */
  stop(): void {
    if (!this.handle) return;
    clearInterval(this.handle);
    this.handle = null;
    logger.debug('timer stopped', { label: this.label });
  }

  /** Returns true if the timer is currently running. */
  isRunning(): boolean {
    return this.handle !== null;
  }

  /**
   * Update the interval. If the timer was running, it is stopped and
   * restarted with the new interval atomically.
   */
  reconfigure(intervalMs: number): void {
    // wasRunning captures pre-reconfigure state for control flow;
    // this.isRunning() after start() reflects actual outcome (start may fail).
    const wasRunning = this.isRunning();
    if (wasRunning) this.stop();
    this.intervalMs = intervalMs;
    if (wasRunning) this.start();
    logger.debug('timer reconfigured', {
      label: this.label,
      intervalMs,
      restarted: this.isRunning(),
    });
  }

  /** Returns the current interval in milliseconds. */
  getIntervalMs(): number {
    return this.intervalMs;
  }
}
