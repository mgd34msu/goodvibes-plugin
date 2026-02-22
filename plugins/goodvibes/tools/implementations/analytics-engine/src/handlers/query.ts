/**
 * analytics_query handler — ad-hoc queries against live session data.
 *
 * Queries the Aggregator's current DashboardState and returns formatted
 * results. Supports scoped queries (tokens, cache, commands, agents, files,
 * cost, health, project, all), time ranges, grouping, filters, and
 * cross-project data_scope for GlobalDB-backed aggregation.
 */

import type { AnalyticsQueryInput } from '../schemas/tools.js';
import type { Aggregator } from '../daemon/aggregator.js';
import type { DashboardState, ActivityEvent, ToolBreakdown } from '../types.js';
import {
  formatNumber,
  formatDollars,
  formatPercent,
  formatDuration,
  formatUptime,
} from '../tui/mini/format.js';
import { type HandlerResponse, text } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Handler function signature for analytics_query. */
export type QueryHandler = (
  aggregator: Aggregator,
  input: AnalyticsQueryInput,
) => Promise<HandlerResponse>;

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle the `analytics_query` MCP tool.
 *
 * When data_scope is 'current_session' (default), queries the live Aggregator
 * DashboardState. For other data_scope values (current_project, all_projects,
 * tagged), prepends a cross-project summary sourced from the GlobalDB before
 * the live session data.
 *
 * @param aggregator - Live Aggregator instance.
 * @param input      - Validated AnalyticsQueryInput.
 * @returns MCP response containing the query result.
 */
export const handleQuery: QueryHandler = async (
  aggregator: Aggregator,
  input: AnalyticsQueryInput,
): Promise<HandlerResponse> => {
  try {
    const state = aggregator.getState();

    // Apply time range filter to recent_activity; metrics are always session-wide.
    const filteredActivity = filterByTimeRange(state.recent_activity, input.time_range);

    // Apply tool/status/agent/tags filters
    const activity = applyActivityFilters(filteredActivity, input.filters);

    // Filter tools breakdown by tool name if a filter is specified
    const toolsBreakdown = filterToolsBreakdown(
      state.tools_breakdown,
      input.filters?.tool,
    );

    const sessionResult = buildResponse(state, activity, toolsBreakdown, input);

    // If cross-project scope is requested, prepend a GlobalDB summary
    if (input.data_scope && input.data_scope !== 'current_session') {
      const scopeNote = buildDataScopeNote(aggregator, input);
      if (scopeNote) {
        return text(`${scopeNote}\n\n--- Current Session ---\n${sessionResult}`);
      }
    }

    return text(sessionResult);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return text(`analytics_query error: ${message}`);
  }
};

/**
 * Build a cross-project summary note using the GlobalDB when data_scope
 * is broader than the current session.
 *
 * Returns null if the GlobalDB is unavailable or the scope adds no extra data.
 */
function buildDataScopeNote(
  aggregator: Aggregator,
  input: AnalyticsQueryInput,
): string | null {
  try {
    const db = aggregator.getGlobalDb();
    if (!db) return null;

    const tags = input.filters?.tags ?? [];
    const lines: string[] = [];

    if (input.data_scope === 'all_projects') {
      const sessions = db.getAllSessions();
      const totalCost = db.getTotalCostAllProjects();
      lines.push(
        '=== Cross-Project Summary (GlobalDB) ===',
        `Sessions: ${sessions.length}`,
        `Total cost (all projects): ${formatDollars(totalCost)}`,
      );
    } else if (input.data_scope === 'tagged' && tags.length > 0) {
      const sessions = db.getSessionsByTags(tags);
      lines.push(
        `=== Tagged Sessions (${tags.join(', ')}) ===`,
        `Sessions matching tags: ${sessions.length}`,
      );
    } else if (input.data_scope === 'current_project') {
      const state = aggregator.getState();
      const projectHash = deriveProjectHash(db, state.session_id);
      if (projectHash) {
        const sessions = db.getSessionsByProject(projectHash);
        lines.push(
          '=== Current Project (GlobalDB) ===',
          `Sessions for this project: ${sessions.length}`,
        );
      }
    }

    return lines.length > 0 ? lines.join('\n') : null;
  } catch {
    return null;
  }
}

/**
 * Derive a project hash from the session ID by looking it up in the GlobalDB.
 *
 * Claude project hashes are derived from the project directory path and stored
 * on session records in the global DB. We look up the session to find the hash.
 * Falls back to null if the session is not found or the DB is unavailable.
 *
 * @param db        - The GlobalDB instance to query.
 * @param sessionId - The current session ID to look up.
 * @returns The project_hash string, or null if not found.
 */
function deriveProjectHash(db: import('../data/global-db.js').GlobalDB, sessionId: string): string | null {
  try {
    const session = db.getSession(sessionId);
    return session?.project_hash ?? null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Time range filtering
// ─────────────────────────────────────────────────────────────────────────────

/** Duration in milliseconds for each named time range. */
const TIME_RANGE_MS: Record<Exclude<AnalyticsQueryInput['time_range'], 'session'>, number> = {
  last_5m: 5 * 60 * 1_000,
  last_30m: 30 * 60 * 1_000,
  last_1h: 60 * 60 * 1_000,
};

/**
 * Filter activity events to those within the specified time range.
 * 'session' returns all events unfiltered.
 */
function filterByTimeRange(
  events: ActivityEvent[],
  timeRange: AnalyticsQueryInput['time_range'],
): ActivityEvent[] {
  if (timeRange === 'session') return events;
  const cutoffMs = TIME_RANGE_MS[timeRange];
  const cutoff = Date.now() - cutoffMs;
  return events.filter((e) => {
    const ts = new Date(e.timestamp).getTime();
    return Number.isFinite(ts) && ts >= cutoff;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Filters
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply tool, status, and agent filters to activity events.
 */
function applyActivityFilters(
  events: ActivityEvent[],
  filters: AnalyticsQueryInput['filters'],
): ActivityEvent[] {
  if (!filters) return events;
  return events.filter((e) => {
    if (filters.tool && e.tool !== filters.tool) return false;
    if (filters.status) {
      const status = typeof e.details['status'] === 'string' ? e.details['status'] : undefined;
      if (status !== filters.status) return false;
    }
    if (filters.agent && e.agent_id !== filters.agent) return false;
    return true;
  });
}

/**
 * Filter the tools breakdown map by an optional tool name prefix/exact match.
 */
function filterToolsBreakdown(
  breakdown: Record<string, ToolBreakdown>,
  toolFilter: string | undefined,
): Record<string, ToolBreakdown> {
  if (!toolFilter) return breakdown;
  const result: Record<string, ToolBreakdown> = {};
  for (const [key, value] of Object.entries(breakdown)) {
    if (key === toolFilter || key.startsWith(toolFilter)) {
      result[key] = value;
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Response building
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the full response string by delegating to scope renderers.
 */
function buildResponse(
  state: DashboardState,
  activity: ActivityEvent[],
  toolsBreakdown: Record<string, ToolBreakdown>,
  input: AnalyticsQueryInput,
): string {
  const { scope, format, group_by } = input;

  const header = buildHeader(state, input);
  const body = buildBody(state, activity, toolsBreakdown, scope, format, group_by);

  if (format === 'minimal') {
    return body;
  }
  return [header, body].filter(Boolean).join('\n\n');
}

/**
 * Build a header line summarising the query parameters.
 */
function buildHeader(state: DashboardState, input: AnalyticsQueryInput): string {
  const rangeLabel: Record<AnalyticsQueryInput['time_range'], string> = {
    session: 'full session',
    last_5m: 'last 5 minutes',
    last_30m: 'last 30 minutes',
    last_1h: 'last 1 hour',
  };
  return (
    `Session: ${state.session_id} | ` +
    `Uptime: ${formatUptime(state.uptime_ms)} | ` +
    `Range: ${rangeLabel[input.time_range]} | ` +
    `Health: ${state.health_status}`
  );
}

/**
 * Build the body section(s) for the requested scope.
 */
function buildBody(
  state: DashboardState,
  activity: ActivityEvent[],
  toolsBreakdown: Record<string, ToolBreakdown>,
  scope: AnalyticsQueryInput['scope'],
  format: AnalyticsQueryInput['format'],
  group_by: AnalyticsQueryInput['group_by'],
): string {
  if (scope === 'all') {
    const sections: string[] = [
      renderTokens(state, format),
      renderCache(state, format),
      renderCost(state, format),
      renderCommands(state, format),
      renderAgents(state, format),
      renderFiles(state, format),
      renderHealth(state, format),
      renderProject(state, format),
    ];
    if (format === 'verbose') {
      sections.push(renderToolsBreakdown(toolsBreakdown, group_by));
      sections.push(renderActivity(activity));
    }
    return sections.filter(Boolean).join('\n\n');
  }

  switch (scope) {
    case 'tokens':   return renderTokens(state, format);
    case 'cache':    return renderCache(state, format);
    case 'cost':     return renderCost(state, format);
    case 'commands': return renderCommands(state, format);
    case 'agents':   return renderAgents(state, format);
    case 'files':    return renderFiles(state, format);
    case 'health':   return renderHealth(state, format);
    case 'project':  return renderProject(state, format);
    default: {
      const _exhaustive: never = scope;
      return `Unknown scope: ${_exhaustive as string}`;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scope renderers
// ─────────────────────────────────────────────────────────────────────────────

/** Render token usage metrics. */
function renderTokens(state: DashboardState, format: AnalyticsQueryInput['format']): string {
  const { tokens } = state.metrics;
  if (format === 'minimal') {
    return `precision-tokens: in=${formatNumber(tokens.input)} out=${formatNumber(tokens.output)} saved=${formatNumber(tokens.saved)} eff=${formatPercent(tokens.efficiency)} | api: in=${formatNumber(tokens.api_input)} out=${formatNumber(tokens.api_output)} cache-read=${formatNumber(tokens.cache_read)}`;
  }
  const lines = [
    '=== Precision Token Metrics ===',
    `Input:      ${formatNumber(tokens.input)}`,
    `Output:     ${formatNumber(tokens.output)}`,
    `Total:      ${formatNumber(tokens.total)}`,
    `Saved:      ${formatNumber(tokens.saved)}`,
    `Efficiency: ${formatPercent(tokens.efficiency)}`,
    '',
    '--- API Token Usage ---',
    `API Input:   ${formatNumber(tokens.api_input)}`,
    `API Output:  ${formatNumber(tokens.api_output)}`,
    `Cache Read:  ${formatNumber(tokens.cache_read)}`,
    `Cache Write: ${formatNumber(tokens.cache_write)}`,
  ];
  if (format === 'verbose') {
    lines.push(`Raw input:  ${tokens.input}`);
    lines.push(`Raw output: ${tokens.output}`);
    lines.push(`Raw saved:  ${tokens.saved}`);
  }
  return lines.join('\n');
}

/** Render cache hit/miss metrics. */
function renderCache(state: DashboardState, format: AnalyticsQueryInput['format']): string {
  const { cache } = state.metrics;
  if (format === 'minimal') {
    return `precision-cache: hit_rate=${formatPercent(cache.hit_rate)} hits=${formatNumber(cache.hits)} misses=${formatNumber(cache.misses)}`;
  }
  const lines = [
    '=== Precision Cache ===',
    `Hit rate: ${formatPercent(cache.hit_rate)}`,
    `Hits:     ${formatNumber(cache.hits)}`,
    `Misses:   ${formatNumber(cache.misses)}`,
  ];
  if (format === 'verbose') {
    lines.push(`Memory peak: ${cache.memory_peak_mb} MB`);
    lines.push(`Evictions:   ${cache.evictions}`);
  }
  return lines.join('\n');
}

/** Render cost metrics in dollars. */
function renderCost(state: DashboardState, format: AnalyticsQueryInput['format']): string {
  const { cost } = state.metrics;
  if (format === 'minimal') {
    return `cost: total=${formatDollars(cost.total)} saved=${formatDollars(cost.saved)}`;
  }
  const lines = [
    '=== Cost ===',
    `Input:  ${formatDollars(cost.input)}`,
    `Output: ${formatDollars(cost.output)}`,
    `Total:  ${formatDollars(cost.total)}`,
    `Saved:  ${formatDollars(cost.saved)}`,
  ];
  return lines.join('\n');
}

/** Render tool execution metrics. */
function renderCommands(state: DashboardState, format: AnalyticsQueryInput['format']): string {
  const { tools } = state.metrics;
  if (format === 'minimal') {
    return `tools: total=${tools.total} success=${formatPercent(tools.success_rate)} failures=${tools.failures}`;
  }
  const lines = [
    '=== Tools ===',
    `Total:       ${tools.total}`,
    `Success rate: ${formatPercent(tools.success_rate)}`,
    `Failures:    ${tools.failures}`,
    `Avg duration: ${formatDuration(tools.avg_duration_ms)}`,
  ];
  if (format === 'verbose' && tools.slowest !== null) {
    lines.push(`Slowest: ${tools.slowest.tool} (${formatDuration(tools.slowest.duration_ms)})`);
  }
  return lines.join('\n');
}

/** Render agent spawning and concurrency metrics. */
function renderAgents(state: DashboardState, format: AnalyticsQueryInput['format']): string {
  const { agents } = state.metrics;
  if (format === 'minimal') {
    return `agents: spawned=${agents.spawned} active=${agents.active} completed=${agents.completed}`;
  }
  const lines = [
    '=== Agents ===',
    `Spawned:        ${agents.spawned}`,
    `Active:         ${agents.active}`,
    `Completed:      ${agents.completed}`,
    `Max concurrent: ${agents.max_concurrent}`,
  ];
  if (format === 'verbose') {
    lines.push(`Total tokens: ${formatNumber(agents.total_tokens)}`);
    if (state.agent_profiles.length > 0) {
      lines.push('');
      lines.push('Agent profiles:');
      for (const p of state.agent_profiles) {
        lines.push(
          `  ${p.agent_id} (${p.agent_type}): ` +
          `${formatNumber(p.tokens_in + p.tokens_out)} tokens | ` +
          `${p.tool_calls} calls | ` +
          `${formatPercent(p.success_rate)} success | ` +
          `${p.status}`,
        );
      }
    }
  }
  return lines.join('\n');
}

/** Render file read/write/conflict metrics. */
function renderFiles(state: DashboardState, format: AnalyticsQueryInput['format']): string {
  const { files } = state.metrics;
  if (format === 'minimal') {
    return `files: read=${files.unique_read} modified=${files.modified} created=${files.created} conflicts=${files.conflicts}`;
  }
  const lines = [
    '=== Files ===',
    `Unique read: ${files.unique_read}`,
    `Modified:    ${files.modified}`,
    `Created:     ${files.created}`,
    `Conflicts:   ${files.conflicts}`,
  ];
  if (format === 'verbose' && state.file_hotspots.length > 0) {
    lines.push('');
    lines.push('Hotspots:');
    for (const h of state.file_hotspots.slice(0, 10)) {
      lines.push(`  ${h.path}: r=${h.reads} w=${h.writes} c=${h.conflicts}`);
    }
  }
  return lines.join('\n');
}

/** Render session health status and anomaly list. */
function renderHealth(state: DashboardState, format: AnalyticsQueryInput['format']): string {
  const { health_status, anomalies } = state;
  if (format === 'minimal') {
    return `health: ${health_status} anomalies=${anomalies.length}`;
  }
  const statusEmoji = health_status === 'healthy' ? 'OK' : health_status === 'warning' ? 'WARN' : 'ALERT';
  const lines = [
    '=== Health ===',
    `Status:   ${statusEmoji} (${health_status})`,
    `Anomalies: ${anomalies.length}`,
  ];
  if (format === 'verbose' && anomalies.length > 0) {
    lines.push('');
    for (const a of anomalies) {
      lines.push(`  [${a.severity.toUpperCase()}] ${a.type}: ${a.message} (${a.timestamp})`);
    }
  } else if (format === 'standard' && anomalies.length > 0) {
    lines.push('');
    for (const a of anomalies.slice(0, 5)) {
      lines.push(`  [${a.severity}] ${a.type}: ${a.message}`);
    }
  }
  return lines.join('\n');
}

/** Render project session identity and uptime. */
function renderProject(state: DashboardState, format: AnalyticsQueryInput['format']): string {
  if (format === 'minimal') {
    return `project: session=${state.session_id} uptime=${formatUptime(state.uptime_ms)}`;
  }
  const lines = [
    '=== Project ===',
    `Session ID: ${state.session_id}`,
    `Started at: ${state.started_at}`,
    `Uptime:     ${formatUptime(state.uptime_ms)}`,
  ];
  return lines.join('\n');
}

/**
 * Render the tools breakdown table, optionally grouped by a dimension.
 * Currently supported group_by dimensions that apply to tool breakdown: 'tool'.
 * Other group_by dimensions (agent, file, status) apply to activity events.
 */
function renderToolsBreakdown(
  breakdown: Record<string, ToolBreakdown>,
  group_by: AnalyticsQueryInput['group_by'],
): string {
  const entries = Object.entries(breakdown);
  if (entries.length === 0) return '=== Tools Breakdown ===\n  (no data yet)';

  const lines = ['=== Tools Breakdown ==='];

  if (group_by === 'tool' || !group_by) {
    // Sort by call count descending
    const sorted = [...entries].sort(([, a], [, b]) => b.calls - a.calls);
    for (const [tool, bd] of sorted) {
      lines.push(
        `  ${tool.padEnd(20)} ` +
        `calls=${String(bd.calls).padStart(5)} ` +
        `avg=${formatDuration(bd.avg_ms).padStart(7)} ` +
        `success=${formatPercent(bd.success_rate)} ` +
        `in=${formatNumber(bd.tokens_in)} ` +
        `out=${formatNumber(bd.tokens_out)}` +
        (bd.cache_hit_rate !== undefined ? ` cache=${formatPercent(bd.cache_hit_rate)}` : ''),
      );
    }
  } else {
    // For non-tool group_by, just list the tools without grouping
    // (agent/file/status grouping requires per-record data, not available in breakdown)
    lines.push(`  (group_by='${group_by}' requires activity-level data; showing tool summary)`);
    for (const [tool, bd] of entries) {
      lines.push(`  ${tool}: ${bd.calls} calls`);
    }
  }

  return lines.join('\n');
}

/**
 * Render recent activity events.
 */
function renderActivity(
  activity: ActivityEvent[],
): string {
  if (activity.length === 0) return '=== Recent Activity ===\n  (no events in range)';
  const lines = [`=== Recent Activity (${activity.length} events) ===`];
  for (const e of activity.slice(0, 20)) {
    const duration = e.duration_ms !== undefined ? ` ${formatDuration(e.duration_ms)}` : '';
    const cache = e.cache_hit === true ? ' [cache]' : '';
    const tokens = e.tokens !== undefined ? ` ${formatNumber(e.tokens)}t` : '';
    lines.push(`  ${e.timestamp} ${e.tool}${duration}${cache}${tokens} — ${e.description}`);
  }
  if (activity.length > 20) {
    lines.push(`  ... and ${activity.length - 20} more`);
  }
  return lines.join('\n');
}
