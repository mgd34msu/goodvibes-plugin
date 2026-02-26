/**
 * DaemonTickHandler
 *
 * Processes a daemon tick — the core "event loop" for daemon mode.
 * Called by the UserPromptSubmit hook when the prompt matches the
 * configured tick_command.
 */

import type { ExecutorConfig } from '../shared/config.js';
import { EventBus } from '../events/event-bus.js';
import { createLogger } from '../shared/logger.js';
import { generateEventId, timestamp } from '../shared/utils.js';
import type { ExecutorModeManager } from './executor-mode.js';
import type { ExecutorBudgetManager } from './executor-budget.js';
import { ContextClearer } from './context-clearer.js';

const logger = createLogger('daemon-tick-handler');

/** Result returned from a single daemon tick. */
export interface TickResult {
  tick_number: number;
  events_processed: number;
  duration_ms: number;
  context_cleared: boolean;
  budget_status: 'ok' | 'warning' | 'exceeded';
}

export class DaemonTickHandler {
  private tickCount: number = 0;
  private readonly executorMode: ExecutorModeManager;
  private readonly budgetManager: ExecutorBudgetManager;
  private readonly eventBus: EventBus;
  private readonly config: ExecutorConfig;
  private readonly contextClearer: ContextClearer;

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
    this.contextClearer = new ContextClearer(deps.config.daemon);
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
   * 6. If daemon mode: initiate context clearing
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
        context_cleared: false,
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
          pending_events: 0, // TODO: Wire to v3EventQueue.size() when ProcessManager exposes it
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

    // Step 6: Context clearing (daemon mode only)
    let contextCleared = false;
    if (this.executorMode.shouldClearContext()) {
      try {
        const result = await this.contextClearer.clearContext();
        contextCleared = result.success;

        this.eventBus.emit({
          id: generateEventId(),
          timestamp: timestamp(),
          type: 'executor:context_clearing',
          source: { kind: 'system' },
          payload: {
            type: 'executor:context_clearing',
            data: {
              method: result.method,
              success: result.success,
            },
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('Context clearing failed', { tick_number: tickNumber, error: msg });
      }
    }

    logger.info('Daemon tick completed', {
      tick_number: tickNumber,
      events_processed: eventsProcessed,
      duration_ms: Date.now() - startMs,
      context_cleared: contextCleared,
      budget_status: budgetStatus,
    });

    return {
      tick_number: tickNumber,
      events_processed: eventsProcessed,
      duration_ms: Date.now() - startMs,
      context_cleared: contextCleared,
      budget_status: budgetStatus,
    };
  }

  /**
   * Build the additionalContext payload for daemon tick injection.
   * Includes: active workflows, pending events summary, memory state.
   *
   * This is a stub — full implementation requires queue and workflow
   * subsystem injection which happens in Phase 4 (ProcessManager wiring).
   */
  buildTickContext(): string {
    const spending = this.budgetManager.getSpending();
    const canProcess = this.budgetManager.canProcess();
    const lines: string[] = [
      '--- Daemon Tick Context ---',
      `Tick #${this.tickCount}`,
      `Mode: ${this.executorMode.getMode()}`,
      `Budget: total=$${spending.total_usd.toFixed(4)} daily=$${spending.daily_usd.toFixed(4)} (can_process=${canProcess})`,
      'Pending events: 0', // TODO: Wire to v3EventQueue.size() when ProcessManager exposes it
      'Active workflows: 0', // TODO: Wire to WorkflowRegistry.activeCount() when ProcessManager exposes it
    ];
    return lines.join('\n');
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
