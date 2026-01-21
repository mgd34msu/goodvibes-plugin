/**
 * Checkpoint System interfaces for Batch Engine
 * @see SPEC-v2 Section 11.1
 */

/**
 * Type of checkpoint creation trigger
 * - automatic: Created per batch by the system
 * - manual: Created by user request
 */
export type CheckpointType = 'automatic' | 'manual';

/**
 * Reason for checkpoint creation
 * - batch_start: Automatic checkpoint at batch start
 * - before_risky_operation: Pre-emptive checkpoint before destructive operations
 * - manual_request: User explicitly requested checkpoint
 * - scheduled: Created on a schedule (e.g., time-based)
 */
export type CheckpointReason =
  | 'batch_start'
  | 'before_risky_operation'
  | 'manual_request'
  | 'scheduled';

/**
 * Configuration for creating a new checkpoint
 */
export interface CheckpointConfig {
  /** Associated batch ID (optional for manual checkpoints) */
  batch_id?: string;

  /** Reason for creating this checkpoint */
  reason: CheckpointReason;

  /** Type of checkpoint */
  type: CheckpointType;

  /** Selective inclusion options */
  include?: {
    /** Specific files to include (default: affected files) */
    files?: string[];
    /** State keys to include (default: all) */
    state?: string[];
    /** Include memory snapshot (default: true) */
    memory?: boolean;
  };

  /** Auto-cleanup time in hours (default: 24) */
  expires_after_hours?: number;
}

/**
 * File entry in a checkpoint
 */
export interface CheckpointFile {
  /** Absolute path to the file */
  path: string;
  /** Content hash for integrity verification */
  hash: string;
}

/**
 * Memory snapshot summary for checkpoint
 */
export interface MemorySnapshot {
  /** Number of decisions captured */
  decisions: number;
  /** Number of patterns captured */
  patterns: number;
  /** Number of failures captured */
  failures: number;
}

/**
 * Stored checkpoint data
 */
export interface Checkpoint {
  /** Unique identifier in cp_YYYYMMDD_HHMMSS format */
  id: string;

  /** Associated batch ID (if applicable) */
  batch_id?: string;

  /** ISO timestamp of creation */
  created_at: string;

  /** ISO timestamp of expiration (for auto-cleanup) */
  expires_at?: string;

  /** Type of checkpoint */
  type: CheckpointType;

  /** Reason for creation */
  reason: CheckpointReason;

  /** Files included in this checkpoint */
  files: CheckpointFile[];

  /** Snapshot of state at checkpoint time */
  state_snapshot: Record<string, unknown>;

  /** Summary of memory state at checkpoint time */
  memory_snapshot?: MemorySnapshot;

  /** Total size of checkpoint data in bytes */
  size_bytes: number;
}

/**
 * Options for restore operation
 */
export interface RestoreOptions {
  /** Only restore files, not state */
  files_only?: boolean;

  /** Only restore state, not files */
  state_only?: boolean;

  /** Only restore specific files (paths) */
  specific_files?: string[];

  /** Only restore specific state keys */
  specific_state?: string[];

  /** Preview restore without applying changes */
  dry_run?: boolean;
}

/**
 * Result of restoring a checkpoint
 */
export interface RestoreResult {
  /** Whether the restore operation succeeded */
  success: boolean;

  /** ID of the checkpoint that was restored */
  checkpoint_id: string;

  /** List of files that were restored */
  files_restored: string[];

  /** List of state keys that were restored */
  state_restored: string[];

  /** Errors encountered during restore (if any) */
  errors?: string[];

  /** Time taken to restore in milliseconds */
  duration_ms: number;
}

/**
 * Filter for listing checkpoints
 */
export interface CheckpointFilter {
  /** Filter by batch ID */
  batch_id?: string;

  /** Filter by checkpoint type */
  type?: CheckpointType;

  /** Filter by creation reason */
  reason?: CheckpointReason;

  /** Only checkpoints created after this ISO timestamp */
  created_after?: string;

  /** Only checkpoints created before this ISO timestamp */
  created_before?: string;

  /** Maximum number of checkpoints to return */
  limit?: number;
}

/**
 * Result of cleanup operation
 */
export interface CleanupResult {
  /** Number of checkpoints removed */
  removed: number;

  /** Total bytes freed */
  freed_bytes: number;

  /** Number of checkpoints remaining */
  remaining: number;

  /** Errors encountered during cleanup (if any) */
  errors?: string[];
}

/**
 * Checkpoint System API
 * Core operations for checkpoint management
 */
export interface CheckpointSystem {
  /**
   * Create a new checkpoint
   * @param config - Configuration for the checkpoint
   * @returns The created checkpoint
   */
  create(config: CheckpointConfig): Promise<Checkpoint>;

  /**
   * Restore from a checkpoint
   * @param checkpoint_id - ID of the checkpoint to restore
   * @param options - Optional restore configuration
   * @returns Result of the restore operation
   */
  restore(checkpoint_id: string, options?: RestoreOptions): Promise<RestoreResult>;

  /**
   * List available checkpoints
   * @param filter - Optional filter criteria
   * @returns Array of matching checkpoints
   */
  list(filter?: CheckpointFilter): Checkpoint[];

  /**
   * Get a specific checkpoint by ID
   * @param checkpoint_id - ID of the checkpoint
   * @returns The checkpoint if found, undefined otherwise
   */
  get(checkpoint_id: string): Checkpoint | undefined;

  /**
   * Manually delete a checkpoint
   * @param checkpoint_id - ID of the checkpoint to delete
   * @returns True if deleted, false if not found
   */
  delete(checkpoint_id: string): boolean;

  /**
   * Clean up expired checkpoints
   * @returns Result of the cleanup operation
   */
  cleanup(): CleanupResult;
}

/**
 * Configuration for the checkpoint manager
 */
export interface CheckpointManagerConfig {
  /** Maximum number of checkpoints to keep (default: 10) */
  max_checkpoints: number;

  /** Default expiry time in hours (default: 24) */
  default_expiry_hours: number;

  /** Automatically cleanup old checkpoints on create (default: true) */
  auto_cleanup: boolean;

  /** Directory for storing checkpoint data */
  checkpoint_dir: string;
}

/**
 * Full checkpoint manager interface
 * Extends CheckpointSystem with lifecycle and configuration
 */
export interface CheckpointManager extends CheckpointSystem {
  /** Manager configuration */
  config: CheckpointManagerConfig;

  /**
   * Initialize the checkpoint manager
   * Creates checkpoint directory if needed, loads existing checkpoints
   */
  initialize(): Promise<void>;

  /**
   * Shutdown the checkpoint manager
   * Persists state, releases resources
   */
  shutdown(): Promise<void>;
}
