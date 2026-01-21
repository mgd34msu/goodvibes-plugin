/**
 * Recovery Integration interfaces for Batch Engine
 * @see SPEC-v2 Section 11
 */

import type { Checkpoint, CheckpointSystem, CheckpointConfig } from './checkpoint.js';
import type { FixLoop, FixResult, FixContext, FixableError } from './fix-loop.js';
import type { RollbackSystem, RollbackResult, RollbackTarget } from './rollback.js';
import type { Batch, BatchConfig } from './batch.js';
import type { BatchResult, OperationResult } from './result.js';

/**
 * Recovery mode configuration
 * - none: No recovery - fail immediately
 * - checkpoint: Checkpoint only - manual recovery
 * - auto_rollback: Automatic rollback on failure
 * - fix_loop: Attempt fix loop before rollback
 * - full: Fix loop + rollback as fallback
 */
export type RecoveryMode =
  | 'none'
  | 'checkpoint'
  | 'auto_rollback'
  | 'fix_loop'
  | 'full';

/**
 * Recovery event types for event handling
 */
export type RecoveryEvent =
  | 'checkpoint_created'
  | 'checkpoint_restored'
  | 'fix_started'
  | 'fix_succeeded'
  | 'fix_failed'
  | 'rollback_started'
  | 'rollback_succeeded'
  | 'rollback_failed';

/**
 * Recovery event handler function signature
 */
export interface RecoveryEventHandler {
  (event: RecoveryEvent, data: RecoveryEventData): void;
}

/**
 * Data passed to recovery event handlers
 */
export interface RecoveryEventData {
  /** The event type that triggered this handler */
  event: RecoveryEvent;
  /** ISO timestamp when the event occurred */
  timestamp: string;
  /** Associated batch ID (if applicable) */
  batch_id?: string;
  /** Associated operation ID (if applicable) */
  operation_id?: string;
  /** Checkpoint ID (for checkpoint events) */
  checkpoint_id?: string;
  /** Error that triggered recovery (if applicable) */
  error?: FixableError;
  /** Result of the recovery action (if completed) */
  result?: FixResult | RollbackResult;
}

/**
 * Recovery context - full context for recovery operations
 * Provides all information needed to make recovery decisions
 */
export interface RecoveryContext {
  /** The batch being recovered */
  batch: Batch;
  /** Current batch result */
  result: BatchResult;
  /** List of failed operations that need recovery */
  failed_operations: OperationResult[];
  /** Checkpoint to restore to (if available) */
  checkpoint?: Checkpoint;
  /** Current recovery mode */
  mode: RecoveryMode;
  /** Maximum fix attempts allowed */
  max_fix_attempts: number;
}

/**
 * Recovery action to take
 * Represents a specific action the recovery system should execute
 */
export interface RecoveryAction {
  /** Type of action to take */
  type: 'fix' | 'rollback' | 'abort' | 'continue' | 'ask_user';
  /** Human-readable reason for this action */
  reason: string;
  /** Additional data for the action (action-specific) */
  data?: unknown;
}

/**
 * Recovery decision - what the system decided to do
 * Records the decision-making process for auditability
 */
export interface RecoveryDecision {
  /** The action to take */
  action: RecoveryAction;
  /** Context that led to this decision */
  context: RecoveryContext;
  /** ISO timestamp when decision was made */
  decided_at: string;
  /** What determined this decision */
  decided_by: 'mode_config' | 'error_type' | 'user_request';
}

/**
 * Recovery orchestrator - main integration point
 * Coordinates between checkpoint, fix-loop, and rollback systems
 */
export interface RecoveryOrchestrator {
  // Components
  /** Checkpoint system for creating/restoring checkpoints */
  checkpoint: CheckpointSystem;
  /** Fix loop for attempting automatic fixes */
  fixLoop: FixLoop;
  /** Rollback system for reverting changes */
  rollback: RollbackSystem;

  // Configuration
  /** Current recovery mode */
  mode: RecoveryMode;

  /**
   * Prepare batch for recovery (create checkpoint)
   * @param batch - The batch to prepare
   * @param config - Batch configuration
   * @returns Created checkpoint or null if not needed
   */
  prepareBatch(batch: Batch, config: BatchConfig): Promise<Checkpoint | null>;

  /**
   * Handle operation failure
   * Decides what recovery action to take for a failed operation
   * @param context - Recovery context with failure details
   * @returns Decision about what action to take
   */
  handleOperationFailure(context: RecoveryContext): Promise<RecoveryDecision>;

  /**
   * Handle batch failure
   * Executes full recovery flow for batch-level failure
   * @param context - Recovery context with failure details
   * @returns Result of recovery attempt
   */
  handleBatchFailure(context: RecoveryContext): Promise<RecoveryResult>;

  /**
   * Execute recovery action
   * Performs the specified recovery action
   * @param action - The action to execute
   * @param context - Recovery context
   * @returns Result of the recovery action
   */
  executeAction(action: RecoveryAction, context: RecoveryContext): Promise<RecoveryResult>;

  /**
   * Register event handler
   * @param event - Event type to handle
   * @param handler - Handler function
   */
  on(event: RecoveryEvent, handler: RecoveryEventHandler): void;

  /**
   * Unregister event handler
   * @param event - Event type
   * @param handler - Handler function to remove
   */
  off(event: RecoveryEvent, handler: RecoveryEventHandler): void;
}

/**
 * Result of recovery operation
 */
export interface RecoveryResult {
  /** Whether recovery succeeded */
  success: boolean;
  /** The action that was taken */
  action_taken: RecoveryAction;
  /** Fix result (if fix was attempted) */
  fix_result?: FixResult;
  /** Rollback result (if rollback was performed) */
  rollback_result?: RollbackResult;
  /** Checkpoint ID that was restored (if any) */
  checkpoint_restored?: string;
  /** Total duration of recovery in milliseconds */
  duration_ms: number;
  /** Error message if recovery failed */
  error?: string;
}

/**
 * Recovery history entry
 * Records recovery attempts for analysis and debugging
 */
export interface RecoveryHistoryEntry {
  /** Unique identifier for this history entry */
  id: string;
  /** Associated batch ID */
  batch_id: string;
  /** ISO timestamp of recovery attempt */
  timestamp: string;
  /** Context at time of recovery */
  context: RecoveryContext;
  /** Decision that was made */
  decision: RecoveryDecision;
  /** Result of recovery attempt */
  result: RecoveryResult;
}

/**
 * Recovery statistics
 * Aggregated metrics for recovery operations
 */
export interface RecoveryStats {
  /** Total number of recovery attempts */
  total_recoveries: number;
  /** Number of successful fix attempts */
  successful_fixes: number;
  /** Number of successful rollbacks */
  successful_rollbacks: number;
  /** Number of failed recovery attempts */
  failed_recoveries: number;
  /** Average number of fix attempts before success/failure */
  avg_fix_attempts: number;
  /** Average recovery duration in milliseconds */
  avg_recovery_duration_ms: number;
  /** Statistics broken down by error type */
  by_error_type: Record<string, { count: number; success_rate: number }>;
}

/**
 * Recovery configuration (part of BatchConfig.recovery)
 * Configures recovery behavior for batch execution
 */
export interface RecoveryConfig {
  /** Recovery mode to use */
  mode: RecoveryMode;
  /** Create checkpoint before batch starts */
  checkpoint_before_batch: boolean;
  /** Create checkpoint before risky operations */
  checkpoint_before_risky: boolean;
  /** Maximum fix attempts before giving up */
  max_fix_attempts: number;
  /** Timeout for fix attempts in milliseconds */
  fix_timeout_ms: number;
  /** Rollback if fix loop fails */
  rollback_on_fix_failure: boolean;
  /** Keep recovery history */
  keep_history: boolean;
}

/**
 * Default recovery configuration
 * Sensible defaults for most use cases
 */
export const DEFAULT_RECOVERY_CONFIG: RecoveryConfig = {
  mode: 'fix_loop',
  checkpoint_before_batch: true,
  checkpoint_before_risky: true,
  max_fix_attempts: 3,
  fix_timeout_ms: 60000,
  rollback_on_fix_failure: true,
  keep_history: true,
};

/**
 * History filter options
 */
export interface RecoveryHistoryFilter {
  /** Filter by batch ID */
  batch_id?: string;
  /** Filter by success/failure */
  success?: boolean;
  /** Maximum number of entries to return */
  limit?: number;
}

/**
 * Recovery manager - full lifecycle management
 * Extends orchestrator with history, stats, and lifecycle management
 */
export interface RecoveryManager extends RecoveryOrchestrator {
  /** Current configuration */
  config: RecoveryConfig;
  /** Recovery history */
  history: RecoveryHistoryEntry[];
  /** Aggregated statistics */
  stats: RecoveryStats;

  /**
   * Initialize the recovery manager
   * Sets up components, loads history, resets stats
   */
  initialize(): Promise<void>;

  /**
   * Shutdown the recovery manager
   * Persists state, cleans up resources
   */
  shutdown(): Promise<void>;

  /**
   * Get recovery history with optional filtering
   * @param filter - Optional filter criteria
   * @returns Filtered history entries
   */
  getHistory(filter?: RecoveryHistoryFilter): RecoveryHistoryEntry[];

  /**
   * Clear all recovery history
   */
  clearHistory(): void;

  /**
   * Get current recovery statistics
   * @returns Aggregated statistics
   */
  getStats(): RecoveryStats;

  /**
   * Reset all statistics
   */
  resetStats(): void;
}
