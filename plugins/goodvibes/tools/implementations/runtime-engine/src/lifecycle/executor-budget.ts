/**
 * ExecutorBudgetManager
 *
 * Tracks session-level spending against flat (total) and daily USD caps.
 * Distinct from the agent-level BudgetTracker in src/agents/ — this operates
 * at the executor level across all agents in a session.
 */

import type { ExecutorBudgetConfig } from '../shared/config.js';
import { EventBus } from '../events/event-bus.js';
import type { StateStoreInterface } from '../core/types.js';
import { createLogger } from '../shared/logger.js';
import { generateEventId, timestamp } from '../shared/utils.js';

const logger = createLogger('executor-budget');

/** Current spending state persisted across sessions. */
export interface SpendingRecord {
  /** Total USD spent across all sessions (flat cap tracking). */
  total_usd: number;
  /** USD spent today (daily cap tracking). */
  daily_usd: number;
  /** ISO-8601 timestamp of the last daily reset. */
  daily_reset_at: string;
  /** ISO-8601 timestamp of the last spending update. */
  last_updated: string;
}

/** State store key for persisting budget data. */
const BUDGET_STATE_KEY = 'executor.budget.spending';

export class ExecutorBudgetManager {
  private config: ExecutorBudgetConfig;
  private eventBus: EventBus;
  private spending: SpendingRecord;
  private paused: boolean;
  private warningFired: { flat: boolean; daily: boolean };

  constructor(config: ExecutorBudgetConfig, eventBus: EventBus) {
    this.config = config;
    this.eventBus = eventBus;
    this.paused = false;
    this.warningFired = { flat: false, daily: false };
    this.spending = {
      total_usd: 0,
      daily_usd: 0,
      daily_reset_at: timestamp(),
      last_updated: timestamp(),
    };
  }

  /**
   * Record spending from an agent completion or progress report.
   * Adds to both total and daily accumulators, then checks thresholds and caps.
   */
  recordSpending(amount_usd: number): void {
    if (amount_usd <= 0) return;

    this.spending.total_usd += amount_usd;
    this.spending.daily_usd += amount_usd;
    this.spending.last_updated = timestamp();

    logger.debug('Spending recorded', {
      amount_usd,
      total_usd: this.spending.total_usd,
      daily_usd: this.spending.daily_usd,
    });

    // Check flat cap
    if (this.config.flat_cap_usd !== undefined && this.config.flat_cap_usd > 0) {
      const flatRatio = this.spending.total_usd / this.config.flat_cap_usd;

      // Warning threshold (fired once)
      if (flatRatio >= this.config.warning_threshold && !this.warningFired.flat) {
        this.warningFired.flat = true;
        logger.warn('Executor flat cap warning threshold reached', {
          spent_usd: this.spending.total_usd,
          cap_usd: this.config.flat_cap_usd,
          threshold: this.config.warning_threshold,
        });
        this.eventBus.emit({
          id: generateEventId(),
          timestamp: timestamp(),
          type: 'executor:budget_warning',
          source: { kind: 'system' },
          payload: {
            type: 'executor:budget_warning',
            data: {
              cap_type: 'flat',
              spent_usd: this.spending.total_usd,
              cap_usd: this.config.flat_cap_usd,
              threshold: this.config.warning_threshold,
            },
          },
        });
      }

      // Flat cap exceeded
      if (this.spending.total_usd >= this.config.flat_cap_usd && !this.paused) {
        this.paused = true;
        logger.warn('Executor flat cap exceeded — processing paused', {
          spent_usd: this.spending.total_usd,
          cap_usd: this.config.flat_cap_usd,
        });
        this.eventBus.emit({
          id: generateEventId(),
          timestamp: timestamp(),
          type: 'executor:budget_exceeded',
          source: { kind: 'system' },
          payload: {
            type: 'executor:budget_exceeded',
            data: {
              cap_type: 'flat',
              spent_usd: this.spending.total_usd,
              cap_usd: this.config.flat_cap_usd,
            },
          },
        });
        this.eventBus.emit({
          id: generateEventId(),
          timestamp: timestamp(),
          type: 'executor:paused',
          source: { kind: 'system' },
          payload: {
            type: 'executor:paused',
            data: { reason: 'flat_cap_exceeded' },
          },
        });
        return;
      }
    }

    // Check daily cap
    if (this.config.daily_cap_usd !== undefined && this.config.daily_cap_usd > 0) {
      const dailyRatio = this.spending.daily_usd / this.config.daily_cap_usd;

      // Warning threshold (fired once per day)
      if (dailyRatio >= this.config.warning_threshold && !this.warningFired.daily) {
        this.warningFired.daily = true;
        logger.warn('Executor daily cap warning threshold reached', {
          spent_usd: this.spending.daily_usd,
          cap_usd: this.config.daily_cap_usd,
          threshold: this.config.warning_threshold,
        });
        this.eventBus.emit({
          id: generateEventId(),
          timestamp: timestamp(),
          type: 'executor:budget_warning',
          source: { kind: 'system' },
          payload: {
            type: 'executor:budget_warning',
            data: {
              cap_type: 'daily',
              spent_usd: this.spending.daily_usd,
              cap_usd: this.config.daily_cap_usd,
              threshold: this.config.warning_threshold,
            },
          },
        });
      }

      // Daily cap exceeded
      if (this.spending.daily_usd >= this.config.daily_cap_usd && !this.paused) {
        this.paused = true;
        logger.warn('Executor daily cap exceeded — processing paused', {
          spent_usd: this.spending.daily_usd,
          cap_usd: this.config.daily_cap_usd,
        });
        this.eventBus.emit({
          id: generateEventId(),
          timestamp: timestamp(),
          type: 'executor:budget_exceeded',
          source: { kind: 'system' },
          payload: {
            type: 'executor:budget_exceeded',
            data: {
              cap_type: 'daily',
              spent_usd: this.spending.daily_usd,
              cap_usd: this.config.daily_cap_usd,
            },
          },
        });
        this.eventBus.emit({
          id: generateEventId(),
          timestamp: timestamp(),
          type: 'executor:paused',
          source: { kind: 'system' },
          payload: {
            type: 'executor:paused',
            data: { reason: 'daily_cap_exceeded' },
          },
        });
      }
    }
  }

  /**
   * Check if processing should continue.
   * Returns false if any cap is exceeded.
   */
  canProcess(): boolean {
    return !this.paused;
  }

  /** Get current spending state. */
  getSpending(): SpendingRecord {
    return { ...this.spending };
  }

  /**
   * Check and reset daily cap if reset_hour has passed.
   * Returns true if a reset occurred.
   */
  checkDailyReset(): boolean {
    const now = new Date();
    const currentHour = now.getHours();
    const resetAt = new Date(this.spending.daily_reset_at);
    const lastResetDay = resetAt.toDateString();
    const today = now.toDateString();

    // Reset if: today is a different day than last reset AND we've passed the reset hour
    if (today !== lastResetDay && currentHour >= this.config.daily_reset_hour) {
      const previousDailySpent = this.spending.daily_usd;
      this.spending.daily_usd = 0;
      this.spending.daily_reset_at = timestamp();
      this.spending.last_updated = timestamp();
      this.warningFired.daily = false;

      // Resume processing if paused due to daily cap
      if (this.paused) {
        // Only resume if flat cap is not also exceeded
        const flatExceeded =
          this.config.flat_cap_usd !== undefined &&
          this.config.flat_cap_usd > 0 &&
          this.spending.total_usd >= this.config.flat_cap_usd;
        if (!flatExceeded) {
          this.paused = false;
          this.eventBus.emit({
            id: generateEventId(),
            timestamp: timestamp(),
            type: 'executor:resumed',
            source: { kind: 'system' },
            payload: {
              type: 'executor:resumed',
              data: { reason: 'daily_budget_reset' },
            },
          });
        }
      }

      logger.info('Daily budget reset', {
        previous_daily_spent: previousDailySpent,
        reset_hour: this.config.daily_reset_hour,
      });

      this.eventBus.emit({
        id: generateEventId(),
        timestamp: timestamp(),
        type: 'executor:budget_reset',
        source: { kind: 'system' },
        payload: {
          type: 'executor:budget_reset',
          data: {
            previous_daily_spent: previousDailySpent,
            reset_hour: this.config.daily_reset_hour,
          },
        },
      });

      return true;
    }

    return false;
  }

  /**
   * Manually adjust budget configuration (operator override).
   * Can increase caps or change thresholds at runtime.
   */
  adjustBudget(adjustments: Partial<ExecutorBudgetConfig>): void {
    const previousPaused = this.paused;
    Object.assign(this.config, adjustments);

    // Re-check if caps are still exceeded after adjustment
    if (this.paused) {
      const flatOk =
        this.config.flat_cap_usd === undefined ||
        this.config.flat_cap_usd <= 0 ||
        this.spending.total_usd < this.config.flat_cap_usd;
      const dailyOk =
        this.config.daily_cap_usd === undefined ||
        this.config.daily_cap_usd <= 0 ||
        this.spending.daily_usd < this.config.daily_cap_usd;

      if (flatOk && dailyOk) {
        this.paused = false;
        this.eventBus.emit({
          id: generateEventId(),
          timestamp: timestamp(),
          type: 'executor:resumed',
          source: { kind: 'system' },
          payload: {
            type: 'executor:resumed',
            data: { reason: 'budget_adjusted' },
          },
        });
        logger.info('Executor resumed after budget adjustment');
      }
    }

    logger.info('Budget configuration adjusted', { adjustments, was_paused: previousPaused, now_paused: this.paused });
  }

  /** Persist spending state to the state store. */
  persist(stateStore: StateStoreInterface): void {
    stateStore.set(BUDGET_STATE_KEY, this.spending);
    logger.debug('Budget state persisted');
  }

  /** Restore spending state from the state store. */
  restore(stateStore: StateStoreInterface): void {
    const stored = stateStore.get<SpendingRecord>(BUDGET_STATE_KEY);
    if (stored && typeof stored === 'object') {
      this.spending = {
        total_usd: typeof stored.total_usd === 'number' ? stored.total_usd : 0,
        daily_usd: typeof stored.daily_usd === 'number' ? stored.daily_usd : 0,
        daily_reset_at: typeof stored.daily_reset_at === 'string' ? stored.daily_reset_at : timestamp(),
        last_updated: typeof stored.last_updated === 'string' ? stored.last_updated : timestamp(),
      };
      logger.info('Budget state restored', {
        total_usd: this.spending.total_usd,
        daily_usd: this.spending.daily_usd,
      });

      // Check if caps are already exceeded after restore
      if (this.config.flat_cap_usd !== undefined && this.config.flat_cap_usd > 0) {
        if (this.spending.total_usd >= this.config.flat_cap_usd) {
          this.paused = true;
          this.warningFired.flat = true;
          logger.warn('Executor paused after state restore: flat cap exceeded');
        } else if (this.spending.total_usd >= this.config.flat_cap_usd * this.config.warning_threshold) {
          this.warningFired.flat = true;
        }
      }
      if (this.config.daily_cap_usd !== undefined && this.config.daily_cap_usd > 0) {
        if (this.spending.daily_usd >= this.config.daily_cap_usd) {
          this.paused = true;
          this.warningFired.daily = true;
          logger.warn('Executor paused after state restore: daily cap exceeded');
        } else if (this.spending.daily_usd >= this.config.daily_cap_usd * this.config.warning_threshold) {
          this.warningFired.daily = true;
        }
      }
    }
  }
}
