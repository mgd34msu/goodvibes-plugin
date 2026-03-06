/**
 * TickDriver — Unified pipeline evaluation driver.
 *
 * Replaces both DaemonTickScheduler (daemon mode) and the legacy TickTimer
 * (non-daemon mode) with a single, mode-aware evaluation loop.
 *
 * In ALL modes, the TickDriver evaluates the full pipeline on each
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
import type { ExecutorConfig } from '../../shared/config.js';
import type { TimeSourceAdapter } from '../adapters/types.js';
import type { ExternalSourceAdapter } from '../adapters/types.js';
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
  /** Time source adapter (wraps L3 TimePlugin). */
  timePlugin: TimeSourceAdapter;
  /** External source adapter (wraps L3 ExternalPlugin). Optional. */
  externalPlugin?: ExternalSourceAdapter;
  eventProcessor?: EventProcessor;
  staleWorkflowChecker?: () => void;
  /**
   * Returns true when there are pending directives that need a UPS tick to deliver.
   * When absent or returns false, sendTick() is suppressed to avoid flooding the tmux session.
   */
  hasPendingDirectives?: () => boolean;
  /**
   * Event log for querying webhook events to deliver to the tmux session.
   * Uses a minimal interface to avoid coupling to the full EventLog class.
   */
  eventLog?: {
    query(filter: {
      types?: import('../../shared/events.js').EventType[];
      since?: number;
      limit?: number;
    }): Promise<import('../../shared/events.js').RuntimeEvent[]>;
  };
  /**
   * Whether this process is the daemon process (GOODVIBES_EXECUTOR_MODE=daemon).
   * Used to gate daemon-only behaviors (sendTick, deliverWebhookEvents) since
   * ExecutorModeManager may return 'hybrid' even in the daemon process.
   */
  isDaemonProcess?: boolean;
}

export class TickDriver {
  private static readonly SAFE_SESSION_NAME = /^[a-zA-Z0-9_.-]+$/;
  private static readonly SAFE_TICK_COMMAND = /^[a-zA-Z0-9\/_.-]+$/;

  private timer: Timer;
  private config: ExecutorConfig;
  private readonly executorMode: ExecutorModeManager;
  private readonly timePlugin: TimeSourceAdapter;
  private readonly externalPlugin?: ExternalSourceAdapter;
  private readonly eventProcessor?: EventProcessor;
  private readonly staleWorkflowChecker?: () => void;
  private readonly hasPendingDirectives?: () => boolean;
  private readonly eventLog?: TickDriverDeps['eventLog'];
  private readonly isDaemonProcess: boolean;
  private evalFailureCount = 0;
  /** Epoch ms timestamp of the last webhook event delivered to tmux. */
  private lastWebhookDeliveredAt = 0;

  constructor(deps: TickDriverDeps) {
    this.config = deps.config;
    this.executorMode = deps.executorMode;
    this.timePlugin = deps.timePlugin;
    this.externalPlugin = deps.externalPlugin;
    this.eventProcessor = deps.eventProcessor;
    this.staleWorkflowChecker = deps.staleWorkflowChecker;
    this.hasPendingDirectives = deps.hasPendingDirectives;
    this.eventLog = deps.eventLog;
    this.isDaemonProcess = deps.isDaemonProcess ?? false;

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

    if (this.isDaemonProcess) {
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
      logger.info(`tick driver starting in ${mode} mode`, {
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
   * Runs the full pipeline:
   * 1. timePlugin.onTick() — heartbeat + scheduled events
   * 2. externalPlugin.onTick() — file-drop scan
   * 3. eventProcessor.processBatch() — drain queue through triggers
   * 4. staleWorkflowChecker() — re-enqueue lost directives
   * 5. (daemon only) sendTick() if heartbeat or scheduled events fired
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

    // Step 2 + 3: External events then process batch.
    // Chain processBatch() after externalPlugin.onTick() resolves so that
    // webhook events enqueued during the scan are visible in the same tick
    // rather than deferred to tick N+1 (race condition fix).
    const runProcessBatch = (): void => {
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
    };

    if (this.externalPlugin) {
      this.externalPlugin.onTick().then(runProcessBatch).catch((err) => {
        this.evalFailureCount++;
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn('externalPlugin.onTick() error', { error: msg, eval_failures: this.evalFailureCount });
        if (this.evalFailureCount === 5 || this.evalFailureCount === 10) {
          logger.warn('eval failure threshold crossed', { eval_failures: this.evalFailureCount });
        }
        // Still run processBatch even if externalPlugin.onTick() fails so that
        // previously enqueued events are not indefinitely blocked.
        runProcessBatch();
      });
    } else {
      runProcessBatch();
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

    // Step 5: In daemon process, send tmux tick ONLY when there are pending directives
    if ((timeResult.heartbeat_emitted || timeResult.scheduled_emitted > 0) && this.isDaemonProcess) {
      const hasPending = this.hasPendingDirectives?.() ?? false;
      if (hasPending) {
        logger.debug('pending directives found — sending tmux tick', {
          heartbeat_emitted: timeResult.heartbeat_emitted,
          scheduled_emitted: timeResult.scheduled_emitted,
        });
        this.sendTick();
      }
    }

    // Step 6: In daemon process, deliver undelivered webhook events to tmux session
    if (this.isDaemonProcess && this.eventLog) {
      this.deliverWebhookEvents().catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn('deliverWebhookEvents() error', { error: msg });
      });
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
   * Query the event log for undelivered webhook events and send each to the
   * tmux session as user input. Fire-and-forget from evaluate().
   */
  private async deliverWebhookEvents(): Promise<void> {
    if (!this.eventLog) return;

    const allEvents = await this.eventLog.query({
      since: this.lastWebhookDeliveredAt > 0 ? this.lastWebhookDeliveredAt : undefined,
      limit: 50,
    });

    const events = allEvents.filter((e) => e.type.startsWith('webhook:'));

    if (events.length === 0) return;

    const sessionName = this.config.daemon.tmux_session_name;
    let deliveredCount = 0;

    for (const event of events) {
      // Skip events already delivered (since filter is inclusive of the boundary ms)
      if (event.timestamp <= this.lastWebhookDeliveredAt) continue;

      const content = this.formatWebhookEvent(event);
      this.sendToTmux(sessionName, content);
      deliveredCount++;

      if (event.timestamp > this.lastWebhookDeliveredAt) {
        this.lastWebhookDeliveredAt = event.timestamp;
      }
    }

    logger.info('webhook events delivered to tmux', {
      count: deliveredCount,
      session: sessionName,
    });
  }

  /**
   * Send content to the tmux session using three separate execFile calls:
   * 1. The message text (no Enter)
   * 2. Enter (first press)
   * 3. Enter (second press — required for Claude Code to submit)
   */
  private sendToTmux(sessionName: string, content: string): void {
    execFile(
      'tmux',
      ['send-keys', '-l', '-t', sessionName, content],
      { timeout: TMUX_TIMEOUT_MS },
      (err) => {
        if (err) {
          logger.warn('failed to send webhook content via tmux', { error: err.message });
          return;
        }
        execFile(
          'tmux',
          ['send-keys', '-t', sessionName, 'Enter'],
          { timeout: TMUX_TIMEOUT_MS },
          (err2) => {
            if (err2) {
              logger.warn('failed to send first Enter via tmux', { error: err2.message });
              return;
            }
            execFile(
              'tmux',
              ['send-keys', '-t', sessionName, 'Enter'],
              { timeout: TMUX_TIMEOUT_MS },
              (err3) => {
                if (err3) {
                  logger.warn('failed to send second Enter via tmux', { error: err3.message });
                }
              }
            );
          }
        );
      }
    );
  }

  /**
   * Format a webhook event payload into a concise human-readable message
   * suitable for delivery to the Claude Code tmux session.
   */
  private formatWebhookEvent(event: import('../../shared/events.js').RuntimeEvent): string {
    const payload = event.payload as Record<string, unknown>;
    const action = payload['action'] as string | undefined;

    const parts: string[] = [`[Webhook: ${event.type}]`];

    if (action) parts.push(`Action: ${action}`);

    // Repository
    const repo = payload['repository'] as Record<string, unknown> | undefined;
    if (repo?.['full_name']) parts.push(`Repo: ${repo['full_name']}`);

    // Issue
    const issue = payload['issue'] as Record<string, unknown> | undefined;
    if (issue) {
      parts.push(`Issue #${issue['number']}: ${issue['title']}`);
      if (issue['body']) parts.push(`Body: ${String(issue['body']).slice(0, 500)}`);
    }

    // Pull request
    const pr = payload['pull_request'] as Record<string, unknown> | undefined;
    if (pr) {
      parts.push(`PR #${pr['number']}: ${pr['title']}`);
    }

    // Push / ref
    if (payload['ref']) parts.push(`Ref: ${payload['ref']}`);
    const headCommit = payload['head_commit'] as Record<string, unknown> | undefined;
    if (headCommit?.['message']) parts.push(`Commit: ${headCommit['message']}`);

    // Comment
    const comment = payload['comment'] as Record<string, unknown> | undefined;
    if (comment?.['body']) parts.push(`Comment: ${String(comment['body']).slice(0, 500)}`);

    return parts.join(' | ');
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
