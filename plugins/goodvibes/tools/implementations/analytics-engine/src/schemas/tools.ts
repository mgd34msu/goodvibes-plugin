import { z } from 'zod';

// === Input Schemas ===

export const AnalyticsDashboardInput = z.object({
  action: z.enum(['start', 'stop', 'status']),
  target: z.enum(['mini', 'full', 'both']).default('both'),
  options: z
    .object({
      pane_position: z.enum(['bottom', 'top', 'left', 'right']).optional(),
      pane_size: z.union([z.number(), z.string()]).optional(),
    })
    .optional(),
});

export const AnalyticsQueryInput = z.object({
  scope: z.enum(['tokens', 'cache', 'commands', 'agents', 'files', 'cost', 'health', 'project', 'all']),
  time_range: z.enum(['session', 'last_5m', 'last_30m', 'last_1h']).default('session'),
  group_by: z.enum(['tool', 'agent', 'file', 'status']).optional(),
  filters: z
    .object({
      tool: z.string().optional(),
      status: z.enum(['success', 'failed', 'partial']).optional(),
      agent: z.string().optional(),
    })
    .optional(),
  format: z.enum(['standard', 'minimal', 'verbose']).default('standard'),
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
  scope: z.string().regex(/^(current|historical|session:[a-f0-9]+)$/, 'Must be "current", "historical", or "session:<id>"').default('current'),
  sections: z
    .array(
      z.enum(['tokens', 'cache', 'commands', 'agents', 'files', 'cost', 'timeline']),
    )
    .optional(),
  output_path: z.string().optional(),
});

export const AnalyticsConfigInput = z.object({
  action: z.enum(['get', 'set']),
  key: z.string().optional(),
  value: z.unknown().optional(),
});

// === Type Aliases ===

export type AnalyticsDashboardInput = z.infer<typeof AnalyticsDashboardInput>;
export type AnalyticsQueryInput = z.infer<typeof AnalyticsQueryInput>;
export type AnalyticsBudgetInput = z.infer<typeof AnalyticsBudgetInput>;
export type AnalyticsTagInput = z.infer<typeof AnalyticsTagInput>;
export type AnalyticsExportInput = z.infer<typeof AnalyticsExportInput>;
export type AnalyticsConfigInput = z.infer<typeof AnalyticsConfigInput>;

// === Tool Definitions for MCP Registration ===

export const TOOL_DEFINITIONS = {
  analytics_dashboard: {
    name: 'analytics_dashboard',
    description:
      'Launch, stop, or check status of the analytics TUI and mini dashboard. The mini dashboard is a 4-line always-on tmux pane showing session metrics. The full TUI is a 3-page interactive dashboard.',
    inputSchema: AnalyticsDashboardInput,
  },
  analytics_query: {
    name: 'analytics_query',
    description:
      'Ad-hoc queries against session data. Query tokens, cache, commands, agents, files, cost, health, or project metrics. Supports time ranges, grouping, and filtering.',
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
      'Export session data in JSON, CSV, or markdown format. Can export current session, a specific historical session, or all historical data.',
    inputSchema: AnalyticsExportInput,
  },
  analytics_config: {
    name: 'analytics_config',
    description:
      'View or update analytics engine settings like refresh rates, cost rates, webhook URLs, and anomaly detection.',
    inputSchema: AnalyticsConfigInput,
  },
} as const;
