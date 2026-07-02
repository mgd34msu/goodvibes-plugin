import { z } from 'zod';

// === Input Schemas ===

export const AnalyticsDashboardInput = z.object({
  action: z.enum(['start', 'stop', 'status', 'doctor']),
  /**
   * Target dashboard to operate on.
   * 'dashboard' is the current name for the full TUI pane; 'full' is accepted
   * as a backward-compatible alias.
   */
  target: z.enum(['mini', 'full', 'dashboard', 'both']).default('both'),
  options: z
    .object({
      pane_position: z.enum(['bottom', 'top', 'left', 'right']).optional(),
      pane_size: z.union([z.number(), z.string()]).optional(),
    })
    .optional(),
});

export const AnalyticsQueryInput = z.object({
  /**
   * The data domain to query within the current session. Defaults to 'all'.
   * Ignored when an observability `mode` is set.
   */
  scope: z.enum(['tokens', 'cache', 'commands', 'agents', 'files', 'cost', 'health', 'project', 'all']).default('all'),
  /**
   * Observability mode (lane 9) — a MODE of `query`, not a new tool. When set,
   * it overrides `scope`:
   *   - 'live_cost': price the current session's still-growing transcript,
   *                  per model, split main-loop vs per-subagent.
   *   - 'doctor':    host-health report — load, session children, and any
   *                  orphaned sustained-CPU plugin processes with ready-to-run
   *                  kill commands (never executed).
   *   - 'agents':    background-agent liveness — thinking / executing / wedged.
   */
  mode: z.enum(['live_cost', 'doctor', 'agents']).optional(),
  time_range: z.enum(['session', 'last_5m', 'last_30m', 'last_1h']).default('session'),
  group_by: z.enum(['tool', 'agent', 'file', 'status']).optional(),
  filters: z
    .object({
      tool: z.string().optional(),
      status: z.enum(['success', 'failed', 'partial']).optional(),
      agent: z.string().optional(),
      /** Filter activity events by one or more session tags. */
      tags: z.array(z.string()).optional(),
    })
    .optional(),
  format: z.enum(['standard', 'minimal', 'verbose']).default('standard'),
  /**
   * Cross-project scope: which set of sessions to include.
   * Defaults to 'current_session'. Use 'all_projects' to aggregate across
   * all GlobalDB sessions, or 'tagged' to filter by tags.
   */
  data_scope: z
    .enum(['current_session', 'current_project', 'all_projects', 'tagged'])
    .default('current_session'),
});

export const AnalyticsBudgetInput = z.object({
  action: z.enum(['set', 'check', 'clear']),
  amount: z.number().positive().optional(),
  unit: z.enum(['dollars', 'tokens']).default('dollars'),
  warn_at: z.array(z.number().min(0).max(1)).optional(),
}).refine(
  (data) => data.action !== 'set' || data.amount !== undefined,
  { message: 'amount is required when action is "set"', path: ['amount'] },
);

export const AnalyticsTagInput = z.object({
  action: z.enum(['add', 'remove', 'list', 'auto']),
  value: z.string().min(1).max(100).optional(),  // Required for add/remove, optional for list/auto
  scope: z.enum(['session', 'all']).optional().default('session'), // For list action
}).refine(
  (data) => !['add', 'remove'].includes(data.action) || data.value !== undefined,
  { message: 'value is required for add and remove actions', path: ['value'] },
);

export const AnalyticsExportInput = z.object({
  format: z.enum(['json', 'csv', 'markdown']),
  scope: z
    .string()
    .regex(
      /^(current|historical|all_projects|session:[a-f0-9-]+)$/,
      'Must be "current", "historical", "all_projects", or "session:<id>"',
    )
    .default('current'),
  sections: z
    .array(
      z.enum(['tokens', 'cache', 'commands', 'agents', 'files', 'cost', 'timeline']),
    )
    .optional(),
  output_path: z.string().optional(),
  /** Filter exported sessions by tags (applies to historical and all_projects scopes). */
  tags: z.array(z.string()).optional(),
});

export const AnalyticsConfigInput = z.object({
  action: z.enum(['get', 'set', 'reload']),
  key: z.string().optional(),
  value: z.unknown().optional(),
});

export const AnalyticsSyncInput = z.object({
  /**
   * Scope of the sync operation.
   * - 'current': sync only the current project's JSONL files.
   * - 'all': sync ALL projects discovered under ~/.claude/projects/.
   */
  scope: z.enum(['current', 'all']).default('current'),
});

// === Type Aliases ===

export type AnalyticsDashboardInput = z.infer<typeof AnalyticsDashboardInput>;
export type AnalyticsQueryInput = z.infer<typeof AnalyticsQueryInput>;
export type AnalyticsBudgetInput = z.infer<typeof AnalyticsBudgetInput>;
export type AnalyticsTagInput = z.infer<typeof AnalyticsTagInput>;
export type AnalyticsExportInput = z.infer<typeof AnalyticsExportInput>;
export type AnalyticsConfigInput = z.infer<typeof AnalyticsConfigInput>;
export type AnalyticsSyncInput = z.infer<typeof AnalyticsSyncInput>;

// === Tool Definitions for MCP Registration ===

export const TOOL_DEFINITIONS = {
  analytics_dashboard: {
    name: 'analytics_dashboard',
    description:
      'Launch, stop, or check status of the analytics TUI and mini dashboard. ' +
      'The mini dashboard is a 4-line always-on tmux pane showing session metrics. ' +
      'The full TUI (target="dashboard") is a 3-page interactive dashboard. ' +
      'Calling start on a running target toggles it off (stop); calling stop on a stopped target is a no-op. ' +
      'action="doctor" prints a read-only host-health + agent-liveness report ' +
      '(load, session children, orphaned busy-loop plugin processes with ready-to-run kill commands, ' +
      'and background-agent states) without launching any pane and never killing anything.',
    inputSchema: AnalyticsDashboardInput,
  },
  analytics_query: {
    name: 'analytics_query',
    description:
      'Ad-hoc queries against session data. Query tokens, cache, commands, agents, files, cost, health, ' +
      'or project metrics. Supports time ranges, grouping, filtering, and cross-project scoping via data_scope. ' +
      "Observability modes (set mode=): 'live_cost' prices the live transcript per model split main-loop vs " +
      "subagents; 'doctor' reports host load and orphaned busy-loop plugin processes with kill commands; " +
      "'agents' classifies background agents as thinking / executing / wedged.",
    inputSchema: AnalyticsQueryInput,
  },
  analytics_budget: {
    name: 'analytics_budget',
    description:
      'Set, check, or clear a session budget (in dollars or tokens). When set, the mini dashboard shows remaining budget with color-coded thresholds.',
    inputSchema: AnalyticsBudgetInput,
  },
  analytics_tag: {
    name: 'analytics_tag',
    description:
      'Add, remove, or list tags on the current session. Tags are persisted in the global SQLite DB and support multi-tag arrays. Use action=auto to get heuristic tag suggestions based on JSONL analysis.',
    inputSchema: AnalyticsTagInput,
  },
  analytics_export: {
    name: 'analytics_export',
    description:
      'Export session data in JSON, CSV, or markdown format. Supports current session, a specific historical ' +
      'session, all historical data, or all projects (scope="all_projects"). Filter by tags.',
    inputSchema: AnalyticsExportInput,
  },
  analytics_config: {
    name: 'analytics_config',
    description:
      'View, update, or reload analytics engine settings. Supports dot-notation keys. ' +
      'Use action="reload" to hot-reload configuration from disk without restarting.',
    inputSchema: AnalyticsConfigInput,
  },
  analytics_sync: {
    name: 'analytics_sync',
    description:
      'Sync Claude JSONL session files into the global analytics SQLite database. ' +
      'Use scope="current" to sync the current project, or scope="all" to sync all projects ' +
      'discovered under ~/.claude/projects/. Supports incremental sync via byte-offset tracking.',
    inputSchema: AnalyticsSyncInput,
  },
} as const;
