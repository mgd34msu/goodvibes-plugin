/**
 * Page 3 — Historical & Trends.
 * Compares current session to historical averages from GlobalDB.
 * Shows recent session archive with trend lines.
 */
import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import type { DashboardState } from '../../../types.js';
import type { GlobalDB } from '../../../data/global-db.js';
import type { GlobalSession } from '../../../types.js';
import { Table, TrendLine } from '../components/index.js';
import {
  formatNumber,
  formatDollars,
  formatPercent,
  formatDelta,
  truncate,
} from '../../mini/format.js';

export interface HistoricalProps {
  /** Aggregated dashboard state. */
  state: DashboardState;
  /** GlobalDB for historical session data. Null when DB is unavailable. */
  globalDb: GlobalDB | null;
}

/** Format an ISO date string to a short YYYY-MM-DD date. */
function shortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-CA');
  } catch {
    return iso.slice(0, 10);
  }
}

/** Compute the average cost_usd of an array of sessions. */
function avgCost(sessions: GlobalSession[]): number {
  if (sessions.length === 0) return 0;
  return (
    sessions.reduce((s, x) => s + x.total_cost_usd, 0) / sessions.length
  );
}

/** Compute the average input+output tokens of an array of sessions. */
function avgTokens(sessions: GlobalSession[]): number {
  if (sessions.length === 0) return 0;
  return (
    sessions.reduce(
      (s, x) => s + x.total_input_tokens + x.total_output_tokens,
      0,
    ) / sessions.length
  );
}

/**
 * Compute the average cache hit rate (cache_read_tokens / input_tokens) across sessions.
 * Sessions with zero input tokens are excluded.
 */
function avgCacheHitRate(sessions: GlobalSession[]): number {
  const valid = sessions.filter((s) => s.total_input_tokens > 0);
  if (valid.length === 0) return 0;
  return (
    valid.reduce(
      (sum, s) => sum + s.total_cache_read_tokens / s.total_input_tokens,
      0,
    ) / valid.length
  );
}

/**
 * Historical & Trends page — Page 3 of the full TUI dashboard.
 *
 * Layout:
 *   Top:    CURRENT SESSION vs AVERAGES comparison table (GlobalDB-sourced when available)
 *   Middle: RECENT SESSIONS archive table
 *   Bottom: PROJECT HEALTH TRENDS trend lines
 */
export const Historical: React.FC<HistoricalProps> = ({ state, globalDb }) => {
  const { metrics } = state;
  const { tokens, cache, cost, commands, agents } = metrics;

  // Pull project sessions from GlobalDB for comparison
  const projectSessions = useMemo(() => {
    if (!globalDb || !state.session_id) return [];
    try {
      const current = globalDb.getSession(state.session_id);
      if (!current) return [];
      // Fetch up to 50 completed/archived sessions for this project
      return globalDb
        .getSessionsByProject(current.project_hash)
        .filter((s) => s.session_id !== state.session_id)
        .slice(0, 50);
    } catch {
      return [];
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalDb, state.session_id]);

  // Pull recent sessions (across all projects) for the archive table
  const recentSessions = useMemo(() => {
    if (!globalDb) return [];
    try {
      return globalDb.getAllSessions({ limit: 8 });
    } catch {
      return [];
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalDb, state.session_id]);

  const hasHistory = projectSessions.length > 0;
  const sessionAvgCost = avgCost(projectSessions);
  const sessionAvgTokens = avgTokens(projectSessions);
  const histAvgCacheHitRate = avgCacheHitRate(projectSessions);
  // Precision tokens (input+output from precision tool tracking)
  const currentTotalTokens = tokens.input + tokens.output;

  // Current session vs averages comparison table
  const comparisonHeaders = ['Metric', 'Current', 'Proj Avg', 'Delta'];
  const comparisonRows: string[][] = [
    [
      'Precision Tokens',
      formatNumber(currentTotalTokens),
      hasHistory ? formatNumber(sessionAvgTokens) : '—',
      hasHistory && sessionAvgTokens > 0
        ? formatDelta(currentTotalTokens / sessionAvgTokens - 1, 0)
        : '—',
    ],
    [
      'API Input Tok',
      formatNumber(tokens.api_input),
      '—',
      '—',
    ],
    [
      'API Output Tok',
      formatNumber(tokens.api_output),
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
      hasHistory ? formatDollars(sessionAvgCost) : '—',
      hasHistory && sessionAvgCost > 0
        ? formatDelta(cost.total / sessionAvgCost - 1, 0)
        : '—',
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

  // Recent sessions table
  const sessionHeaders = ['Session ID', 'Project', 'Cost', 'Tokens', 'Date'];
  const sessionRows: string[][] = recentSessions.map((s) => [
    truncate(s.session_id, 16),
    truncate(s.project_path ?? s.project_hash.slice(0, 12), 14),
    formatDollars(s.total_cost_usd),
    formatNumber(s.total_input_tokens + s.total_output_tokens),
    shortDate(s.started_at),
  ]);

  // Health trend lines derived from current session data
  const costSavedRatio =
    cost.total + cost.saved > 0
      ? cost.saved / (cost.total + cost.saved)
      : 0;

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1} gap={1}>
      {/* Header */}
      <Text bold color="cyan">HISTORICAL & TRENDS</Text>
      {hasHistory && (
        <Text dimColor>
          Comparing against {projectSessions.length} previous session
          {projectSessions.length !== 1 ? 's' : ''} in this project.
        </Text>
      )}

      {/* Current session vs averages */}
      <Box flexDirection="column" gap={0}>
        <Text bold color="yellow">CURRENT SESSION vs AVERAGES</Text>
        <Table
          headers={comparisonHeaders}
          rows={comparisonRows}
          columnWidths={[18, 14, 14, 16]}
        />
      </Box>

      {/* Recent sessions — from GlobalDB when available */}
      <Box flexDirection="column" gap={0}>
        <Text bold color="yellow">RECENT SESSIONS</Text>
        {sessionRows.length > 0 ? (
          <Table
            headers={sessionHeaders}
            rows={sessionRows}
            columnWidths={[18, 16, 10, 10, 12]}
          />
        ) : (
          <Text dimColor>
            No historical sessions found in global DB.
            Sessions are recorded as they complete.
          </Text>
        )}
      </Box>

      {/* Project health trends */}
      <Box flexDirection="column" gap={0}>
        <Text bold color="yellow">PROJECT HEALTH TRENDS</Text>
        <Box flexDirection="column" gap={0}>
          <TrendLine
            label="Token Efficiency"
            value={formatPercent(tokens.efficiency)}
            trend={'\u2014'}
            barValue={tokens.efficiency}
            higherIsBetter
          />
          <TrendLine
            label="Cache Hit Rate"
            value={formatPercent(cache.hit_rate)}
            trend={hasHistory ? formatDelta(cache.hit_rate, histAvgCacheHitRate) : '\u2014'}
            barValue={cache.hit_rate}
            higherIsBetter
          />
          <TrendLine
            label="Command Success"
            value={formatPercent(commands.success_rate)}
            trend="\u2014"
            barValue={commands.success_rate}
            higherIsBetter
          />
          <TrendLine
            label="Cost Savings"
            value={formatPercent(costSavedRatio)}
            trend="\u2014"
            barValue={costSavedRatio}
            higherIsBetter
          />
        </Box>
      </Box>
    </Box>
  );
};
