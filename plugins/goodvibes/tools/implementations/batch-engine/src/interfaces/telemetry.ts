/**
 * Telemetry Structure interfaces for Batch Engine
 * @see SPEC-v2 Section 9.1
 */

export interface Telemetry {
  session: SessionMetrics;
  batches: Map<string, BatchMetrics>;
  operations: Map<string, OperationMetrics>;
  agents: Map<string, AgentMetrics>;
  aggregations: Aggregations;
}

export interface SessionMetrics {
  id: string;
  started_at: string;
  ended_at?: string;
  mode: string;
  total_batches: number;
  total_operations: number;
  total_agents: number;
  total_tokens: number;
  total_duration_ms: number;
  operations_by_type: Record<string, number>;
  tokens_by_type: Record<string, number>;
  batch_success_rate: number;
  operation_success_rate: number;
  agent_success_rate: number;
  rollbacks_triggered: number;
  fix_loops_run: number;
  retries_total: number;
}

export interface BatchMetrics {
  id: string;
  started_at: string;
  completed_at: string;
  status: string;
  operations_total: number;
  operations_succeeded: number;
  operations_failed: number;
  duration_ms: number;
  tokens_used: number;
  parallel_efficiency: number;
  validation_passed: boolean;
  validation_errors: number;
  checkpoint_created: boolean;
  rollback_triggered: boolean;
}

export interface OperationMetrics {
  id: string;
  batch_id: string;
  type: string;
  queued_at: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  tokens_used: number;
  status: string;
  retries: number;
  details: Record<string, unknown>;
}

export interface AgentMetrics {
  id: string;
  batch_id: string;
  operation_id: string;
  agent_type: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  tokens_input: number;
  tokens_output: number;
  tokens_total: number;
  turns: number;
  tool_calls: number;
  files_read: number;
  files_written: number;
  tools_used: string[];
  status: string;
  budget_utilization: number;
}

export interface Aggregations {
  hourly: TimeseriesPoint[];
  daily: TimeseriesPoint[];
  by_operation_type: Record<string, TypeAggregation>;
  by_agent_type: Record<string, TypeAggregation>;
  trends: {
    token_trend: TrendAnalysis;
    success_trend: TrendAnalysis;
    duration_trend: TrendAnalysis;
  };
}

export interface TimeseriesPoint {
  timestamp: string;
  batches: number;
  operations: number;
  tokens: number;
  success_rate: number;
}

export interface TypeAggregation {
  count: number;
  total_tokens: number;
  avg_tokens: number;
  avg_duration_ms: number;
  success_rate: number;
}

export interface TrendAnalysis {
  direction: 'up' | 'down' | 'stable';
  change_percent: number;
  period: string;
}
