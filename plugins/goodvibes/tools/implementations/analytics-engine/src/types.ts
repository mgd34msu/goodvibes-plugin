// === Configuration ===
export interface AnalyticsConfig {
  enabled: boolean;
  auto_start_mini: boolean;
  /** @deprecated Use auto_start_dashboard */
  auto_start_full: boolean;
  auto_start_dashboard: boolean;
  refresh_rate_ms: number;
  /** @deprecated Use dashboard_refresh_rate_ms */
  full_tui_refresh_rate_ms: number;
  dashboard_refresh_rate_ms: number;
  cost_per_1k_input_tokens: number;
  cost_per_1k_output_tokens: number;
  budget: { amount: number; unit: 'dollars' | 'tokens' } | null;
  budget_warn_thresholds: number[];
  /** When true, show the graphical budget progress bar in the mini dashboard header. Default: false. */
  mini_budget_bar?: boolean;
  /** Minimum terminal width for mini dashboard rendering (default: 160). */
  mini_min_width?: number;
  /** Uniform width for each section column in mini dashboard lines 2-3 (default: 32). */
  mini_section_width?: number;
  /**
   * Claude context window size in tokens used to compute context_percent.
   * Defaults to 200_000 (Claude's current context window).
   */
  context_window_tokens?: number;
  anomaly_detection: boolean;
  auto_report_on_shutdown: boolean;
  webhook_url: string | null;
  webhook_events: WebhookEvent[];
  /** Absolute path to the global analytics SQLite database. */
  global_db_path: string;
  /** Base path for Claude JSONL session files (default: ~/.claude/projects). */
  jsonl_base_path: string;
  tmux: TmuxConfig;
}

export interface TmuxConfig {
  mini_pane_size: number;
  mini_position: 'bottom' | 'top' | 'left' | 'right';
  /** @deprecated Use dashboard_pane_size */
  full_pane_size: string;
  dashboard_pane_size: string;
  /** @deprecated Use dashboard_position */
  full_position: 'bottom' | 'top' | 'left' | 'right';
  dashboard_position: 'bottom' | 'top' | 'left' | 'right';
}

export type WebhookEvent = 'session_end' | 'budget_warning' | 'anomaly_detected';

export const DEFAULT_CONFIG: Readonly<AnalyticsConfig> = {
  enabled: true,
  auto_start_mini: true,
  auto_start_full: false,
  auto_start_dashboard: false,
  refresh_rate_ms: 1000,
  full_tui_refresh_rate_ms: 5000,
  dashboard_refresh_rate_ms: 5000,
  cost_per_1k_input_tokens: 0.003,
  cost_per_1k_output_tokens: 0.015,
  budget: null,
  budget_warn_thresholds: [0.5, 0.8, 1.0],
  mini_budget_bar: false,
  anomaly_detection: true,
  auto_report_on_shutdown: true,
  webhook_url: null,
  webhook_events: ['session_end'],
  global_db_path: '~/.claude/.goodvibes/analytics/analytics.db',
  jsonl_base_path: '~/.claude/projects',
  tmux: {
    mini_pane_size: 5,
    mini_position: 'bottom',
    full_pane_size: '60%',
    dashboard_pane_size: '60%',
    full_position: 'right',
    dashboard_position: 'right',
  },
} as const;

// === Metrics ===
export interface TokenMetrics {
  input: number;
  output: number;
  total: number;
  saved: number;
  efficiency: number; // saved / total ratio
  /** Claude API input tokens (from usage events). */
  api_input: number;
  /** Claude API output tokens (from usage events). */
  api_output: number;
  /** Cache read tokens from the API. */
  cache_read: number;
  /** Cache write tokens from the API. */
  cache_write: number;
}

export interface CacheMetrics {
  hit_rate: number;
  hits: number;
  misses: number;
  memory_peak_mb: number;
  evictions: number;
}

export interface CostMetrics {
  input: number;   // dollars
  output: number;  // dollars
  total: number;   // dollars
  saved: number;   // dollars
}

export interface ToolMetrics {
  total: number;
  success_rate: number;
  avg_duration_ms: number;
  total_duration_ms: number;
  failures: number;
  slowest: { tool: string; duration_ms: number } | null;
}

export interface AgentMetrics {
  spawned: number;
  max_concurrent: number;
  total_tokens: number;
  active: number;
  completed: number;
}

export interface FileMetrics {
  unique_read: number;
  modified: number;
  created: number;
  conflicts: number;
}

export interface SessionMetrics {
  tokens: TokenMetrics;
  cache: CacheMetrics;
  cost: CostMetrics;
  tools: ToolMetrics;
  agents: AgentMetrics;
  files: FileMetrics;
}

// === Tool Breakdown ===
export interface ToolBreakdown {
  calls: number;
  avg_ms: number;
  cache_hit_rate?: number;
  tokens_in: number;
  tokens_out: number;
  success_rate: number;
}

// === Activity Events ===
export type ActivityEventType =
  | 'read' | 'write' | 'edit' | 'exec' | 'grep' | 'glob' | 'discover'
  | 'conflict' | 'agent_spawn' | 'agent_complete' | 'fetch' | 'symbols' | 'notebook';

export interface ActivityEvent {
  timestamp: string; // ISO 8601
  type: ActivityEventType;
  tool: string;
  description: string;
  agent_id?: string;
  file?: string;
  duration_ms?: number;
  cache_hit?: boolean;
  tokens?: number;
  details: Record<string, unknown>;
}

// === File Hotspots ===
export interface FileHotspot {
  path: string;
  reads: number;
  writes: number;
  conflicts: number;
  tokens_saved: number;
  last_accessed: string;
}

// === Agent Profiles ===
export interface AgentProfile {
  agent_id: string;
  agent_type: string;
  tokens_in: number;
  tokens_out: number;
  tool_calls: number;
  success_rate: number;
  duration_ms: number;
  status: 'active' | 'completed' | 'failed';
}

// === Anomalies ===
export type AnomalyType =
  | 'cache_degradation' | 'error_spike' | 'token_burn'
  | 'build_regression' | 'conflict_storm' | 'agent_stall';

export type AnomalySeverity = 'warning' | 'alert';

export interface Anomaly {
  id: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  message: string;
  timestamp: string;
  details: Record<string, unknown>;
}

// === Budget ===
export interface BudgetState {
  amount: number;
  unit: 'dollars' | 'tokens';
  used: number;
  remaining: number;
  percentage: number;
  warn_thresholds: number[];
  current_threshold: number | null;
}

// === Dashboard State (aggregated view for renderers) ===
export interface DashboardState {
  session_id: string;
  project_hash: string;
  max_agent_chains: number;
  started_at: string;
  uptime_ms: number;
  metrics: SessionMetrics;
  tools_breakdown: Record<string, ToolBreakdown>;
  recent_activity: ActivityEvent[];
  file_hotspots: FileHotspot[];
  agent_profiles: AgentProfile[];
  anomalies: Anomaly[];
  budget: BudgetState | null;
  health_status: 'healthy' | 'warning' | 'alert';
  /** Estimated context window usage as a percentage (0-100), derived from most recent JSONL assistant input_tokens. */
  context_percent: number;
}

// === Session Archive (persisted to disk) ===
export interface SessionArchive {
  session_id: string;
  /** @deprecated Use tags array instead. */
  tag?: string;
  tags: string[];
  project_hash: string;
  name?: string;
  started_at: string;
  ended_at: string;
  duration_minutes: number;
  metrics: SessionMetrics;
  tools_breakdown: Record<string, ToolBreakdown>;
  project_snapshot: {
    total_files: number;
    total_estimated_tokens: number;
  };
}

// === Historical Comparison ===
export interface HistoricalComparison {
  current: SessionMetrics;
  average: SessionMetrics;
  deltas: Record<string, { value: number; percentage: number; direction: 'up' | 'down' | 'stable' }>;
  sessions: SessionArchive[];
}

// === Health Status ===
export type HealthStatus = 'healthy' | 'warning' | 'alert';

export interface HealthCheck {
  status: HealthStatus;
  checks: {
    error_rate: { status: HealthStatus; value: number };
    cache_hit_rate: { status: HealthStatus; value: number };
    budget: { status: HealthStatus; value: number | null };
    anomaly_count: { status: HealthStatus; value: number };
  };
}

// === Telemetry Record (matches precision-engine schema) ===
export interface TelemetryRecord {
  id: string;
  session_id: string;
  tool: string;
  status: 'success' | 'failed' | 'partial';
  tokens_in?: number;
  tokens_out?: number;
  cache_hit?: boolean;
  cache_bytes_saved?: number;
  duration_ms?: number;
  error?: string;
  metadata?: string; // JSON string
  created_at: string;
}

// === Project Index (matches precision-engine v4 format) ===
export interface ProjectIndex {
  _format: string;
  version: number;
  created_at: string;
  updated_at: string;
  project_root: string;
  stats: {
    total_files: number;
    total_dirs: number;
    index_duration_ms: number;
    partial: boolean;
  };
  tree: Record<string, Record<string, number>>; // dir -> {filename: tokenCount}
}

// === Webhook Payloads ===
export interface WebhookPayload {
  event: WebhookEvent;
  session_id: string;
  timestamp: string;
  data: SessionEndPayload | BudgetWarningPayload | AnomalyPayload;
}

export interface SessionEndPayload {
  tag?: string;
  duration_minutes: number;
  tokens_used: number;
  tokens_saved: number;
  cost: number;
  cache_hit_rate: number;
  success_rate: number;
  commands_run: number;
  agents_spawned: number;
  files_modified: number;
}

export interface BudgetWarningPayload {
  budget: number;
  used: number;
  remaining: number;
  threshold: number;
}

export interface AnomalyPayload {
  anomaly: Anomaly;
}

// === Recommendations ===
export interface Recommendation {
  type: 'optimization' | 'warning' | 'info';
  icon: string;
  message: string;
  details?: string;
}

// === MCP Response ===
/**
 * Standard MCP tool response shape used by all analytics handlers.
 * Matches the MCP protocol's expected response format.
 */
export interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Create a text-only ToolResponse.
 */
export function toolResponse(text: string, isError = false): ToolResponse {
  const response: ToolResponse = { content: [{ type: 'text', text }] };
  if (isError) response.isError = true;
  return response;
}

// === Global Analytics DB Record Types ===

/** A session record stored in the global analytics SQLite database. */
export interface GlobalSession {
  session_id: string;
  project_hash: string;
  project_path?: string;
  started_at: string;
  ended_at?: string;
  model: string;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_read_tokens: number;
  total_cache_write_tokens: number;
  total_cost_usd: number;
  total_api_calls: number;
  total_tool_calls: number;
  total_native_tool_calls: number;
  total_precision_tool_calls: number;
  total_agent_spawns: number;
  tags: string[];
  status: 'active' | 'completed' | 'archived';
}

/** A single Claude API call record. */
export interface ApiCallRecord {
  session_id: string;
  timestamp: string;
  model?: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;
  duration_ms: number;
  stop_reason?: string;
}

/** Per-session per-tool aggregate statistics. */
export interface ToolSummaryRecord {
  session_id: string;
  tool_name: string;
  call_count: number;
  success_count: number;
  error_count: number;
  total_duration_ms: number;
  total_input_tokens: number;
  total_output_tokens: number;
}

/** A spawned agent record. */
export interface AgentRecord {
  session_id: string;
  agent_id: string;
  agent_type?: string;
  parent_session_id?: string;
  model?: string;
  spawned_at: string;
  completed_at?: string;
  total_tokens: number;
  duration_ms: number;
  exit_code?: number;
}

/** A tag entry linking a session to a tag string. */
export interface TagEntry {
  tag: string;
  session_id: string;
  created_at: string;
  source: 'manual' | 'auto';
}

/** Tracks which JSONL files have been processed by the sync layer. */
export interface SyncStateRecord {
  jsonl_path: string;
  session_id: string;
  last_offset: number;
  last_synced_at: string;
}

/**
 * Describes the scope of a query against the analytics database.
 * Used by query handlers to target the right set of sessions.
 */
export type QueryScope =
  | { type: 'current_session' }
  | { type: 'current_project'; project_hash: string }
  | { type: 'all_projects' }
  | { type: 'tagged'; tags: string[] }
  | { type: 'time_range'; start: string; end: string };
