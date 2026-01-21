/**
 * Telemetry Collector implementation for Batch Engine
 * @see SPEC-v2 Sections 9.1-9.4
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import type {
  Telemetry,
  SessionMetrics,
  BatchMetrics,
  OperationMetrics,
  AgentMetrics,
  Aggregations,
  TimeseriesPoint,
  TypeAggregation,
  TrendAnalysis,
} from '../interfaces/telemetry.js';
import type {
  TelemetryAPI,
  Bottleneck,
  ModelType,
  TOKEN_COSTS,
} from '../interfaces/telemetry-api.js';
import type { Batch } from '../interfaces/batch.js';
import type { OperationResult, BatchResult } from '../interfaces/result.js';
import type { OperationBase } from '../interfaces/operation.js';
import type { AgentSpec } from '../interfaces/operations/exec.js';
import type { AgentResult } from '../interfaces/state-api.js';
import {
  TELEMETRY_PATHS,
  getHistoryPath,
  getTodayDateString,
  EMPTY_SESSION_METRICS,
  EMPTY_AGGREGATIONS,
} from '../interfaces/telemetry-files.js';

/**
 * Token costs per model (per 1M tokens)
 */
const TOKEN_COSTS_CONFIG = {
  input: {
    haiku: 0.25,
    sonnet: 3.00,
    opus: 15.00,
  },
  output: {
    haiku: 1.25,
    sonnet: 15.00,
    opus: 75.00,
  },
} as const;

/**
 * Generate a unique ID with prefix
 */
function generateId(prefix: string): string {
  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const random = crypto.randomBytes(4).toString('hex');
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Calculate success rate as a percentage
 */
function calcSuccessRate(succeeded: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((succeeded / total) * 100 * 100) / 100;
}

/**
 * Aggregate operations by type
 */
function aggregateByType(
  operations: OperationMetrics[]
): Record<string, TypeAggregation> {
  const byType = new Map<string, OperationMetrics[]>();

  for (const op of operations) {
    const existing = byType.get(op.type) || [];
    existing.push(op);
    byType.set(op.type, existing);
  }

  const result: Record<string, TypeAggregation> = {};
  for (const [type, ops] of byType) {
    const succeeded = ops.filter(o => o.status === 'success').length;
    result[type] = {
      count: ops.length,
      total_tokens: ops.reduce((sum, o) => sum + o.tokens_used, 0),
      avg_tokens: Math.round(ops.reduce((sum, o) => sum + o.tokens_used, 0) / ops.length),
      avg_duration_ms: Math.round(ops.reduce((sum, o) => sum + o.duration_ms, 0) / ops.length),
      success_rate: calcSuccessRate(succeeded, ops.length),
    };
  }

  return result;
}

/**
 * Aggregate agents by type
 */
function aggregateAgentsByType(
  agents: AgentMetrics[]
): Record<string, TypeAggregation> {
  const byType = new Map<string, AgentMetrics[]>();

  for (const agent of agents) {
    const existing = byType.get(agent.agent_type) || [];
    existing.push(agent);
    byType.set(agent.agent_type, existing);
  }

  const result: Record<string, TypeAggregation> = {};
  for (const [type, agts] of byType) {
    const succeeded = agts.filter(a => a.status === 'success').length;
    result[type] = {
      count: agts.length,
      total_tokens: agts.reduce((sum, a) => sum + a.tokens_total, 0),
      avg_tokens: Math.round(agts.reduce((sum, a) => sum + a.tokens_total, 0) / agts.length),
      avg_duration_ms: Math.round(agts.reduce((sum, a) => sum + a.duration_ms, 0) / agts.length),
      success_rate: calcSuccessRate(succeeded, agts.length),
    };
  }

  return result;
}

/**
 * Calculate trend from timeseries data
 */
function calculateTrend(
  points: TimeseriesPoint[],
  metric: 'tokens' | 'success_rate'
): TrendAnalysis {
  if (points.length < 2) {
    return { direction: 'stable', change_percent: 0, period: '7d' };
  }

  const recent = points.slice(-7);
  if (recent.length < 2) {
    return { direction: 'stable', change_percent: 0, period: '7d' };
  }

  const firstPoint = recent[0]!;
  const lastPoint = recent[recent.length - 1]!;
  const oldValue = firstPoint[metric];
  const newValue = lastPoint[metric];

  if (oldValue === 0) {
    return { direction: newValue > 0 ? 'up' : 'stable', change_percent: 0, period: '7d' };
  }

  const changePercent = ((newValue - oldValue) / oldValue) * 100;
  const direction = changePercent > 5 ? 'up' : changePercent < -5 ? 'down' : 'stable';

  return {
    direction,
    change_percent: Math.round(changePercent * 100) / 100,
    period: '7d',
  };
}

/**
 * TelemetryCollector implementation
 */
export class TelemetryCollectorImpl implements TelemetryAPI {
  private telemetry: Telemetry;
  private projectRoot: string;
  private sessionStartTime: number;
  private activeBatches: Map<string, { batch: Batch; startTime: number }>;
  private activeOperations: Map<string, { operation: OperationBase; startTime: number; batch_id: string }>;
  private activeAgents: Map<string, { agent: AgentSpec; startTime: number; batch_id: string; operation_id: string }>;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
    this.sessionStartTime = Date.now();
    this.activeBatches = new Map();
    this.activeOperations = new Map();
    this.activeAgents = new Map();
    this.telemetry = this.createEmptyTelemetry();
  }

  private createEmptyTelemetry(): Telemetry {
    return {
      session: {
        ...EMPTY_SESSION_METRICS,
        id: generateId('session'),
        started_at: new Date().toISOString(),
      },
      batches: [],
      operations: [],
      agents: [],
      aggregations: { ...EMPTY_AGGREGATIONS },
    };
  }

  // =========================================================================
  // Recording Methods
  // =========================================================================

  recordBatchStart(batch: Batch): void {
    this.activeBatches.set(batch.id, {
      batch,
      startTime: Date.now(),
    });
  }

  recordBatchComplete(batch_id: string, result: BatchResult): void {
    const active = this.activeBatches.get(batch_id);
    if (!active) return;

    const duration_ms = Date.now() - active.startTime;
    const tokens_used = result.summary.tokens_used;

    const batchMetrics: BatchMetrics = {
      id: batch_id,
      started_at: new Date(active.startTime).toISOString(),
      completed_at: new Date().toISOString(),
      status: result.summary.status,
      operations_total: result.summary.operations_total,
      operations_succeeded: result.summary.operations_succeeded,
      operations_failed: result.summary.operations_failed,
      duration_ms,
      tokens_used,
      parallel_efficiency: this.calculateParallelEfficiency(result),
      validation_passed: result.validation.after.passed,
      validation_errors: result.validation.after.errors?.length || 0,
      checkpoint_created: !!result.recovery.checkpoint_id,
      rollback_triggered: result.recovery.rollback_triggered,
    };

    this.telemetry.batches.push(batchMetrics);
    this.activeBatches.delete(batch_id);

    // Update session metrics
    this.updateSessionMetrics(batchMetrics, result);
  }

  recordOperationStart(operation: OperationBase): void {
    const batch_id = this.findBatchForOperation(operation.id);
    this.activeOperations.set(operation.id, {
      operation,
      startTime: Date.now(),
      batch_id,
    });
  }

  recordOperationComplete(operation_id: string, result: OperationResult): void {
    const active = this.activeOperations.get(operation_id);
    if (!active) return;

    const duration_ms = Date.now() - active.startTime;

    const operationMetrics: OperationMetrics = {
      id: operation_id,
      batch_id: active.batch_id,
      type: result.type,
      started_at: new Date(active.startTime).toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms,
      tokens_used: result.tokens_used,
      status: result.status,
      retries: 0, // TODO: Track retries
      details: result.data || {},
    };

    this.telemetry.operations.push(operationMetrics);
    this.activeOperations.delete(operation_id);

    // Update session operation counts
    this.telemetry.session.total_operations++;
    this.telemetry.session.total_tokens += result.tokens_used;
    this.telemetry.session.operations_by_type[result.type] =
      (this.telemetry.session.operations_by_type[result.type] || 0) + 1;
    this.telemetry.session.tokens_by_type[result.type] =
      (this.telemetry.session.tokens_by_type[result.type] || 0) + result.tokens_used;
  }

  recordAgentStart(agent: AgentSpec): void {
    const operation_id = agent.id; // Agent ID can be used to find operation
    const batch_id = this.findBatchForAgent(agent.id);

    this.activeAgents.set(agent.id, {
      agent,
      startTime: Date.now(),
      batch_id,
      operation_id,
    });
  }

  recordAgentComplete(agent_id: string, result: AgentResult): void {
    const active = this.activeAgents.get(agent_id);
    if (!active) return;

    const duration_ms = Date.now() - active.startTime;
    const budget = active.agent.budget || {};

    const agentMetrics: AgentMetrics = {
      id: agent_id,
      batch_id: active.batch_id,
      operation_id: active.operation_id,
      agent_type: active.agent.agent,
      started_at: new Date(active.startTime).toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms,
      tokens_input: Math.round(result.tokens_used * 0.3), // Estimate 30% input
      tokens_output: Math.round(result.tokens_used * 0.7), // Estimate 70% output
      tokens_total: result.tokens_used,
      turns: result.turns_used,
      tool_calls: 0, // TODO: Track tool calls
      files_read: 0, // TODO: Track files read
      files_written: result.files_modified.length,
      status: result.status,
      budget_utilization: budget.max_tokens
        ? Math.round((result.tokens_used / budget.max_tokens) * 100)
        : 0,
    };

    this.telemetry.agents.push(agentMetrics);
    this.activeAgents.delete(agent_id);

    // Update session agent counts
    this.telemetry.session.total_agents++;
  }

  // =========================================================================
  // Querying Methods
  // =========================================================================

  getSessionMetrics(): SessionMetrics {
    this.updateSessionDuration();
    this.calculateSuccessRates();
    return this.telemetry.session;
  }

  getBatchMetrics(batch_id: string): BatchMetrics {
    const batch = this.telemetry.batches.find(b => b.id === batch_id);
    if (!batch) {
      throw new Error(`Batch not found: ${batch_id}`);
    }
    return batch;
  }

  getAggregations(period?: string): Aggregations {
    this.updateAggregations();
    return this.telemetry.aggregations;
  }

  // =========================================================================
  // Analysis Methods
  // =========================================================================

  estimateCost(tokens: number): number {
    const model: ModelType = 'sonnet';
    const inputCost = (tokens * 0.3) * TOKEN_COSTS_CONFIG.input[model] / 1_000_000;
    const outputCost = (tokens * 0.7) * TOKEN_COSTS_CONFIG.output[model] / 1_000_000;
    return Math.round((inputCost + outputCost) * 100) / 100;
  }

  projectTokenUsage(batches: number): number {
    if (this.telemetry.batches.length === 0) return 0;

    const avgTokensPerBatch = this.telemetry.batches.reduce(
      (sum, b) => sum + b.tokens_used, 0
    ) / this.telemetry.batches.length;

    return Math.round(avgTokensPerBatch * batches);
  }

  identifyBottlenecks(): Bottleneck[] {
    const bottlenecks: Bottleneck[] = [];

    // Find slowest operations
    const sortedOps = [...this.telemetry.operations].sort(
      (a, b) => b.duration_ms - a.duration_ms
    );

    for (const op of sortedOps.slice(0, 3)) {
      if (op.duration_ms > 5000) {
        bottlenecks.push({
          type: 'operation',
          id: op.id,
          description: `Slow ${op.type} operation (${op.duration_ms}ms)`,
          impact_ms: op.duration_ms,
          suggestion: `Consider optimizing or parallelizing ${op.type} operations`,
        });
      }
    }

    // Find validation failures
    const validationFailures = this.telemetry.batches.filter(b => !b.validation_passed);
    if (validationFailures.length > 0) {
      const avgRetryTime = validationFailures.reduce(
        (sum, b) => sum + b.duration_ms, 0
      ) / validationFailures.length;

      bottlenecks.push({
        type: 'validation',
        id: 'validation_failures',
        description: `${validationFailures.length} batches failed validation`,
        impact_ms: avgRetryTime,
        suggestion: 'Pre-validate operations before batch execution',
      });
    }

    // Find agents with high budget utilization
    const overBudgetAgents = this.telemetry.agents.filter(a => a.budget_utilization > 80);
    for (const agent of overBudgetAgents) {
      bottlenecks.push({
        type: 'agent',
        id: agent.id,
        description: `Agent ${agent.agent_type} used ${agent.budget_utilization}% of budget`,
        impact_ms: agent.duration_ms,
        suggestion: 'Consider increasing agent budget or splitting task',
      });
    }

    return bottlenecks;
  }

  // =========================================================================
  // Export Methods
  // =========================================================================

  exportReport(format: 'json' | 'markdown' | 'csv'): string {
    this.updateSessionDuration();
    this.calculateSuccessRates();
    this.updateAggregations();

    switch (format) {
      case 'json':
        return JSON.stringify(this.telemetry, null, 2);

      case 'markdown':
        return this.exportMarkdown();

      case 'csv':
        return this.exportCsv();

      default:
        return JSON.stringify(this.telemetry, null, 2);
    }
  }

  private exportMarkdown(): string {
    const session = this.telemetry.session;
    const lines: string[] = [
      '# Telemetry Report',
      '',
      '## Session Summary',
      '',
      `- **Session ID**: ${session.id}`,
      `- **Started**: ${session.started_at}`,
      `- **Duration**: ${Math.round(session.total_duration_ms / 1000 / 60)} minutes`,
      `- **Mode**: ${session.mode}`,
      '',
      '### Metrics',
      '',
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Total Batches | ${session.total_batches} |`,
      `| Total Operations | ${session.total_operations} |`,
      `| Total Agents | ${session.total_agents} |`,
      `| Total Tokens | ${session.total_tokens.toLocaleString()} |`,
      `| Estimated Cost | $${this.estimateCost(session.total_tokens)} |`,
      `| Batch Success Rate | ${session.batch_success_rate}% |`,
      `| Operation Success Rate | ${session.operation_success_rate}% |`,
      `| Agent Success Rate | ${session.agent_success_rate}% |`,
      `| Rollbacks | ${session.rollbacks_triggered} |`,
      `| Fix Loops | ${session.fix_loops_run} |`,
      '',
      '### Operations by Type',
      '',
      '| Type | Count | Tokens |',
      '|------|-------|--------|',
    ];

    for (const [type, count] of Object.entries(session.operations_by_type)) {
      const tokens = session.tokens_by_type[type] || 0;
      lines.push(`| ${type} | ${count} | ${tokens.toLocaleString()} |`);
    }

    lines.push('', '---', '', '*Generated by GoodVibes Batch Engine*');

    return lines.join('\n');
  }

  private exportCsv(): string {
    const lines: string[] = [
      'batch_id,started_at,completed_at,status,operations_total,operations_succeeded,operations_failed,duration_ms,tokens_used,parallel_efficiency',
    ];

    for (const batch of this.telemetry.batches) {
      lines.push([
        batch.id,
        batch.started_at,
        batch.completed_at,
        batch.status,
        batch.operations_total,
        batch.operations_succeeded,
        batch.operations_failed,
        batch.duration_ms,
        batch.tokens_used,
        batch.parallel_efficiency,
      ].join(','));
    }

    return lines.join('\n');
  }

  // =========================================================================
  // Persistence Methods
  // =========================================================================

  async persist(): Promise<void> {
    await this.ensureTelemetryDir();

    // Write current session metrics
    await this.writeCurrentSession(this.getSessionMetrics());

    // Write today's history
    const today = getTodayDateString();
    const todayAggregations = this.calculateDailyAggregations(today);
    await this.writeHistory(today, todayAggregations);

    // Write overall aggregations
    await this.writeAggregations(this.getAggregations());
  }

  async load(): Promise<void> {
    await this.ensureTelemetryDir();

    // Load current session
    const session = await this.readCurrentSession();
    if (session) {
      this.telemetry.session = session;
      this.sessionStartTime = new Date(session.started_at).getTime();
    }

    // Load aggregations
    const aggregations = await this.readAggregations();
    if (aggregations) {
      this.telemetry.aggregations = aggregations;
    }
  }

  // =========================================================================
  // Helper Methods
  // =========================================================================

  private findBatchForOperation(operation_id: string): string {
    for (const [batch_id, data] of this.activeBatches) {
      const batch = data.batch;
      const allOps = [
        ...(batch.operations.read || []),
        ...(batch.operations.write || []),
        ...(batch.operations.exec || []),
        ...(batch.operations.query || []),
        ...(batch.operations.state || []),
      ];
      if (allOps.some(op => op.id === operation_id)) {
        return batch_id;
      }
    }
    return '';
  }

  private findBatchForAgent(agent_id: string): string {
    for (const [batch_id, data] of this.activeBatches) {
      const batch = data.batch;
      const execOps = batch.operations.exec || [];
      for (const op of execOps) {
        if ('agents' in op && op.agents?.some(a => a.id === agent_id)) {
          return batch_id;
        }
      }
    }
    return '';
  }

  private calculateParallelEfficiency(result: BatchResult): number {
    if (result.execution_graph.critical_path_ms === 0) return 100;
    const totalSerial = result.execution_graph.parallel_groups.reduce(
      (sum, group) => sum + group.length,
      0
    );
    if (totalSerial === 0) return 100;
    return Math.round(
      (result.execution_graph.critical_path_ms / (result.summary.duration_ms || 1)) * 100
    );
  }

  private updateSessionMetrics(batchMetrics: BatchMetrics, result: BatchResult): void {
    const session = this.telemetry.session;

    session.total_batches++;
    session.total_tokens += batchMetrics.tokens_used;
    session.total_duration_ms = Date.now() - this.sessionStartTime;

    if (batchMetrics.rollback_triggered) {
      session.rollbacks_triggered++;
    }
  }

  private updateSessionDuration(): void {
    this.telemetry.session.total_duration_ms = Date.now() - this.sessionStartTime;
    if (!this.telemetry.session.ended_at) {
      // Session still active
    }
  }

  private calculateSuccessRates(): void {
    const session = this.telemetry.session;
    const batches = this.telemetry.batches;
    const operations = this.telemetry.operations;
    const agents = this.telemetry.agents;

    session.batch_success_rate = calcSuccessRate(
      batches.filter(b => b.status === 'success').length,
      batches.length
    );

    session.operation_success_rate = calcSuccessRate(
      operations.filter(o => o.status === 'success').length,
      operations.length
    );

    session.agent_success_rate = calcSuccessRate(
      agents.filter(a => a.status === 'success').length,
      agents.length
    );
  }

  private updateAggregations(): void {
    const aggregations = this.telemetry.aggregations;

    // Update by type aggregations
    aggregations.by_operation_type = aggregateByType(this.telemetry.operations);
    aggregations.by_agent_type = aggregateAgentsByType(this.telemetry.agents);

    // Update trends
    aggregations.token_trend = calculateTrend(aggregations.daily, 'tokens');
    aggregations.success_trend = calculateTrend(aggregations.daily, 'success_rate');
    aggregations.duration_trend = { direction: 'stable', change_percent: 0, period: '7d' };
  }

  private calculateDailyAggregations(date: string): Aggregations {
    const dayStart = new Date(date).getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;

    const batchesForDay = this.telemetry.batches.filter(b => {
      const ts = new Date(b.started_at).getTime();
      return ts >= dayStart && ts < dayEnd;
    });

    const operationsForDay = this.telemetry.operations.filter(o => {
      const ts = new Date(o.started_at).getTime();
      return ts >= dayStart && ts < dayEnd;
    });

    const point: TimeseriesPoint = {
      timestamp: date,
      batches: batchesForDay.length,
      operations: operationsForDay.length,
      tokens: operationsForDay.reduce((sum, o) => sum + o.tokens_used, 0),
      success_rate: calcSuccessRate(
        operationsForDay.filter(o => o.status === 'success').length,
        operationsForDay.length
      ),
    };

    return {
      hourly: [],
      daily: [point],
      by_operation_type: aggregateByType(operationsForDay),
      by_agent_type: {},
      token_trend: { direction: 'stable', change_percent: 0, period: '7d' },
      success_trend: { direction: 'stable', change_percent: 0, period: '7d' },
      duration_trend: { direction: 'stable', change_percent: 0, period: '7d' },
    };
  }

  // =========================================================================
  // File System Helpers
  // =========================================================================

  private getAbsolutePath(relativePath: string): string {
    return path.join(this.projectRoot, relativePath);
  }

  private async ensureTelemetryDir(): Promise<void> {
    const dirs = [
      TELEMETRY_PATHS.TELEMETRY_DIR,
      TELEMETRY_PATHS.HISTORY_DIR,
    ];

    for (const dir of dirs) {
      const absPath = this.getAbsolutePath(dir);
      try {
        await fs.mkdir(absPath, { recursive: true });
      } catch {
        // Directory may already exist
      }
    }
  }

  private async readCurrentSession(): Promise<SessionMetrics | null> {
    const absPath = this.getAbsolutePath(TELEMETRY_PATHS.CURRENT_SESSION);
    try {
      const content = await fs.readFile(absPath, 'utf-8');
      return JSON.parse(content) as SessionMetrics;
    } catch {
      return null;
    }
  }

  private async writeCurrentSession(metrics: SessionMetrics): Promise<void> {
    const absPath = this.getAbsolutePath(TELEMETRY_PATHS.CURRENT_SESSION);
    await fs.writeFile(absPath, JSON.stringify(metrics, null, 2), 'utf-8');
  }

  private async readAggregations(): Promise<Aggregations | null> {
    const absPath = this.getAbsolutePath(TELEMETRY_PATHS.AGGREGATIONS);
    try {
      const content = await fs.readFile(absPath, 'utf-8');
      return JSON.parse(content) as Aggregations;
    } catch {
      return null;
    }
  }

  private async writeAggregations(aggregations: Aggregations): Promise<void> {
    const absPath = this.getAbsolutePath(TELEMETRY_PATHS.AGGREGATIONS);
    await fs.writeFile(absPath, JSON.stringify(aggregations, null, 2), 'utf-8');
  }

  private async writeHistory(date: string, aggregations: Aggregations): Promise<void> {
    const absPath = this.getAbsolutePath(getHistoryPath(date));
    await fs.writeFile(absPath, JSON.stringify(aggregations, null, 2), 'utf-8');
  }
}

/**
 * Create a new TelemetryCollector instance
 */
export function createTelemetryCollector(projectRoot?: string): TelemetryAPI {
  return new TelemetryCollectorImpl(projectRoot);
}

/**
 * Singleton telemetry collector instance
 */
let globalTelemetryCollector: TelemetryAPI | null = null;

/**
 * Get the global TelemetryCollector instance
 */
export function getTelemetryCollector(projectRoot?: string): TelemetryAPI {
  if (!globalTelemetryCollector) {
    globalTelemetryCollector = createTelemetryCollector(projectRoot);
  }
  return globalTelemetryCollector;
}

/**
 * Reset the global TelemetryCollector (useful for testing)
 */
export function resetGlobalTelemetryCollector(): void {
  globalTelemetryCollector = null;
}
