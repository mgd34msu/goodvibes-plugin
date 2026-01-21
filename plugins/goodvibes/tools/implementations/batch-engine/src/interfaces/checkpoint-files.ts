/**
 * Checkpoint File Structure interfaces for Batch Engine
 * @see SPEC-v2 Section 11.1
 *
 * Checkpoint directory structure:
 * .goodvibes/
 * └── checkpoints/
 *     ├── index.json                    # Global checkpoint index
 *     ├── cp_YYYYMMDD_HHMMSS/
 *     │   ├── manifest.json             # Checkpoint metadata
 *     │   ├── state.json                # State snapshot
 *     │   └── files/                    # File backups
 *     │       ├── src_components_Button.tsx
 *     │       └── ...
 *     └── ...
 */

import type { Checkpoint, CheckpointType, CheckpointReason } from './checkpoint.js';

// Re-export types from checkpoint.ts for convenience
export type { Checkpoint, CheckpointType, CheckpointReason };

/**
 * Checkpoint directory paths
 * Provides structured access to checkpoint file locations
 */
export const CHECKPOINT_PATHS = {
  root: '.goodvibes/checkpoints',
  manifest: (id: string) => `.goodvibes/checkpoints/${id}/manifest.json`,
  files: (id: string) => `.goodvibes/checkpoints/${id}/files`,
  state: (id: string) => `.goodvibes/checkpoints/${id}/state.json`,
  index: '.goodvibes/checkpoints/index.json',
} as const;

export type CheckpointPath = typeof CHECKPOINT_PATHS[keyof typeof CHECKPOINT_PATHS];

/**
 * Checkpoint manifest stored in manifest.json
 * Contains metadata about a checkpoint including file inventory and checksums
 * @see SPEC-v2 Section 11.1
 */
export interface CheckpointManifest {
  /** Unique checkpoint identifier */
  id: string;

  /** Manifest format version for compatibility */
  version: number;

  /** ISO timestamp when checkpoint was created */
  created_at: string;

  /** ISO timestamp when checkpoint expires (for auto-cleanup) */
  expires_at?: string;

  /** Type of checkpoint (automatic, manual) */
  type: CheckpointType;

  /** Reason for creating this checkpoint */
  reason: CheckpointReason;

  /** Associated batch ID (if applicable) */
  batch_id?: string;

  /** Files included in this checkpoint */
  files: CheckpointFileEntry[];

  /** State keys included in the state snapshot */
  state_keys: string[];

  /** Whether memory state was included */
  memory_included: boolean;

  /** Total size of all checkpoint data in bytes */
  total_size_bytes: number;

  /** Overall checksum for integrity verification (SHA-256) */
  checksum: string;
}

/**
 * Entry for a file in the checkpoint
 * Tracks original location, backup location, and integrity data
 */
export interface CheckpointFileEntry {
  /** Original file path (relative to project root) */
  original_path: string;

  /** Path within checkpoint files directory */
  stored_path: string;

  /** Content hash for integrity verification (SHA-256) */
  hash: string;

  /** File size in bytes */
  size_bytes: number;

  /** File permissions in POSIX format (e.g., '644') */
  permissions?: string;

  /** Original modification time as ISO timestamp */
  modified_at: string;
}

/**
 * State snapshot stored in state.json
 * Captures the complete state at checkpoint creation time
 * @see SPEC-v2 Section 11.1
 */
export interface CheckpointStateSnapshot {
  /** ID of the checkpoint this state belongs to */
  checkpoint_id: string;

  /** ISO timestamp when state was captured */
  captured_at: string;

  /** Session state snapshot */
  session: Record<string, unknown>;

  /** Agent state snapshot */
  agents: Record<string, unknown>;

  /** Lock state snapshot */
  locks: Record<string, unknown>;

  /** Optional memory state snapshot */
  memory?: {
    decisions: unknown[];
    patterns: unknown[];
    failures: unknown[];
  };
}

/**
 * Global checkpoint index stored in index.json
 * Provides fast lookup of all available checkpoints
 * @see SPEC-v2 Section 11.1
 */
export interface CheckpointIndex {
  /** Index format version */
  version: number;

  /** List of all checkpoint entries */
  checkpoints: CheckpointIndexEntry[];

  /** ISO timestamp of last cleanup operation */
  last_cleanup: string;

  /** Total size of all checkpoints in bytes */
  total_size_bytes: number;
}

/**
 * Entry in the checkpoint index
 * Provides summary data for quick filtering without loading full manifests
 */
export interface CheckpointIndexEntry {
  /** Unique checkpoint identifier */
  id: string;

  /** ISO timestamp when checkpoint was created */
  created_at: string;

  /** ISO timestamp when checkpoint expires */
  expires_at?: string;

  /** Type of checkpoint */
  type: CheckpointType;

  /** Reason for creating this checkpoint */
  reason: CheckpointReason;

  /** Associated batch ID (if applicable) */
  batch_id?: string;

  /** Total size of checkpoint in bytes */
  size_bytes: number;

  /** Number of files in the checkpoint */
  file_count: number;
}

/**
 * Get the checkpoint directory path for a given checkpoint ID
 * @param checkpoint_id - The checkpoint identifier
 * @returns Full path to the checkpoint directory
 */
export function getCheckpointDir(checkpoint_id: string): string {
  return `${CHECKPOINT_PATHS.root}/${checkpoint_id}`;
}

/**
 * Generate a unique checkpoint ID from the current timestamp
 * Format: cp_YYYYMMDD_HHMMSS
 * @returns Generated checkpoint ID
 */
export function generateCheckpointId(): string {
  const now = new Date();
  const pad = (n: number, len: number = 2) => n.toString().padStart(len, '0');
  return `cp_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

/**
 * Convert a file path to a safe stored path for the checkpoint
 * Replaces path separators with underscores
 * @param originalPath - Original file path
 * @returns Safe path for storage
 */
export function toStoredPath(originalPath: string): string {
  return originalPath.replace(/[/\\]/g, '_').replace(/^_/, '');
}

/**
 * Validate checkpoint ID format
 * @param id - ID to validate
 * @returns True if valid cp_YYYYMMDD_HHMMSS format
 */
export function isValidCheckpointId(id: string): boolean {
  const pattern = /^cp_\d{8}_\d{6}$/;
  return pattern.test(id);
}

/**
 * Checkpoint file manager interface
 * Handles all file system operations for checkpoints
 * @see SPEC-v2 Section 11.1
 */
export interface CheckpointFileManager {
  /**
   * Initialize checkpoint directory structure
   * Creates root directory and index file if they don't exist
   */
  initialize(): Promise<void>;

  /**
   * Create checkpoint directory and files subdirectory
   * @param id - Checkpoint identifier
   * @returns Path to the created checkpoint directory
   */
  createCheckpointDir(id: string): Promise<string>;

  /**
   * Write manifest to checkpoint directory
   * @param id - Checkpoint identifier
   * @param manifest - Manifest data to write
   */
  writeManifest(id: string, manifest: CheckpointManifest): Promise<void>;

  /**
   * Read manifest from checkpoint directory
   * @param id - Checkpoint identifier
   * @returns Manifest data or null if not found
   */
  readManifest(id: string): Promise<CheckpointManifest | null>;

  /**
   * Copy a file to the checkpoint's files directory
   * @param id - Checkpoint identifier
   * @param sourcePath - Original file path to copy
   * @param entry - File entry metadata
   */
  copyFileToCheckpoint(id: string, sourcePath: string, entry: CheckpointFileEntry): Promise<void>;

  /**
   * Restore a file from the checkpoint to its original location
   * @param id - Checkpoint identifier
   * @param entry - File entry to restore
   * @returns True if restored successfully, false if backup not found
   */
  restoreFileFromCheckpoint(id: string, entry: CheckpointFileEntry): Promise<boolean>;

  /**
   * Write state snapshot to checkpoint directory
   * @param id - Checkpoint identifier
   * @param state - State snapshot data to write
   */
  writeState(id: string, state: CheckpointStateSnapshot): Promise<void>;

  /**
   * Read state snapshot from checkpoint directory
   * @param id - Checkpoint identifier
   * @returns State snapshot or null if not found
   */
  readState(id: string): Promise<CheckpointStateSnapshot | null>;

  /**
   * Update the global checkpoint index with a new entry
   * @param entry - Index entry to add or update
   */
  updateIndex(entry: CheckpointIndexEntry): Promise<void>;

  /**
   * Remove a checkpoint from the global index
   * @param id - Checkpoint identifier to remove
   */
  removeFromIndex(id: string): Promise<void>;

  /**
   * Read the global checkpoint index
   * @returns Current index or empty index if not found
   */
  readIndex(): Promise<CheckpointIndex>;

  /**
   * Delete a checkpoint directory and all its contents
   * @param id - Checkpoint identifier to delete
   * @returns True if deleted, false if not found
   */
  deleteCheckpoint(id: string): Promise<boolean>;

  /**
   * Calculate the total size of a checkpoint directory
   * @param id - Checkpoint identifier
   * @returns Total size in bytes
   */
  calculateSize(id: string): Promise<number>;

  /**
   * Verify checkpoint integrity by checking all file hashes
   * @param id - Checkpoint identifier
   * @returns Validation result with any errors found
   */
  verifyIntegrity(id: string): Promise<{ valid: boolean; errors: string[] }>;
}

/**
 * Empty checkpoint index for initialization
 */
export const EMPTY_CHECKPOINT_INDEX: CheckpointIndex = {
  version: 1,
  checkpoints: [],
  last_cleanup: new Date().toISOString(),
  total_size_bytes: 0,
};

/**
 * Current manifest format version
 */
export const MANIFEST_VERSION = 1;

/**
 * Checkpoint file type mapping
 */
export const CHECKPOINT_FILE_TYPES = {
  manifest: 'manifest',
  state: 'state',
  index: 'index',
  files: 'files',
} as const;

export type CheckpointFileType = typeof CHECKPOINT_FILE_TYPES[keyof typeof CHECKPOINT_FILE_TYPES];
