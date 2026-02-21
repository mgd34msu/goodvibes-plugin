/**
 * Page 4 — Cross-Project Analytics.
 * Shows spend by project, session counts, trends over time, and
 * top sessions from the GlobalDB cross-project store.
 */
import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import type { GlobalDB } from '../../../data/global-db.js';
import type { DashboardState } from '../../../types.js';
import { MetricBox, Table, TrendLine, BarChart } from '../components/index.js';
import {
  formatNumber,
  formatDollars,
  formatPercent,
  truncate,
} from '../../mini/format.js';

export interface CrossProjectProps {
  /** Aggregated dashboard state for the current session. */
  state: DashboardState;
  /** GlobalDB instance for cross-project queries. May be null if DB is unavailable. */
  globalDb: GlobalDB | null;
}

/** Per-project aggregate derived from GlobalDB sessions. */
interface ProjectSummary {
  project_hash: string;
  project_path: string;
  session_count: number;
  total_cost_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_agent_spawns: number;
  latest_session_at: string;
}

/**
 * Derive project summaries from all GlobalDB sessions.
 * Groups by project_hash and aggregates cost, tokens, and session counts.
 */
function buildProjectSummaries(db: GlobalDB): ProjectSummary[] {
  try {
    const sessions = db.getAllSessions({ limit: 1000 });
    const map = new Map<string, ProjectSummary>();

    for (const s of sessions) {
      const hash = s.project_hash;
      const existing = map.get(hash);
      if (existing) {
        existing.session_count += 1;
        existing.total_cost_usd += s.total_cost_usd;
        existing.total_input_tokens += s.total_input_tokens;
        existing.total_output_tokens += s.total_output_tokens;
        existing.total_agent_spawns += s.total_agent_spawns;
        // Track the most recent session
        if (s.started_at > existing.latest_session_at) {
          existing.latest_session_at = s.started_at;
          if (s.project_path) existing.project_path = s.project_path;
        }
      } else {
        map.set(hash, {
          project_hash: hash,
          project_path: s.project_path ?? hash.slice(0, 16),
          session_count: 1,
          total_cost_usd: s.total_cost_usd,
          total_input_tokens: s.total_input_tokens,
          total_output_tokens: s.total_output_tokens,
          total_agent_spawns: s.total_agent_spawns,
          latest_session_at: s.started_at,
        });
      }
    }

    // Sort by total cost descending
    return Array.from(map.values()).sort(
      (a, b) => b.total_cost_usd - a.total_cost_usd,
    );
  } catch {
    return [];
  }
}

/** Format a short label from a full project path.
 *
 * Project paths stored in the DB look like `-home-buzzkill-Projects-goodvibes-plugin`
 * (hyphens replacing path separators). The meaningful part is the last segment.
 *
 * Strategy:
 *  1. If contains `-Projects-`, take everything after the last `-Projects-`.
 *  2. Else if contains `/`, take the last two slash-separated segments.
 *  3. Else split on `-`, drop empty leading parts, take the last segment.
 *  4. Remove any leading hyphens from the result.
 *  5. Truncate from the end with ellipsis if still too long.
 */
function shortPath(p: string, maxLen = 28): string {
  let name: string;

  // Case 1: Claude internal hyphenated path with -Projects- marker
  if (p.includes('-Projects-')) {
    const idx = p.lastIndexOf('-Projects-');
    name = p.slice(idx + '-Projects-'.length);
  } else if (p.includes('/')) {
    // Case 2: Real filesystem path
    const parts = p.replace(/\/$/, '').split('/');
    name = parts[parts.length - 1] || parts[parts.length - 2] || p;
  } else if (p.startsWith('-')) {
    // Case 3: Hyphenated path without -Projects- (e.g. `-home-buzzkill`)
    // Split on `-`, filter empties, take last meaningful segment
    const segments = p.split('-').filter(Boolean);
    name = segments[segments.length - 1] || p;
  } else {
    name = p;
  }

  // Strip any residual leading hyphens
  name = name.replace(/^-+/, '');
  if (!name) name = p;

  // Truncate from the end if too long
  if (name.length > maxLen) {
    return name.slice(0, maxLen - 1) + '\u2026';
  }
  return name;
}

/** Format an ISO date string to a short locale-aware date. */
function shortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-CA'); // YYYY-MM-DD
  } catch {
    return iso.slice(0, 10);
  }
}

/**
 * Cross-Project Analytics page — Page 4 of the full TUI dashboard.
 *
 * Layout:
 *   Top:    GLOBAL SUMMARY metric boxes
 *   Middle: SPEND BY PROJECT bar chart + project table
 *   Bottom: TOP RECENT SESSIONS table
 */
export const CrossProject: React.FC<CrossProjectProps> = ({ state, globalDb }) => {
  const projects = useMemo(
    () => (globalDb ? buildProjectSummaries(globalDb) : []),
    // state.session_id is used as a proxy for DB writes: each session change signals
    // that new data may have been persisted. A counter/timestamp would be more precise
    // but session_id is the closest signal available in DashboardState. Staleness can
    // occur if multiple sessions complete between renders, but this is an acceptable
    // trade-off given the read-only nature of this view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [globalDb, state.session_id],
  );

  // Global totals
  const totalCost = projects.reduce((s, p) => s + p.total_cost_usd, 0);
  const totalSessions = projects.reduce((s, p) => s + p.session_count, 0);
  const totalTokens = projects.reduce(
    (s, p) => s + p.total_input_tokens + p.total_output_tokens,
    0,
  );
  const totalAgents = projects.reduce((s, p) => s + p.total_agent_spawns, 0);
  const avgCostPerSession =
    totalSessions > 0 ? totalCost / totalSessions : 0;

  // Spend bar chart (top 10 projects)
  const topProjects = projects.slice(0, 10);
  const maxCost = topProjects[0]?.total_cost_usd ?? 1;
  const spendItems = topProjects.map((p) => ({
    label: shortPath(p.project_path),
    value: p.total_cost_usd,
    maxValue: Math.max(maxCost, 0.001),
    formatValue: formatDollars,
  }));

  // Project table (top 8)
  const projectTableHeaders = ['Project', 'Sessions', 'Cost', 'Tokens', 'Last Active'];
  const projectTableRows: string[][] = projects.slice(0, 8).map((p) => [
    shortPath(p.project_path),
    String(p.session_count),
    formatDollars(p.total_cost_usd),
    formatNumber(p.total_input_tokens + p.total_output_tokens),
    shortDate(p.latest_session_at),
  ]);

  // Recent sessions (top 10 from GlobalDB)
  const recentSessions = useMemo(() => {
    if (!globalDb) return [];
    try {
      return globalDb.getAllSessions({ limit: 10 });
    } catch {
      return [];
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalDb, state.session_id]);

  const sessionTableHeaders = ['Session ID', 'Project', 'Cost', 'Tokens', 'Date'];
  const sessionTableRows: string[][] = recentSessions.map((s) => [
    truncate(s.session_id, 16),
    shortPath(s.project_path ?? s.project_hash.slice(0, 12), 16),
    formatDollars(s.total_cost_usd),
    formatNumber(s.total_input_tokens + s.total_output_tokens),
    shortDate(s.started_at),
  ]);

  // Cost trend (session-over-session within current project)
  const currentProjectSessions = useMemo(() => {
    if (!globalDb || !state.session_id) return [];
    try {
      const current = globalDb.getSession(state.session_id);
      if (!current) return [];
      return globalDb.getSessionsByProject(current.project_hash).slice(0, 20);
    } catch {
      return [];
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalDb, state.session_id]);

  const avgProjectSessionCost =
    currentProjectSessions.length > 0
      ? currentProjectSessions.reduce((s, x) => s + x.total_cost_usd, 0) /
        currentProjectSessions.length
      : 0;
  const currentCost = state.metrics.cost.total;
  const costVsAvg =
    avgProjectSessionCost > 0 ? currentCost / avgProjectSessionCost : 0;

  if (!globalDb) {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1} gap={1}>
        <Text bold color="cyan">CROSS-PROJECT ANALYTICS</Text>
        <Text dimColor>
          Global analytics database not available.
          Start a session with the analytics-engine daemon to begin tracking cross-project data.
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1} gap={1}>
      {/* Header */}
      <Text bold color="cyan">CROSS-PROJECT ANALYTICS</Text>

      {/* Global summary metrics */}
      <Box gap={1} flexWrap="wrap">
        <MetricBox
          title="GLOBAL TOTALS"
          rows={[
            { label: 'Total Cost', value: formatDollars(totalCost) },
            { label: 'Sessions', value: formatNumber(totalSessions) },
            { label: 'Projects', value: formatNumber(projects.length) },
            { label: 'Avg/Session', value: formatDollars(avgCostPerSession) },
          ]}
        />
        <MetricBox
          title="TOKEN USAGE"
          rows={[
            { label: 'Total Tokens', value: formatNumber(totalTokens) },
            { label: 'Agents', value: formatNumber(totalAgents) },
            { label: 'This Session', value: formatDollars(currentCost) },
            { label: 'vs Avg', value: formatPercent(costVsAvg) },
          ]}
        />
      </Box>

      {/* Spend by project */}
      {spendItems.length > 0 && (
        <Box flexDirection="column" gap={0}>
          <Text bold color="yellow">SPEND BY PROJECT</Text>
          <BarChart items={spendItems} />
        </Box>
      )}

      {/* Project summary table */}
      {projectTableRows.length > 0 && (
        <Box flexDirection="column" gap={0}>
          <Text bold color="yellow">PROJECT BREAKDOWN</Text>
          <Table
            headers={projectTableHeaders}
            rows={projectTableRows}
            columnWidths={[30, 10, 10, 10, 12]}
          />
        </Box>
      )}

      {/* Recent sessions */}
      {sessionTableRows.length > 0 && (
        <Box flexDirection="column" gap={0}>
          <Text bold color="yellow">RECENT SESSIONS</Text>
          <Table
            headers={sessionTableHeaders}
            rows={sessionTableRows}
            columnWidths={[18, 18, 10, 10, 12]}
          />
        </Box>
      )}

      {/* Cost trend for current project */}
      {currentProjectSessions.length > 1 && (
        <Box flexDirection="column" gap={0}>
          <Text bold color="yellow">CURRENT PROJECT TREND</Text>
          <TrendLine
            label="Session Cost vs Avg"
            value={formatDollars(currentCost)}
            trend={
              costVsAvg >= 1.1
                ? `+${((costVsAvg - 1) * 100).toFixed(1)}% above avg`
                : costVsAvg <= 0.9
                  ? `-${((1 - costVsAvg) * 100).toFixed(1)}% below avg`
                  : '~at avg'
            }
            barValue={Math.min(1, costVsAvg)}
          />
        </Box>
      )}

      {projects.length === 0 && (
        <Text dimColor>
          No cross-project data yet. Sessions will appear here after they complete.
        </Text>
      )}
    </Box>
  );
};
