/**
 * DaemonTickHandler
 *
 * Processes a daemon tick — the core "event loop" for daemon mode.
 * Called by the UserPromptSubmit hook when the prompt matches the
 * configured tick_command.
 */

import type { ExecutorConfig } from '../../shared/config.js';
import { EventBus } from '../events/event-bus.js';
import { createLogger } from '../../shared/logger.js';
import { generateEventId, timestamp } from '../../shared/utils.js';
import type { ExecutorModeManager } from '../../core/processing/executor-mode.js';
import type { ExecutorBudgetManager } from './executor-budget.js';

const logger = createLogger('daemon-tick-handler');

/** Result returned from a single daemon tick. */
export interface TickResult {
  tick_number: number;
  events_processed: number;
  duration_ms: number;
  budget_status: 'ok' | 'warning' | 'exceeded';
}

export class DaemonTickHandler {
  private tickCount: number = 0;
  private readonly executorMode: ExecutorModeManager;
  private readonly budgetManager: ExecutorBudgetManager;
  private readonly eventBus: EventBus;
  private config: ExecutorConfig;
  /** Returns the current core event queue depth. Wired after plugin init via setQueueDepthGetter(). */
  private getQueueDepth: () => number = () => 0;

  constructor(deps: {
    executorMode: ExecutorModeManager;
    budgetManager: ExecutorBudgetManager;
    eventBus: EventBus;
    config: ExecutorConfig;
  }) {
    this.executorMode = deps.executorMode;
    this.budgetManager = deps.budgetManager;
    this.eventBus = deps.eventBus;
    this.config = deps.config;
  }

  /**
   * Wire the live queue depth getter after the core event queue has been
   * initialised. Called from bootstrap after initializePlugins().
   */
  setQueueDepthGetter(getter: () => number): void {
    this.getQueueDepth = getter;
  }

  /**
   * Process one daemon tick cycle.
   *
   * Flow:
   * 1. Check budget — abort if exceeded
   * 2. Check daily reset
   * 3. Emit executor:tick_received
   * 4. Build additionalContext with active workflows, pending events, memory state
   * 5. Emit executor:tick_completed
   */
  async handleTick(): Promise<TickResult> {
    const startMs = Date.now();
    this.tickCount++;
    const tickNumber = this.tickCount;

    logger.info('Daemon tick received', { tick_number: tickNumber });

    // Step 1: Check budget
    if (!this.budgetManager.canProcess()) {
      logger.warn('Tick aborted: budget exceeded', { tick_number: tickNumber });
      return {
        tick_number: tickNumber,
        events_processed: 0,
        duration_ms: Date.now() - startMs,
        budget_status: 'exceeded',
      };
    }

    // Step 2: Check daily reset
    this.budgetManager.checkDailyReset();

    // Step 3: Emit tick_received
    this.eventBus.emit({
      id: generateEventId(),
      timestamp: timestamp(),
      type: 'executor:tick_received',
      source: { kind: 'system' },
      payload: {
        type: 'executor:tick_received',
        data: {
          tick_number: tickNumber,
          pending_events: this.getQueueDepth(),
        },
      },
    });

    // Step 4: Determine budget status for result
    const spending = this.budgetManager.getSpending();
    let budgetStatus: 'ok' | 'warning' | 'exceeded' = 'ok';
    if (
      (this.config.budget.flat_cap_usd !== undefined &&
        this.config.budget.flat_cap_usd > 0 &&
        spending.total_usd >= this.config.budget.flat_cap_usd * this.config.budget.warning_threshold) ||
      (this.config.budget.daily_cap_usd !== undefined &&
        this.config.budget.daily_cap_usd > 0 &&
        spending.daily_usd >= this.config.budget.daily_cap_usd * this.config.budget.warning_threshold)
    ) {
      budgetStatus = 'warning';
    }

    // events_processed is 0 here — actual event processing happens when the
    // tick context is injected and Claude executes the pending actions.
    const eventsProcessed = 0;
    const durationMs = Date.now() - startMs;

    // Step 5: Emit tick_completed
    this.eventBus.emit({
      id: generateEventId(),
      timestamp: timestamp(),
      type: 'executor:tick_completed',
      source: { kind: 'system' },
      payload: {
        type: 'executor:tick_completed',
        data: {
          tick_number: tickNumber,
          events_processed: eventsProcessed,
          duration_ms: durationMs,
        },
      },
    });

    logger.info('Daemon tick completed', {
      tick_number: tickNumber,
      events_processed: eventsProcessed,
      duration_ms: Date.now() - startMs,
      budget_status: budgetStatus,
    });

    return {
      tick_number: tickNumber,
      events_processed: eventsProcessed,
      duration_ms: Date.now() - startMs,
      budget_status: budgetStatus,
    };
  }

  /**
   * Build the additionalContext payload for daemon tick injection.
   * Includes: active workflows, pending events summary, memory state.
   *
   * Pending event count is wired via setQueueDepthGetter(). Active workflow
   * count remains 0 until WorkflowRegistry exposes activeCount().
   */
  buildTickContext(): string {
    const spending = this.budgetManager.getSpending();
    const canProcess = this.budgetManager.canProcess();
    const pendingEvents = this.getQueueDepth();
    const activeWorkflows = 0;
    return `--- Daemon Tick Context ---
Tick #${this.tickCount}
Mode: ${this.executorMode.getMode()}
Budget: total=$${spending.total_usd.toFixed(4)} daily=$${spending.daily_usd.toFixed(4)} (can_process=${canProcess})
Pending events: ${pendingEvents}
Active workflows: ${activeWorkflows}`;
  }

  /** Get cumulative tick count for metrics. */
  getTickCount(): number {
    return this.tickCount;
  }

  /**
   * Return the configured tick command string.
   * Used by the UserPromptSubmit handler to detect daemon ticks.
   */
  getTickCommand(): string {
    return this.config.daemon.tick_command;
  }
}
