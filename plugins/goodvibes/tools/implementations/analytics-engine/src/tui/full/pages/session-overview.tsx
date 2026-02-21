/**
 * Page 1 — Session Overview.
 * Displays current session metrics, token/cost/cache breakdown,
 * API token details from JSONL data, tags, and a tools-usage bar chart.
 */
import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import type { DashboardState } from '../../../types.js';
import type { GlobalDB } from '../../../data/global-db.js';
import { MetricBox, BarChart } from '../components/index.js';
import {
  formatNumber,
  formatDollars,
  formatPercent,
  formatDuration,
  formatUptime,
  formatTime,
  truncate,
} from '../../mini/format.js';

export interface SessionOverviewProps {
  /** Aggregated dashboard state. */
  state: DashboardState;
  /** GlobalDB for tag resolution. Null when DB is unavailable. */
  globalDb: GlobalDB | null;
}

/**
 * Session Overview page — Page 1 of the full TUI dashboard.
 *
 * Layout:
 *   Row 1: TOKENS | CACHE | COST
 *   Row 2: API USAGE | COMMANDS | AGENTS | FILES
 *   Row 3: TAGS (if available)
 *   Row 4: TOOLS BREAKDOWN (full-width bar chart)
 */
export const SessionOverview: React.FC<SessionOverviewProps> = ({ state, globalDb }) => {
  const { metrics, tools_breakdown, session_id, started_at, uptime_ms } = state;
  const { tokens, cache, cost, commands, agents, files } = metrics;

  // Fetch tags for the current session from GlobalDB
  const tags = useMemo(() => {
    if (!globalDb || !session_id) return [];
    try {
      const entries = globalDb.getTagsForSession(session_id);
      return entries.map((e) => e.tag);
    } catch {
      return [];
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalDb, session_id]);

  // Build tools bar-chart items sorted by call count descending
  const toolItems = Object.entries(tools_breakdown)
    .map(([name, tb]) => ({
      label: truncate(name.replace(/^mcp__plugin_goodvibes_/, '').replace(/__/g, '.'), 32),
      value: tb.calls,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);

  const maxToolCalls = toolItems.reduce((m, i) => Math.max(m, i.value), 0);

  // Use aggregator-computed cost (respects config pricing and JSONL cost_usd).
  const apiTotalCost = cost.total;

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1} gap={1}>
      {/* Session header */}
      <Box gap={3}>
        <Text bold color="cyan">SESSION OVERVIEW</Text>
        <Text dimColor>ID: {truncate(session_id, 24)}</Text>
        <Text dimColor>Started: {formatTime(started_at)}</Text>
        <Text dimColor>Up: {formatUptime(uptime_ms)}</Text>
      </Box>

      {/* Tags row */}
      {tags.length > 0 && (
        <Box gap={1}>
          <Text dimColor>Tags:</Text>
          {tags.map((tag) => (
            <Text key={tag} color="cyan">[{tag}]</Text>
          ))}
        </Box>
      )}

      {/* Metric boxes — row 1: tokens / cache / cost */}
      <Box gap={1} flexWrap="wrap">
        <MetricBox
          title="PRECISION TOKENS"
          rows={[
            { label: 'Total', value: formatNumber(tokens.total) },
            { label: 'Input', value: formatNumber(tokens.input) },
            { label: 'Output', value: formatNumber(tokens.output) },
            { label: 'Saved', value: formatNumber(tokens.saved) },
            { label: 'Efficiency', value: formatPercent(tokens.efficiency) },
          ]}
        />

        <MetricBox
          title="CACHE"
          rows={[
            { label: 'Hit Rate', value: formatPercent(cache.hit_rate) },
            { label: 'Hits', value: formatNumber(cache.hits) },
            { label: 'Misses', value: formatNumber(cache.misses) },
            { label: 'Peak MB', value: `${cache.memory_peak_mb.toFixed(1)} MB` },
            { label: 'Evictions', value: formatNumber(cache.evictions) },
          ]}
        />

        <MetricBox
          title="SESSION COST"
          rows={[
            { label: 'Total', value: formatDollars(cost.total) },
            { label: 'Input', value: formatDollars(cost.input) },
            { label: 'Output', value: formatDollars(cost.output) },
            { label: 'Saved', value: formatDollars(cost.saved) },
          ]}
        />
      </Box>

      {/* Metric boxes — row 2: API usage / commands / agents / files */}
      <Box gap={1} flexWrap="wrap">
        <MetricBox
          title="API TOKENS (JSONL)"
          rows={[
            { label: 'Input', value: formatNumber(tokens.api_input) },
            { label: 'Output', value: formatNumber(tokens.api_output) },
            { label: 'Cache Read', value: formatNumber(tokens.cache_read) },
            { label: 'Cache Write', value: formatNumber(tokens.cache_write) },
            { label: 'API Cost', value: formatDollars(apiTotalCost) },
          ]}
        />

        <MetricBox
          title="COMMANDS"
          rows={[
            { label: 'Total', value: formatNumber(commands.total) },
            { label: 'Failures', value: formatNumber(commands.failures) },
            { label: 'Success', value: formatPercent(commands.success_rate) },
            { label: 'Avg ms', value: formatDuration(commands.avg_duration_ms) },
          ]}
        />

        <MetricBox
          title="AGENTS"
          rows={[
            { label: 'Spawned', value: formatNumber(agents.spawned) },
            { label: 'Active', value: formatNumber(agents.active) },
            { label: 'Done', value: formatNumber(agents.completed) },
            { label: 'Max Conc', value: formatNumber(agents.max_concurrent) },
          ]}
        />

        <MetricBox
          title="FILES"
          rows={[
            { label: 'Read', value: formatNumber(files.unique_read) },
            { label: 'Modified', value: formatNumber(files.modified) },
            { label: 'Created', value: formatNumber(files.created) },
            { label: 'Conflicts', value: formatNumber(files.conflicts) },
          ]}
        />
      </Box>

      {/* Tools breakdown bar chart */}
      {toolItems.length > 0 && (
        <Box flexDirection="column" gap={0}>
          <Text bold color="yellow">TOOLS BREAKDOWN</Text>
          <BarChart
            items={toolItems.map((i) => ({
              label: i.label,
              value: i.value,
              maxValue: maxToolCalls,
              suffix: 'calls',
            }))}
          />
        </Box>
      )}
    </Box>
  );
};
