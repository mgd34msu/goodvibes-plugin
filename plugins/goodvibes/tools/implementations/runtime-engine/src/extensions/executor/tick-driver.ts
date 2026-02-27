/**
 * TickDriver — Unified v3 pipeline evaluation driver.
 *
 * Replaces both DaemonTickScheduler (daemon mode) and the v3TickTimer
 * (non-daemon mode) with a single, mode-aware evaluation loop.
 *
 * In ALL modes, the TickDriver evaluates the full v3 pipeline on each
 * eval cycle:
 *   1. timePlugin.onTick()       — heartbeat + scheduled events
 *   2. externalPlugin.onTick()   — file-drop directory scan
 *   3. eventProcessor.processBatch() — drain queue through triggers
 *   4. staleWorkflowChecker()    — re-enqueue lost WRFC directives
 *
 * In daemon mode, when scheduled events fire, it additionally sends a
 * tmux send-keys command to give Claude Code a conversation turn.
 */

import { execFileSync, execFile } from 'node:child_process';
import { Timer } from '../../core/observability/timer.js';
import { ExecutorModeManager } from '../../core/processing/executor-mode.js';
import { TimePlugin } from '../../plugins/time/index.js';
import type { ExecutorConfig } from '../../shared/config.js';
import type { ExternalPlugin } from '../../plugins/external/index.js';
import type { EventProcessor } from '../../core/processing/event-processor.js';
import { createLogger } from '../../shared/logger.js';

const logger = createLogger('tick-driver');

/** Timeout for tmux send-keys command. */
const TMUX_TIMEOUT_MS = 5_000;
/** Stable ID for the daemon auto-tick heartbeat in the EventScheduler. */
const DAEMON_HEARTBEAT_ID = 'daemon:auto_tick';
/** Event type emitted by the EventScheduler when the daemon tick fires. */
const DAEMON_HEARTBEAT_EVENT = 'daemon:tick';

export interface TickDriverDeps {
  config: ExecutorConfig;
  executorMode: ExecutorModeManager;
  timePlugin: TimePlugin;
  externalPlugin?: ExternalPlugin;
  eventProcessor?: EventProcessor;
  staleWorkflowChecker?: () => void;
}

export class TickDriver {
  private static readonly SAFE_SESSION_NAME = /^[a-zA-Z0-9_.-]+$/;
  private static readonly SAFE_TICK_COMMAND = /^[a-zA-Z0-9\/_.-]+$/;

  private timer: Timer;
  private config: ExecutorConfig;
  private readonly executorMode: ExecutorModeManager;
  private readonly timePlugin: TimePlugin;
  private readonly externalPlugin?: ExternalPlugin;
  private readonly eventProcessor?: EventProcessor;
  private readonly staleWorkflowChecker?: () => void;
  private evalFailureCount = 0;

  constructor(deps: TickDriverDeps) {
    this.config = deps.config;
    this.executorMode = deps.executorMode;
    this.timePlugin = deps.timePlugin;
    this.externalPlugin = deps.externalPlugin;
    this.eventProcessor = deps.eventProcessor;
    this.staleWorkflowChecker = deps.staleWorkflowChecker;

    this.timer = new Timer({
      callback: () => this.evaluate(),
      intervalMs: deps.config.daemon.eval_interval_ms,
      label: 'tick-driver',
    });
  }

  /**
   * Start the tick evaluation loop.
   *
   * In daemon mode:
   * - Requires auto_tick === true, tick_interval_ms > 0, tmux available
   * - Schedules daemon:auto_tick heartbeat in EventScheduler
   * - Returns early (no timer started) if guards fail
   *
   * In non-daemon mode:
   * - Starts unconditionally
   */
  start(): void {
    if (this.timer.isRunning()) return;

    const mode = this.executorMode.getMode();

    if (mode === 'daemon') {
      if (!this.config.daemon.auto_tick) {
        logger.info('tick driver disabled — auto_tick is false');
        return;
      }

      const intervalMs = this.config.daemon.tick_interval_ms;
      if (!intervalMs || intervalMs <= 0) {
        logger.info('tick driver disabled — tick_interval_ms is 0 or unset');
        return;
      }

      if (!this.isTmuxAvailable()) {
        logger.warn('tick driver not starting — tmux not available');
        return;
      }

      const sessionName = this.config.daemon.tmux_session_name;
      const tickCommand = this.config.daemon.tick_command;

      if (!TickDriver.SAFE_SESSION_NAME.test(sessionName)) {
        logger.warn('tick driver not starting — invalid tmux_session_name', { sessionName });
        return;
      }
      if (!TickDriver.SAFE_TICK_COMMAND.test(tickCommand)) {
        logger.warn('tick driver not starting — invalid tick_command', { tickCommand });
        return;
      }

      // Schedule the daemon heartbeat via EventScheduler.
      // Cancel stale items with wrong interval first.
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
        });
      }

      logger.info('tick driver starting in daemon mode', {
        eval_interval_ms: this.config.daemon.eval_interval_ms,
        tick_interval_ms: intervalMs,
        session: sessionName,
      });
    } else {
      logger.info('tick driver starting in engaged mode', {
        eval_interval_ms: this.config.daemon.eval_interval_ms,
      });
    }

    this.timer.start();
  }

  /**
   * Stop the tick evaluation loop.
   * Cancels the timer and removes the daemon heartbeat from EventScheduler.
   */
  stop(): void {
    this.timer.stop();

    // Cancel the daemon heartbeat from EventScheduler if it exists
    const removed = this.timePlugin.getScheduler().cancel(DAEMON_HEARTBEAT_ID);
    if (!removed) {
      logger.debug('daemon heartbeat was already removed or never scheduled');
    }

    logger.info('tick driver stopped');
  }

  /** Returns true if the eval timer is running. */
  isRunning(): boolean {
    return this.timer.isRunning();
  }

  /** Returns the cumulative number of evaluation failures for health monitoring. */
  getEvalFailureCount(): number {
    return this.evalFailureCount;
  }

  /**
   * Apply a new ExecutorConfig at runtime without restarting the process.
   *
   * Handles:
   * - auto_tick toggled off → stop (if running)
   * - auto_tick toggled on → start (if not running)
   * - tick_interval_ms changed while running → reschedule heartbeat
   * - eval_interval_ms changed → reconfigure timer
   */
  reconfigure(newConfig: ExecutorConfig): void {
    const wasRunning = this.isRunning();
    const oldAutoTick = this.config.daemon.auto_tick;
    const oldTickInterval = this.config.daemon.tick_interval_ms;
    const oldEvalInterval = this.config.daemon.eval_interval_ms;

    this.config = newConfig;

    const newAutoTick = newConfig.daemon.auto_tick;
    const newTickInterval = newConfig.daemon.tick_interval_ms;
    const newEvalInterval = newConfig.daemon.eval_interval_ms;

    // Handle auto_tick toggle
    if (newAutoTick && !wasRunning) {
      logger.info('auto_tick enabled via reconfigure — starting');
      this.start();
    } else if (!newAutoTick && wasRunning) {
      logger.info('auto_tick disabled via reconfigure — stopping');
      this.stop();
    } else if (wasRunning) {
      // Update tick interval (daemon heartbeat schedule)
      if (newTickInterval !== oldTickInterval) {
        this.rescheduleHeartbeat(newTickInterval);
      }
      // Update eval interval (Timer interval)
      if (newEvalInterval !== oldEvalInterval) {
        this.timer.reconfigure(newEvalInterval);
      }
    }

    logger.debug('tick driver reconfigured', {
      old_auto_tick: oldAutoTick,
      new_auto_tick: newAutoTick,
      old_tick_interval_ms: oldTickInterval,
      new_tick_interval_ms: newTickInterval,
      old_eval_interval_ms: oldEvalInterval,
      new_eval_interval_ms: newEvalInterval,
    });
  }

  /**
   * Cancel the existing daemon heartbeat and reschedule with a new interval.
   * Only called when the driver is already running in daemon mode.
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
   * Called by the Timer on each eval cycle.
   *
   * Runs the full v3 pipeline:
   * 1. timePlugin.onTick() — heartbeat + scheduled events
   * 2. externalPlugin.onTick() — file-drop scan
   * 3. eventProcessor.processBatch() — drain queue through triggers
   * 4. staleWorkflowChecker() — re-enqueue lost directives
   * 5. (daemon only) sendTick() if scheduled events fired
   */
  private evaluate(): void {
    // Step 1: Time events
    let timeResult = { heartbeat_emitted: false, scheduled_emitted: 0 };
    try {
      timeResult = this.timePlugin.onTick();
    } catch (err) {
      this.evalFailureCount++;
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('timePlugin.onTick() error', { error: msg, eval_failures: this.evalFailureCount });
      if (this.evalFailureCount === 5 || this.evalFailureCount === 10) {
        logger.warn('eval failure threshold crossed', { eval_failures: this.evalFailureCount });
      }
    }

    // Step 2: External events (async — fire and forget with error logging)
    if (this.externalPlugin) {
      this.externalPlugin.onTick().catch((err) => {
        this.evalFailureCount++;
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn('externalPlugin.onTick() error', { error: msg, eval_failures: this.evalFailureCount });
        if (this.evalFailureCount === 5 || this.evalFailureCount === 10) {
          logger.warn('eval failure threshold crossed', { eval_failures: this.evalFailureCount });
        }
      });
    }

    // Step 3: Process queued events through triggers
    if (this.eventProcessor) {
      this.eventProcessor.processBatch().catch((err) => {
        this.evalFailureCount++;
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn('eventProcessor.processBatch() error', { error: msg, eval_failures: this.evalFailureCount });
        if (this.evalFailureCount === 5 || this.evalFailureCount === 10) {
          logger.warn('eval failure threshold crossed', { eval_failures: this.evalFailureCount });
        }
      });
    }

    // Step 4: Stale workflow watchdog
    if (this.staleWorkflowChecker) {
      try {
        this.staleWorkflowChecker();
      } catch (err) {
        this.evalFailureCount++;
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn('staleWorkflowChecker error', { error: msg, eval_failures: this.evalFailureCount });
        if (this.evalFailureCount === 5 || this.evalFailureCount === 10) {
          logger.warn('eval failure threshold crossed', { eval_failures: this.evalFailureCount });
        }
      }
    }

    // Step 5: In daemon mode, send tmux tick when scheduled events fire
    if (timeResult.scheduled_emitted > 0 && this.executorMode.getMode() === 'daemon') {
      logger.debug('scheduled events fired — sending tmux tick', {
        scheduled_emitted: timeResult.scheduled_emitted,
      });
      this.sendTick();
    }
  }

  /**
   * Send the tick command to the tmux session asynchronously.
   * Fire-and-forget — failures are logged as warnings without blocking the eval loop.
   */
  private sendTick(): void {
    const sessionName = this.config.daemon.tmux_session_name;
    const tickCommand = this.config.daemon.tick_command;
    execFile(
      'tmux',
      ['send-keys', '-t', sessionName, tickCommand, 'Enter'],
      { timeout: TMUX_TIMEOUT_MS },
      (err) => {
        if (err) {
          logger.warn('failed to send tick via tmux', { error: err.message });
        } else {
          logger.debug('tick sent via tmux', { session: sessionName });
        }
      }
    );
  }

  /**
   * Check whether tmux is available and has at least one active session.
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
