/**
 * Page 3 — Historical & Trends.
 * Compares current session to historical averages and shows
 * recent session archive with trend lines.
 */
import React from 'react';
import { Box, Text } from 'ink';
import type { DashboardState } from '../../../types.js';
import { Table, TrendLine } from '../components/index.js';
import {
  formatNumber,
  formatDollars,
  formatPercent,
  formatDelta,
} from '../../mini/format.js';

export interface HistoricalProps {
  /** Aggregated dashboard state. */
  state: DashboardState;
}

/**
 * Historical & Trends page — Page 3 of the full TUI dashboard.
 *
 * Layout:
 *   Top:    CURRENT SESSION vs AVERAGES comparison table
 *   Middle: RECENT SESSIONS archive table
 *   Bottom: PROJECT HEALTH TRENDS trend lines
 */
export const Historical: React.FC<HistoricalProps> = ({ state }) => {
  const { metrics } = state;
  const { tokens, cache, cost, commands, agents } = metrics;

  // Current session vs averages comparison table
  // Averages column is a placeholder until historical store is wired into DashboardState.
  const comparisonHeaders = ['Metric', 'Current', 'Session Avg', 'Delta'];
  const comparisonRows: string[][] = [
    [
      'Total Tokens',
      formatNumber(tokens.total),
      '—',
      '—',
    ],
    [
      'Token Savings',
      formatNumber(tokens.saved),
      '—',
      '—',
    ],
    [
      'Cache Hit Rate',
      formatPercent(cache.hit_rate),
      '—',
      '—',
    ],
    [
      'Total Cost',
      formatDollars(cost.total),
      '—',
      '—',
    ],
    [
      'Cost Saved',
      formatDollars(cost.saved),
      '—',
      '—',
    ],
    [
      'Commands',
      formatNumber(commands.total),
      '—',
      '—',
    ],
    [
      'Success Rate',
      formatPercent(commands.success_rate),
      '—',
      '—',
    ],
    [
      'Agents Spawned',
      formatNumber(agents.spawned),
      '—',
      '—',
    ],
  ];

  // Health trend lines derived from current session data
  // These represent current-session point-in-time values.

  const costSavedRatio =
    cost.total + cost.saved > 0
      ? cost.saved / (cost.total + cost.saved)
      : 0;

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1} gap={1}>
      {/* Header */}
      <Text bold color="cyan">HISTORICAL &amp; TRENDS</Text>

      {/* Current session vs averages */}
      <Box flexDirection="column" gap={0}>
        <Text bold color="yellow">CURRENT SESSION vs AVERAGES</Text>
        <Table
          headers={comparisonHeaders}
          rows={comparisonRows}
          columnWidths={[18, 14, 14, 16]}
        />
      </Box>

      {/* Recent sessions placeholder — DashboardState does not include archive list.
          Once historical-store integration is added to DashboardState, render here. */}
      <Box flexDirection="column" gap={0}>
        <Text bold color="yellow">RECENT SESSIONS</Text>
        <Text dimColor>
          Historical session archive not yet available in live state.
          Run with --report flag or view .goodvibes/analytics/sessions/ for archived data.
        </Text>
      </Box>

      {/* Project health trends */}
      <Box flexDirection="column" gap={0}>
        <Text bold color="yellow">PROJECT HEALTH TRENDS</Text>
        <Box flexDirection="column" gap={0}>
          <TrendLine
            label="Token Efficiency"
            value={formatPercent(tokens.efficiency)}
            trend={formatDelta(tokens.efficiency, 0.5)}
            barValue={tokens.efficiency}
          />
          <TrendLine
            label="Cache Hit Rate"
            value={formatPercent(cache.hit_rate)}
            trend={formatDelta(cache.hit_rate, 0.7)}
            barValue={cache.hit_rate}
          />
          <TrendLine
            label="Command Success"
            value={formatPercent(commands.success_rate)}
            trend={formatDelta(commands.success_rate, 0.95)}
            barValue={commands.success_rate}
          />
          <TrendLine
            label="Cost Savings"
            value={formatPercent(costSavedRatio)}
            trend={formatDelta(costSavedRatio, 0.3)}
            barValue={costSavedRatio}
          />
        </Box>
      </Box>
    </Box>
  );
};
