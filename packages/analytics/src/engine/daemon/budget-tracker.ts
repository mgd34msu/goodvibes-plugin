/**
 * BudgetTracker — Stateless budget computation with threshold alerting.
 *
 * Computes a BudgetState from the current SessionMetrics and tracks which
 * warning thresholds have already been surfaced, ensuring each threshold
 * is reported only once per session.
 *
 * Design notes:
 *   - Stateless computation: takes metrics as input, emits state as output.
 *   - No file I/O — reads config from constructor, metrics from update().
 *   - Stateful — callers should not share instances across workers.
 */

import type { BudgetState, SessionMetrics, AnalyticsConfig } from '../types.js';

// ---------------------------------------------------------------------------
// BudgetTracker
// ---------------------------------------------------------------------------

/**
 * Tracks budget consumption and crossing of configured warning thresholds.
 *
 * @example
 * const tracker = new BudgetTracker(config);
 * tracker.update(metrics, config);
 * const crossed = tracker.checkThresholds();
 * if (crossed) sendAlert(crossed.threshold);
 */
export class BudgetTracker {
  /** Active budget configuration, or null if no budget is set. */
  private budgetAmount: number | null = null;
  private budgetUnit: 'dollars' | 'tokens' | null = null;

  /** Sorted ascending warn thresholds (fractions, e.g. [0.5, 0.8, 1.0]). */
  private warnThresholds: number[] = [];

  /** Thresholds (as percentage fractions) that have already been reported. */
  private crossedThresholds: Set<number> = new Set();

  /** Most recently computed BudgetState. */
  private currentState: BudgetState | null = null;

  /**
   * @param config - AnalyticsConfig to read initial budget and thresholds from.
   */
  constructor(config: AnalyticsConfig) {
    this.applyConfig(config);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Override or set a budget amount and unit.
   * Resets all crossed-threshold tracking when the budget changes.
   *
   * @param amount - Budget limit in the given unit.
   * @param unit   - Either 'dollars' or 'tokens'.
   */
  setBudget(amount: number, unit: 'dollars' | 'tokens'): void {
    this.budgetAmount = amount;
    this.budgetUnit = unit;
    this.crossedThresholds.clear();
    this.currentState = null;
  }

  /**
   * Clear the active budget. All methods will return null after this call.
   */
  clearBudget(): void {
    this.budgetAmount = null;
    this.budgetUnit = null;
    this.crossedThresholds.clear();
    this.currentState = null;
  }

  /**
   * Recompute BudgetState from the provided metrics and config.
   *
   * @param metrics - Current session metrics snapshot.
   * @param config  - Current analytics configuration.
   * @returns The newly computed BudgetState, or null if no budget is configured.
   */
  update(metrics: SessionMetrics, config: AnalyticsConfig): BudgetState | null {
    // Re-read thresholds from config (may have changed between updates).
    this.warnThresholds = [...config.budget_warn_thresholds].sort((a, b) => a - b);

    // Resolve effective budget: explicit override takes priority, then config.
    const amount = this.budgetAmount ?? config.budget?.amount ?? null;
    const unit = this.budgetUnit ?? config.budget?.unit ?? null;

    if (amount === null || unit === null) {
      this.currentState = null;
      return null;
    }

    const used = unit === 'dollars' ? metrics.cost.total : metrics.tokens.total;
    const remaining = Math.max(0, amount - used);
    const percentage = amount > 0 ? used / amount : 0;

    // Determine which threshold bracket we are currently in.
    const currentThreshold = this.resolveCurrentThreshold(percentage);

    this.currentState = {
      amount,
      unit,
      used,
      remaining,
      percentage,
      warn_thresholds: [...this.warnThresholds],
      current_threshold: currentThreshold,
    };

    return this.currentState;
  }

  /**
   * Return the current BudgetState without recomputing.
   * Returns null if update() has not been called or no budget is configured.
   */
  getState(): BudgetState | null {
    return this.currentState;
  }

  /**
   * Check whether any new thresholds have been crossed since the last call.
   *
   * A threshold is "crossed" when the current usage percentage equals or
   * exceeds the threshold fraction. Each threshold is returned at most once
   * per session — subsequent calls return null for already-reported thresholds.
   *
   * @returns The lowest newly-crossed threshold or null if none.
   */
  checkThresholds(): { crossed: boolean; threshold: number } | null {
    if (this.currentState === null) {return null;}

    const { percentage } = this.currentState;

    for (const threshold of this.warnThresholds) {
      if (percentage >= threshold && !this.crossedThresholds.has(threshold)) {
        this.crossedThresholds.add(threshold);
        return { crossed: true, threshold };
      }
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Apply budget and threshold settings from a config object.
   */
  private applyConfig(config: AnalyticsConfig): void {
    if (config.budget) {
      this.budgetAmount = config.budget.amount;
      this.budgetUnit = config.budget.unit;
    }
    this.warnThresholds = [...config.budget_warn_thresholds].sort((a, b) => a - b);
  }

  /**
   * Find the highest threshold that the current percentage has reached.
   * Returns null if no threshold has been crossed.
   */
  private resolveCurrentThreshold(percentage: number): number | null {
    let highest: number | null = null;
    for (const threshold of this.warnThresholds) {
      if (percentage >= threshold) {
        highest = threshold;
      }
    }
    return highest;
  }
}
