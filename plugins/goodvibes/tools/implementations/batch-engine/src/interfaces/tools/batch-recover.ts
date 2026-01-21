/**
 * batch_recover Tool interfaces for Batch Engine
 * @see SPEC-v2 Section 13.5
 */

import type { RollbackResult, RollbackScope } from '../rollback.js';
import type { Checkpoint } from '../checkpoint.js';
import type { FixResult } from '../fix-loop.js';

// ============================================================================
// Recovery Operation Types
// ============================================================================

/**
 * Types of recovery operations supported by batch_recover
 * - rollback: Revert changes to a previous state
 * - restore: Restore from a specific checkpoint
 * - retry: Retry failed operations
 * - cleanup: Clean up old checkpoints and free resources
 * - fix: Attempt to fix failed operations
 */
export type RecoveryOperation = 'rollback' | 'restore' | 'retry' | 'cleanup' | 'fix';

// ============================================================================
// Recovery Input
// ============================================================================

/**
 * Input for batch_recover tool
 * Supports multiple recovery operations with operation-specific options
 */
export interface BatchRecoverInput {
  /** The recovery operation to perform */
  operation: RecoveryOperation;

  /**
   * Rollback options
   * For operation: 'rollback'
   */
  rollback?: {
    /** Rollback a specific batch by ID */
    batch_id?: string;
    /** Rollback to a specific checkpoint */
    checkpoint_id?: string;
    /** Scope of what to rollback */
    scope?: RollbackScope;
    /** Specific files for selective rollback */
    files?: string[];
    /** Specific state keys for selective rollback */
    state_keys?: string[];
  };

  /**
   * Restore options
   * For operation: 'restore'
   */
  restore?: {
    /** ID of the checkpoint to restore from (required) */
    checkpoint_id: string;
    /** Only restore files, not state */
    files_only?: boolean;
    /** Only restore state, not files */
    state_only?: boolean;
  };

  /**
   * Retry options
   * For operation: 'retry'
   */
  retry?: {
    /** ID of the batch to retry (required) */
    batch_id: string;
    /** Specific operation IDs to retry (default: all failed) */
    operation_ids?: string[];
    /** Maximum retry attempts per operation */
    max_attempts?: number;
  };

  /**
   * Cleanup options
   * For operation: 'cleanup'
   */
  cleanup?: {
    /** Remove checkpoints older than this many hours */
    older_than_hours?: number;
    /** Keep the last N checkpoints regardless of age */
    keep_last?: number;
    /** Preview cleanup without actually deleting */
    dry_run?: boolean;
  };

  /**
   * Fix options
   * For operation: 'fix'
   */
  fix?: {
    /** ID of the batch containing failures (required) */
    batch_id: string;
    /** Specific operation ID to fix */
    operation_id?: string;
    /** Fix strategy to use */
    strategy?: 'auto' | 'agent' | 'targeted';
    /** Maximum fix attempts */
    max_attempts?: number;
  };
}

// ============================================================================
// Restore Operation Output
// ============================================================================

/**
 * Result of a restore operation
 */
export interface RestoreOutput {
  /** ID of the checkpoint that was restored */
  checkpoint_id: string;
  /** List of files that were successfully restored */
  files_restored: string[];
  /** List of state keys that were successfully restored */
  state_restored: string[];
  /** List of files that failed to restore */
  files_failed: string[];
  /** List of state keys that failed to restore */
  state_failed: string[];
}

// ============================================================================
// Retry Operation Output
// ============================================================================

/**
 * Result of a retry operation
 */
export interface RetryOutput {
  /** ID of the batch that was retried */
  batch_id: string;
  /** Number of operations that were retried */
  operations_retried: number;
  /** Number of operations that succeeded on retry */
  operations_succeeded: number;
  /** Number of operations that still failed after retry */
  operations_failed: number;
  /** ID of the new batch created for retries (if applicable) */
  new_batch_id?: string;
}

// ============================================================================
// Cleanup Operation Output
// ============================================================================

/**
 * Result of a cleanup operation
 */
export interface CleanupOutput {
  /** Number of checkpoints removed */
  checkpoints_removed: number;
  /** Total bytes freed by cleanup */
  bytes_freed: number;
  /** Number of checkpoints remaining after cleanup */
  checkpoints_remaining: number;
  /** Number of items skipped (e.g., protected checkpoints) */
  items_skipped: number;
  /** Errors encountered during cleanup (if any) */
  errors?: string[];
}

// ============================================================================
// Recovery Output
// ============================================================================

/**
 * Output from batch_recover tool
 * Contains operation-specific results
 */
export interface BatchRecoverOutput {
  /** The operation that was performed */
  operation: RecoveryOperation;
  /** Whether the operation succeeded */
  success: boolean;

  /** Result of rollback operation (when operation: 'rollback') */
  rollback_result?: RollbackResult;
  /** Result of restore operation (when operation: 'restore') */
  restore_result?: RestoreOutput;
  /** Result of retry operation (when operation: 'retry') */
  retry_result?: RetryOutput;
  /** Result of cleanup operation (when operation: 'cleanup') */
  cleanup_result?: CleanupOutput;
  /** Result of fix operation (when operation: 'fix') */
  fix_result?: FixResult;

  /** Duration of the operation in milliseconds */
  duration_ms: number;
  /** Error message if the operation failed */
  error?: string;
}

// ============================================================================
// Checkpoint Listing
// ============================================================================

/**
 * Input for listing available checkpoints
 */
export interface ListCheckpointsInput {
  /** Filter by batch ID */
  batch_id?: string;
  /** Maximum number of checkpoints to return */
  limit?: number;
  /** Include expired checkpoints in results */
  include_expired?: boolean;
}

/**
 * Output from listing checkpoints
 */
export interface ListCheckpointsOutput {
  /** List of checkpoint summaries */
  checkpoints: CheckpointSummary[];
  /** Total number of checkpoints matching the filter */
  total: number;
}

/**
 * Summary information about a checkpoint
 * Lighter than full Checkpoint for listing purposes
 */
export interface CheckpointSummary {
  /** Unique checkpoint ID */
  id: string;
  /** Associated batch ID (if applicable) */
  batch_id?: string;
  /** ISO timestamp when checkpoint was created */
  created_at: string;
  /** ISO timestamp when checkpoint expires (if applicable) */
  expires_at?: string;
  /** Size of checkpoint data in bytes */
  size_bytes: number;
  /** Number of files in the checkpoint */
  file_count: number;
  /** Reason for checkpoint creation */
  reason: string;
}

// ============================================================================
// Batch Recover Tool Interface
// ============================================================================

/**
 * batch_recover tool interface
 * Main entry point for all recovery operations
 */
export interface BatchRecoverTool {
  /** Tool name identifier */
  name: 'batch_recover';

  /**
   * Execute a recovery operation
   * @param input - Recovery operation input
   * @returns Recovery operation output
   */
  execute(input: BatchRecoverInput): Promise<BatchRecoverOutput>;

  // -------------------------------------------------------------------------
  // Convenience Methods
  // -------------------------------------------------------------------------

  /**
   * Rollback the most recent batch
   * Convenience method for quick rollback
   * @returns Rollback result
   */
  rollbackLastBatch(): Promise<RollbackResult>;

  /**
   * Restore from a specific checkpoint
   * Convenience method for checkpoint restoration
   * @param checkpoint_id - ID of checkpoint to restore
   * @returns Restore operation output
   */
  restoreCheckpoint(checkpoint_id: string): Promise<RestoreOutput>;

  /**
   * Retry all failed operations in a batch
   * Convenience method for retrying failures
   * @param batch_id - ID of batch to retry
   * @returns Retry operation output
   */
  retryFailed(batch_id: string): Promise<RetryOutput>;

  /**
   * List available checkpoints
   * @param input - Optional filter criteria
   * @returns List of checkpoint summaries
   */
  listCheckpoints(input?: ListCheckpointsInput): Promise<ListCheckpointsOutput>;

  /**
   * Clean up old checkpoints
   * Convenience method for freeing resources
   * @param older_than_hours - Remove checkpoints older than this
   * @returns Cleanup operation output
   */
  cleanupOld(older_than_hours: number): Promise<CleanupOutput>;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a value is a valid RecoveryOperation
 */
export function isRecoveryOperation(value: unknown): value is RecoveryOperation {
  return (
    typeof value === 'string' &&
    ['rollback', 'restore', 'retry', 'cleanup', 'fix'].includes(value)
  );
}

/**
 * Check if input has valid rollback options
 */
export function hasRollbackOptions(
  input: BatchRecoverInput
): input is BatchRecoverInput & { rollback: NonNullable<BatchRecoverInput['rollback']> } {
  return input.operation === 'rollback' && input.rollback !== undefined;
}

/**
 * Check if input has valid restore options
 */
export function hasRestoreOptions(
  input: BatchRecoverInput
): input is BatchRecoverInput & { restore: NonNullable<BatchRecoverInput['restore']> } {
  return input.operation === 'restore' && input.restore !== undefined;
}

/**
 * Check if input has valid retry options
 */
export function hasRetryOptions(
  input: BatchRecoverInput
): input is BatchRecoverInput & { retry: NonNullable<BatchRecoverInput['retry']> } {
  return input.operation === 'retry' && input.retry !== undefined;
}

/**
 * Check if input has valid cleanup options
 */
export function hasCleanupOptions(
  input: BatchRecoverInput
): input is BatchRecoverInput & { cleanup: NonNullable<BatchRecoverInput['cleanup']> } {
  return input.operation === 'cleanup' && input.cleanup !== undefined;
}

/**
 * Check if input has valid fix options
 */
export function hasFixOptions(
  input: BatchRecoverInput
): input is BatchRecoverInput & { fix: NonNullable<BatchRecoverInput['fix']> } {
  return input.operation === 'fix' && input.fix !== undefined;
}

// ============================================================================
// Factory Types
// ============================================================================

/**
 * Dependencies required to create a BatchRecoverTool
 */
export interface BatchRecoverToolDependencies {
  /** Checkpoint system for restore and list operations */
  checkpointSystem: {
    get(id: string): Checkpoint | undefined;
    list(filter?: { batch_id?: string; limit?: number }): Checkpoint[];
    restore(id: string, options?: { files_only?: boolean; state_only?: boolean }): Promise<{
      success: boolean;
      files_restored: string[];
      state_restored: string[];
      errors?: string[];
    }>;
    cleanup(): { removed: number; freed_bytes: number; remaining: number; errors?: string[] };
  };

  /** Rollback system for rollback operations */
  rollbackSystem: {
    lastBatch(): Promise<RollbackResult>;
    toCheckpoint(id: string, scope?: RollbackScope): Promise<RollbackResult>;
    selective(options: {
      files?: string[];
      state_keys?: string[];
      to_batch?: string;
      to_checkpoint?: string;
    }): Promise<RollbackResult>;
  };

  /** Fix loop for fix operations */
  fixLoop: {
    run(context: unknown): Promise<FixResult>;
  };

  /** Batch registry for retry operations */
  batchRegistry: {
    get(id: string): { id: string; operations: { id: string; status: string }[] } | undefined;
    createRetryBatch(original_batch_id: string, operation_ids: string[]): Promise<string>;
  };
}

/**
 * Factory function type for creating BatchRecoverTool instances
 */
export type CreateBatchRecoverTool = (
  dependencies: BatchRecoverToolDependencies
) => BatchRecoverTool;
