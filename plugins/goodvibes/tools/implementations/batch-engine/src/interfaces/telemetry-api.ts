/**
 * Telemetry API interfaces for Batch Engine
 * @see SPEC-v2 Sections 9.3-9.4
 */

import type { SessionMetrics, BatchMetrics, Aggregations } from './telemetry.js';
import type { Batch } from './batch.js';
import type { OperationResult, BatchResult } from './result.js';

export interface Bottleneck {
  type: 'operation' | 'agent' | 'validation';
  id: string;
  description: string;
  impact_ms: number;
  suggestion: string;
}

export interface TelemetryAPI {
  // Recording
  recordBatchStart(batch: Batch): void;
  recordBatchComplete(batch_id: string, result: BatchResult): void;
  recordOperationStart(operation: import('./operation.js').OperationBase): void;
  recordOperationComplete(operation_id: string, result: OperationResult): void;
  recordAgentStart(agent: import('./operations/exec.js').AgentSpec): void;
  recordAgentComplete(agent_id: string, result: import('./state-api.js').AgentResult): void;

  // Querying
  getSessionMetrics(): SessionMetrics;
  getBatchMetrics(batch_id: string): BatchMetrics;
  getAggregations(period?: string): Aggregations;

  // Analysis
  estimateCost(tokens: number): number;
  projectTokenUsage(batches: number): number;
  identifyBottlenecks(): Bottleneck[];

  // Export
  exportReport(format: 'json' | 'markdown' | 'csv'): string;
}

export type ModelType = 'haiku' | 'sonnet' | 'opus';

export const TOKEN_COSTS = {
  input: {
    haiku: 0.25,
    sonnet: 3.00,
    opus: 15.00
  },
  output: {
    haiku: 1.25,
    sonnet: 15.00,
    opus: 75.00
  }
} as const;

export function estimateCost(metrics: SessionMetrics, model: ModelType = 'sonnet'): number {
  const inputCost = (metrics.total_tokens * 0.3) * TOKEN_COSTS.input[model] / 1_000_000;
  const outputCost = (metrics.total_tokens * 0.7) * TOKEN_COSTS.output[model] / 1_000_000;
  return inputCost + outputCost;
}
