/**
 * Rollback System interfaces for Batch Engine
 * @see SPEC-v2 Section 11.4
 */

import type { Checkpoint } from './state.js';

// Rollback scope - what to rollback
export type RollbackScope = 'all' | 'files' | 'state' | 'selective';

// Rollback target - what point to rollback to
export type RollbackTarget =
  | { type: 'checkpoint'; checkpoint_id: string }
  | { type: 'batch'; batch_id: string }
  | { type: 'time'; timestamp: string }
  | { type: 'operations'; operation_ids: string[] };

// Options for selective rollback
export interface SelectiveRollbackOptions {
  files?: string[];           // Specific files to rollback
  state_keys?: string[];      // Specific state keys to rollback
  to_batch?: string;          // Rollback to state before this batch
  to_checkpoint?: string;     // Rollback to specific checkpoint
  to_time?: string;           // Rollback to point in time
  exclude_files?: string[];   // Files to exclude from rollback
  exclude_state?: string[];   // State keys to exclude
}

// Result of rollback operation
export interface RollbackResult {
  success: boolean;
  scope: RollbackScope;
  target: RollbackTarget;
  files_restored: string[];
  files_failed: string[];
  state_restored: string[];
  state_failed: string[];
  duration_ms: number;
  checkpoint_used?: string;
  errors?: string[];
}

// Rollback preview (dry run result)
export interface RollbackPreview {
  files_to_restore: {
    path: string;
    current_hash: string;
    target_hash: string;
    change_type: 'modified' | 'deleted' | 'created';
  }[];
  state_to_restore: {
    key: string;
    current_value: unknown;
    target_value: unknown;
  }[];
  warnings: string[];
  estimated_duration_ms: number;
}

// Rollback System API
export interface RollbackSystem {
  // Rollback to a specific checkpoint
  toCheckpoint(checkpoint_id: string, scope?: RollbackScope): Promise<RollbackResult>;

  // Rollback the last batch
  lastBatch(): Promise<RollbackResult>;

  // Rollback specific operations
  operations(operation_ids: string[]): Promise<RollbackResult>;

  // Selective rollback with options
  selective(options: SelectiveRollbackOptions): Promise<RollbackResult>;

  // Preview a rollback without executing
  preview(target: RollbackTarget, scope?: RollbackScope): Promise<RollbackPreview>;

  // Check if rollback is possible
  canRollback(target: RollbackTarget): boolean;
}

// Rollback manager with full lifecycle
export interface RollbackManager extends RollbackSystem {
  // Get available rollback points
  getAvailableTargets(): RollbackTarget[];

  // Get the most recent checkpoint
  getLatestCheckpoint(): Checkpoint | undefined;

  // Create a rollback plan
  createPlan(target: RollbackTarget, options?: SelectiveRollbackOptions): RollbackPlan;

  // Execute a rollback plan
  executePlan(plan: RollbackPlan): Promise<RollbackResult>;
}

// Rollback plan - pre-computed steps
export interface RollbackPlan {
  id: string;
  target: RollbackTarget;
  scope: RollbackScope;
  steps: RollbackStep[];
  estimated_duration_ms: number;
  created_at: string;
  valid_until: string;  // Plan expires if state changes
}

// Individual step in a rollback plan
export interface RollbackStep {
  order: number;
  type: 'restore_file' | 'restore_state' | 'delete_file' | 'run_command';
  target: string;
  source?: string;
  description: string;
}

// Rollback history entry
export interface RollbackHistoryEntry {
  id: string;
  timestamp: string;
  target: RollbackTarget;
  scope: RollbackScope;
  result: RollbackResult;
  triggered_by: 'automatic' | 'manual' | 'fix_loop';
}

// Rollback configuration
export interface RollbackConfig {
  auto_rollback_on_error: boolean;      // Auto-rollback on batch failure
  keep_rollback_history: boolean;       // Keep history of rollbacks
  max_history_entries: number;          // Max history entries to keep
  require_checkpoint: boolean;          // Require checkpoint before rollback
}
