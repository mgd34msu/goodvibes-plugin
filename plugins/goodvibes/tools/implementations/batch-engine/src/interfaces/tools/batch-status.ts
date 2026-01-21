/**
 * batch_status Tool interfaces for Batch Engine
 * @see SPEC-v2 Section 13.4
 */

import type { BatchPhase } from './batch-tool.js';
import type { BatchResult } from '../result.js';
import type { BatchMetrics } from '../telemetry.js';

// === Status Input ===

export interface BatchStatusInput {
  batch_id: string;
  include?: {
    results?: boolean;                // Include full results
    telemetry?: boolean;              // Include telemetry data
    operations?: boolean;             // Include operation details
    agents?: boolean;                 // Include agent status
  };
}

// === Status Output ===

export interface BatchStatusOutput {
  batch_id: string;
  status: BatchStatus;
  progress: BatchProgress;
  duration_ms: number;
  tokens_used: number;

  // Optional based on include flags
  results?: BatchResult;
  telemetry?: BatchMetrics;
  operations?: OperationStatus[];
  agents?: AgentStatus[];
}

// === Overall Batch Status ===

export type BatchStatus =
  | 'pending'           // Not started
  | 'running'           // In progress
  | 'paused'            // Temporarily paused
  | 'completing'        // Finishing up
  | 'completed'         // Successfully completed
  | 'failed'            // Failed
  | 'rolled_back'       // Failed and rolled back
  | 'cancelled';        // Manually cancelled

// === Progress Information ===

export interface BatchProgress {
  current_phase: BatchPhase;
  completed_phases: BatchPhase[];
  pending_phases: BatchPhase[];

  operations_total: number;
  operations_completed: number;
  operations_failed: number;
  operations_pending: number;

  percent_complete: number;
  estimated_remaining_ms?: number;
}

// === Individual Operation Status ===

export interface OperationStatus {
  id: string;
  type: string;
  phase: BatchPhase;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
  tokens_used?: number;
  error?: string;
}

// === Agent Status Within Batch ===

export interface AgentStatus {
  agent_id: string;
  operation_id: string;
  agent_type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  tokens_used: number;
  turns_used: number;
  started_at?: string;
  completed_at?: string;
}

// === Batch Status Tool Interface ===

export interface BatchStatusTool {
  name: 'batch_status';
  execute(input: BatchStatusInput): Promise<BatchStatusOutput>;

  // Convenience methods
  getStatus(batch_id: string): BatchStatus;
  getProgress(batch_id: string): BatchProgress;
  isComplete(batch_id: string): boolean;
  isFailed(batch_id: string): boolean;
}

// === Batch History Entry ===

export interface BatchHistoryEntry {
  batch_id: string;
  started_at: string;
  completed_at?: string;
  status: BatchStatus;
  operations_count: number;
  tokens_used: number;
  duration_ms: number;
}

// === List Batches Input ===

export interface ListBatchesInput {
  status?: BatchStatus[];
  limit?: number;
  since?: string;                     // ISO timestamp
  until?: string;                     // ISO timestamp
}

// === List Batches Output ===

export interface ListBatchesOutput {
  batches: BatchHistoryEntry[];
  total: number;
  has_more: boolean;
}
