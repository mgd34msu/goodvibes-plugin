/**
 * batch Tool interfaces for Batch Engine
 * @see SPEC-v2 Section 13.3
 */

import type { Batch, BatchConfig } from '../batch.js';
import type { BatchResult } from '../result.js';
import type { AnyDiscoveryQuery } from './discover.js';

// Execution phases
export type BatchPhase = 'discovery' | 'read' | 'write' | 'exec' | 'query' | 'state';

// Phase execution order
export const PHASE_ORDER: BatchPhase[] = ['discovery', 'read', 'write', 'exec', 'query', 'state'];

// Batch tool input
export interface BatchToolInput {
  // Optional discovery phase
  discovery?: {
    queries: AnyDiscoveryQuery[];
    inject_results?: boolean;         // Inject into operation context
  };

  // Operations by phase
  operations?: {
    read?: import('../operations/read.js').ReadOperation[];
    write?: import('../operations/write.js').WriteOperation[];
    exec?: import('../operations/exec.js').ExecOperation[];
    query?: import('../operations/exec.js').QueryOperation[];
    state?: import('../operations/exec.js').StateOperation[];
  };

  // Configuration
  config?: Partial<BatchConfig>;

  // Execution control
  dry_run?: boolean;
  preview?: boolean;
  timeout_ms?: number;
}

// Batch tool output
export interface BatchToolOutput {
  batch_id: string;
  status: 'success' | 'partial' | 'failed' | 'rolled_back' | 'dry_run';
  result?: BatchResult;
  preview?: BatchPreview;
  errors?: BatchError[];
  duration_ms: number;
  tokens_used: number;
}

// Preview of what batch would do
export interface BatchPreview {
  phases: PhasePreview[];
  total_operations: number;
  estimated_tokens: number;
  estimated_duration_ms: number;
  files_affected: string[];
  commands_to_run: string[];
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  risk_factors: string[];
}

export interface PhasePreview {
  phase: BatchPhase;
  operations: OperationPreview[];
  parallel_groups: string[][];
}

export interface OperationPreview {
  id: string;
  type: string;
  description: string;
  targets?: string[];
  estimated_tokens: number;
}

// Batch error
export interface BatchError {
  phase: BatchPhase;
  operation_id?: string;
  code: string;
  message: string;
  recoverable: boolean;
  details?: unknown;
}

// Batch execution context
export interface BatchExecutionContext {
  batch: Batch;
  current_phase: BatchPhase;
  completed_phases: BatchPhase[];
  discovery_results?: Record<string, unknown>;
  phase_results: Record<BatchPhase, unknown>;
  start_time: string;
  checkpoint_id?: string;
}

// Batch tool interface
export interface BatchTool {
  name: 'batch';
  execute(input: BatchToolInput): Promise<BatchToolOutput>;
  preview(input: BatchToolInput): Promise<BatchPreview>;
  cancel(batch_id: string): Promise<boolean>;
  getStatus(batch_id: string): BatchExecutionContext | undefined;
}

// Batch execution options
export interface BatchExecutionOptions {
  validate_before: boolean;
  validate_after: boolean;
  create_checkpoint: boolean;
  rollback_on_failure: boolean;
  parallel_execution: boolean;
  max_parallel_operations: number;
}

export const DEFAULT_EXECUTION_OPTIONS: BatchExecutionOptions = {
  validate_before: true,
  validate_after: true,
  create_checkpoint: true,
  rollback_on_failure: true,
  parallel_execution: true,
  max_parallel_operations: 10
};
