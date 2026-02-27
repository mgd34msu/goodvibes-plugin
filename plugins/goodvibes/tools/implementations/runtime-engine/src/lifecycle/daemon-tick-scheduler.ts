/**
 * DaemonTickScheduler
 *
 * Drives the v3 TimePlugin scheduling system internally in daemon mode.
 * Schedules a recurring heartbeat via EventScheduler and, when the heartbeat
 * fires, sends a tmux send-keys command to give Claude Code a conversation turn.
 *
 * This replaces the external systemd/cron approach for daemon ticks — the
 * runtime engine drives itself at the configured tick_interval_ms.
 */

import { execFileSync } from 'node:child_process';
import { ExecutorModeManager } from './executor-mode.js';
import { TimePlugin } from '../plugins/time/time-plugin.js';
import type { ExecutorConfig } from '../shared/config.js';
import { createLogger } from '../shared/logger.js';

const logger = createLogger('daemon-tick-scheduler');

/** Interval at which the internal eval timer drives timePlugin.onTick(). */
const EVAL_INTERVAL_MS = 5_000;
/** Timeout for tmux send-keys command. */
const TMUX_TIMEOUT_MS = 5_000;
/** Stable ID for the daemon auto-tick heartbeat in the EventScheduler. */
const DAEMON_HEARTBEAT_ID = 'daemon:auto_tick';
/** Event type emitted by the EventScheduler when the daemon tick fires. */
const DAEMON_HEARTBEAT_EVENT = 'daemon:tick';

export class DaemonTickScheduler {
  private static readonly SAFE_SESSION_NAME = /^[a-zA-Z0-9_.-]+$/;
  private static readonly SAFE_TICK_COMMAND = /^[a-zA-Z0-9\/_. -]+$/;

  private evalTimer: ReturnType<typeof setInterval> | null = null;
  private config: ExecutorConfig;
  private readonly executorMode: ExecutorModeManager;
  private readonly timePlugin: TimePlugin;

  constructor(deps: {
    config: ExecutorConfig;
    executorMode: ExecutorModeManager;
    timePlugin: TimePlugin;
  }) {
    this.config = deps.config;
    this.executorMode = deps.executorMode;
    this.timePlugin = deps.timePlugin;
  }

  /**
   * Start the daemon tick scheduler.
   *
   * Guards:
   * - Only runs in daemon mode
   * - Only runs when tick_interval_ms > 0
   * - Only runs when tmux is available
   * - Idempotent: no-op if already running
   */
  start(): void {
    if (this.evalTimer) return;

    const mode = this.executorMode.getMode();
    if (mode !== 'daemon') {
      logger.debug('not starting — mode is not daemon', { mode });
      return;
    }

    if (!this.config.daemon.auto_tick) {
      logger.info('daemon tick scheduler disabled — auto_tick is false');
      return;
    }

    const intervalMs = this.config.daemon.tick_interval_ms;
    if (!intervalMs || intervalMs <= 0) {
      logger.info('daemon tick scheduler disabled — tick_interval_ms is 0 or unset');
      return;
    }

    if (!this.isTmuxAvailable()) {
      logger.warn('not starting — tmux not available or no active sessions');
      return;
    }

    const sessionName = this.config.daemon.tmux_session_name;
    const tickCommand = this.config.daemon.tick_command;

    if (!DaemonTickScheduler.SAFE_SESSION_NAME.test(sessionName)) {
      logger.warn('not starting — tmux_session_name contains invalid characters', { sessionName });
      return;
    }
    if (!DaemonTickScheduler.SAFE_TICK_COMMAND.test(tickCommand)) {
      logger.warn('not starting — tick_command contains invalid characters', { tickCommand });
      return;
    }

    // Schedule the daemon heartbeat via the existing EventScheduler.
    // If a stale item exists (e.g. restored from persistence with an outdated
    // interval_ms), cancel it first so we always honour the current config.
    const scheduler = this.timePlugin.getScheduler();
    const existing = scheduler.getItem(DAEMON_HEARTBEAT_ID);
    if (existing && existing.interval_ms !== intervalMs) {
      scheduler.cancel(DAEMON_HEARTBEAT_ID);
      logger.info('cancelled stale daemon heartbeat', {
        old_interval_ms: existing.interval_ms,
        new_interval_ms: intervalMs,
      });
    }
    if (!scheduler.getItem(DAEMON_HEARTBEAT_ID)) {
      scheduler.scheduleHeartbeat({
        id: DAEMON_HEARTBEAT_ID,
        event_type: DAEMON_HEARTBEAT_EVENT,
        interval_ms: intervalMs,
        // No ttl — runs indefinitely until stop() is called
      });
    }

    // Start the internal eval timer that drives timePlugin.onTick() and sends
    // tmux ticks when the scheduler fires.
    this.evalTimer = setInterval(() => {
      this.evalAndSend();
    }, EVAL_INTERVAL_MS);
    // Unref so the timer does not prevent graceful process exit.
    this.evalTimer.unref();

    logger.info('daemon tick scheduler started', {
      eval_interval_ms: EVAL_INTERVAL_MS,
      tick_interval_ms: intervalMs,
      session: this.config.daemon.tmux_session_name,
    });
  }

  /**
   * Stop the daemon tick scheduler.
   * Cancels the eval timer, removes the event bus subscription, and removes
   * the scheduled heartbeat from the EventScheduler.
   */
  stop(): void {
    if (this.evalTimer) {
      clearInterval(this.evalTimer);
      this.evalTimer = null;
    }
    // Cancel the scheduled heartbeat from the EventScheduler
    const removed = this.timePlugin.getScheduler().cancel(DAEMON_HEARTBEAT_ID);
    if (!removed) {
      logger.debug('daemon heartbeat was already removed');
    }
    logger.info('daemon tick scheduler stopped');
  }

  /** Returns true if the eval timer is running. */
  isRunning(): boolean {
    return this.evalTimer !== null;
  }

  /**
   * Apply a new ExecutorConfig at runtime without restarting the process.
   *
   * Handles three cases:
   * - auto_tick toggled off → stop (if running)
   * - auto_tick toggled on → start (if not running)
   * - tick_interval_ms changed while running → reschedule heartbeat
   */
  reconfigure(newConfig: ExecutorConfig): void {
    const wasRunning = this.isRunning();
    const oldInterval = this.config.daemon.tick_interval_ms;
    const oldAutoTick = this.config.daemon.auto_tick;

    this.config = newConfig;

    const newAutoTick = newConfig.daemon.auto_tick;
    const newInterval = newConfig.daemon.tick_interval_ms;

    if (newAutoTick && !wasRunning) {
      // auto_tick toggled on — start
      logger.info('auto_tick enabled via reconfigure — starting scheduler');
      this.start();
    } else if (!newAutoTick && wasRunning) {
      // auto_tick toggled off — stop
      logger.info('auto_tick disabled via reconfigure — stopping scheduler');
      this.stop();
    } else if (wasRunning && newInterval !== oldInterval) {
      // Interval changed while running — reschedule heartbeat
      this.rescheduleHeartbeat(newInterval);
    }

    logger.debug('daemon tick scheduler reconfigured', {
      old_auto_tick: oldAutoTick,
      new_auto_tick: newAutoTick,
      old_interval_ms: oldInterval,
      new_interval_ms: newInterval,
    });
  }

  /**
   * Cancel the existing daemon heartbeat and reschedule with a new interval.
   * Only called when the scheduler is already running.
   */
  private rescheduleHeartbeat(intervalMs: number): void {
    const scheduler = this.timePlugin.getScheduler();
    scheduler.cancel(DAEMON_HEARTBEAT_ID);
    scheduler.scheduleHeartbeat({
      id: DAEMON_HEARTBEAT_ID,
      event_type: DAEMON_HEARTBEAT_EVENT,
      interval_ms: intervalMs,
    });
    logger.info('daemon heartbeat rescheduled', { interval_ms: intervalMs });
  }

  /**
   * Called by the eval timer on every EVAL_INTERVAL_MS tick.
   *
   * Drives timePlugin.onTick() (evaluates all scheduled items) and sends a
   * tmux tick if any scheduled events were emitted (i.e. the daemon heartbeat
   * fired this evaluation cycle).
   */
  private evalAndSend(): void {
    let result = { heartbeat_emitted: false, scheduled_emitted: 0 };
    try {
      result = this.timePlugin.onTick();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('timePlugin.onTick() error in daemon tick scheduler', { error: msg });
      return;
    }

    // Send a tmux tick whenever any scheduled event fires. In daemon mode,
    // the primary source is the DAEMON_HEARTBEAT_EVENT registered in start(),
    // but this also triggers on other scheduled events — which is intentional,
    // as it gives Claude Code a conversation turn to process any pending work.
    if (result.scheduled_emitted > 0) {
      logger.debug('daemon heartbeat fired — sending tmux tick', {
        scheduled_emitted: result.scheduled_emitted,
      });
      this.sendTick();
    }
  }

  /**
   * Send the tick command to the tmux session.
   * Uses execFileSync with a short timeout — failures are logged as warnings.
   */
  private sendTick(): void {
    const sessionName = this.config.daemon.tmux_session_name;
    const tickCommand = this.config.daemon.tick_command;
    try {
      execFileSync('tmux', ['send-keys', '-t', sessionName, tickCommand], {
        timeout: TMUX_TIMEOUT_MS,
        stdio: 'pipe',
      });
      execFileSync('tmux', ['send-keys', '-t', sessionName, 'Enter'], {
        timeout: TMUX_TIMEOUT_MS,
        stdio: 'pipe',
      });
      logger.debug('tick sent via tmux', { session: sessionName });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('failed to send tick via tmux', { error: msg });
    }
  }

  /**
   * Check whether tmux is available and has at least one active session.
   * Used as a start-up guard to avoid scheduling when tmux isn't running.
   */
  private isTmuxAvailable(): boolean {
    try {
      execFileSync('tmux', ['list-sessions'], { timeout: 2_000, stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }
}
