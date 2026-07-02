/**
 * analytics_budget handler — set, check, or clear a session budget.
 *
 * Delegates budget mutations to the Aggregator (which proxies through
 * BudgetTracker). All operations return formatted text confirming the
 * action and showing current usage where applicable.
 */

import type { AnalyticsBudgetInput } from '../schemas/tools.js';
import type { Aggregator } from '../daemon/aggregator.js';
import type { BudgetState } from '../types.js';
import {
  formatNumber,
  formatDollars,
  formatPercent,
  formatBar,
} from '../tui/mini/format.js';
import { type HandlerResponse, text } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Default warning thresholds used when setting a budget without explicit warn_at. */
const DEFAULT_WARN_THRESHOLDS = [0.5, 0.8, 1.0] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Handler function signature for analytics_budget. */
export type BudgetHandler = (
  aggregator: Aggregator,
  input: AnalyticsBudgetInput,
) => Promise<HandlerResponse>;

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle the `analytics_budget` MCP tool.
 *
 * Actions:
 *   - set   — configure a budget limit via aggregator.setBudget(), return
 *             confirmation with the budget details and current usage.
 *   - check — read current budget state from aggregator and render status.
 *   - clear — remove the active budget via aggregator.clearBudget().
 *
 * @param aggregator - Live Aggregator instance.
 * @param input      - Validated AnalyticsBudgetInput.
 * @returns MCP response with budget status text.
 */
export const handleBudget: BudgetHandler = async (
  aggregator: Aggregator,
  input: AnalyticsBudgetInput,
): Promise<HandlerResponse> => {
  try {
    switch (input.action) {
      case 'set':
        return handleSet(aggregator, input);
      case 'check':
        return handleCheck(aggregator);
      case 'clear':
        return handleClear(aggregator);
      default: {
        const _exhaustive: never = input.action;
        return text(`Unknown action: ${_exhaustive as string}`);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return text(`analytics_budget error: ${message}`);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Action handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Set a new budget and return confirmation with current usage.
 */
function handleSet(
  aggregator: Aggregator,
  input: AnalyticsBudgetInput,
): HandlerResponse {
  const amount = input.amount;
  if (amount === undefined) {
    return text('Budget amount is required for the set action.');
  }
  const unit = input.unit;

  aggregator.setBudget(amount, unit);

  // Give the aggregator a moment to refresh; getState() returns the snapshot
  // that was current before setBudget triggered a refresh. Since setBudget
  // fires refresh() asynchronously, we show the configured limit and the
  // pre-existing usage from the last known state.
  const state = aggregator.getState();
  const currentUsed =
    unit === 'dollars' ? state.metrics.cost.total : state.metrics.tokens.total;
  const remaining = Math.max(0, amount - currentUsed);
  const percentage = amount > 0 ? currentUsed / amount : 0;

  const lines: string[] = [
    'Budget set.',
    '',
    formatBudgetSummary({
      amount,
      unit,
      used: currentUsed,
      remaining,
      percentage,
      warn_thresholds: [...DEFAULT_WARN_THRESHOLDS],
      current_threshold: null,
    }),
  ];

  if (input.warn_at !== undefined && input.warn_at.length > 0) {
    lines.push(
      `\nWarn thresholds: ${input.warn_at.map((t) => formatPercent(t)).join(', ')}`,
    );
    lines.push(
      '(Note: warn_at thresholds are configured in analytics_config; budget was set using the default thresholds.)',
    );
  }

  return text(lines.join('\n'));
}

/**
 * Check and report the current budget status.
 */
function handleCheck(aggregator: Aggregator): HandlerResponse {
  const state = aggregator.getState();
  const budget = state.budget;

  if (budget === null) {
    const cost = state.metrics.cost.total;
    const tokens = state.metrics.tokens.total;
    return text(
      'No budget configured.\n\n' +
      'Current usage (no limit):\n' +
      `  Cost:   ${formatDollars(cost)}\n` +
      `  Tokens: ${formatNumber(tokens)}\n\n` +
      'Use analytics_budget with action="set" to configure a budget.',
    );
  }

  return text(formatBudgetSummary(budget));
}

/**
 * Clear the active budget and confirm.
 */
function handleClear(aggregator: Aggregator): HandlerResponse {
  const stateBefore = aggregator.getState();
  const b = stateBefore.budget;

  aggregator.clearBudget();

  if (b === null) {
    return text('No budget was configured.');
  }
  return text(
    `Budget cleared.\n\n` +
    `Previous budget: ${formatBudgetAmount(b.amount, b.unit)}\n` +
    `Usage at clear:  ${formatBudgetUsed(b.used, b.unit)} (${formatPercent(b.percentage)})`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a full budget status block, including a visual progress bar.
 */
function formatBudgetSummary(budget: BudgetState): string {
  const BAR_WIDTH = 20;
  const bar = formatBar(budget.used, budget.amount, BAR_WIDTH);
  const pct = formatPercent(budget.percentage);
  const statusLabel = resolveStatusLabel(budget.percentage);

  const lines: string[] = [
    '=== Budget Status ===',
    `Limit:     ${formatBudgetAmount(budget.amount, budget.unit)}`,
    `Used:      ${formatBudgetUsed(budget.used, budget.unit)} (${pct})`,
    `Remaining: ${formatBudgetUsed(budget.remaining, budget.unit)}`,
    `Status:    ${statusLabel}`,
    `Progress:  [${bar}]`,
  ];

  if (budget.warn_thresholds.length > 0) {
    lines.push(
      `Thresholds: ${budget.warn_thresholds.map((t) => formatPercent(t)).join(' | ')}`,
    );
  }

  if (budget.current_threshold !== null) {
    lines.push(
      `Reached threshold: ${formatPercent(budget.current_threshold)}`,
    );
  }

  return lines.join('\n');
}

/**
 * Format a budget limit value with its unit label.
 */
function formatBudgetAmount(amount: number, unit: BudgetState['unit']): string {
  return unit === 'dollars'
    ? formatDollars(amount)
    : `${formatNumber(amount)} tokens`;
}

/**
 * Format a usage value with its unit label.
 */
function formatBudgetUsed(used: number, unit: BudgetState['unit']): string {
  return unit === 'dollars'
    ? formatDollars(used)
    : `${formatNumber(used)} tokens`;
}

/**
 * Derive a human-readable status label from the usage percentage.
 */
function resolveStatusLabel(ratio: number): string {
  if (ratio >= DEFAULT_WARN_THRESHOLDS[2]) return 'exceeded';
  if (ratio >= DEFAULT_WARN_THRESHOLDS[1]) return 'warning';
  if (ratio >= DEFAULT_WARN_THRESHOLDS[0]) return 'on-track';
  return 'under';
}


