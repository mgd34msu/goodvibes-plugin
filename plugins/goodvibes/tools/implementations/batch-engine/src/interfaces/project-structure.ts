/**
 * Project State Directory Structure interfaces for Batch Engine
 * @see SPEC-v2 Section 14.2
 *
 * Complete .goodvibes directory structure:
 * .goodvibes/
 * ├── state/
 * │   ├── session.json           # Current session state
 * │   ├── agents.json            # Agent tracking
 * │   ├── locks.json             # Active locks
 * │   └── health.json            # Health check results
 * ├── memory/
 * │   ├── decisions.md           # Markdown with structured entries
 * │   ├── patterns.md            # Markdown with structured entries
 * │   ├── failures.md            # Markdown with structured entries
 * │   ├── preferences.json       # JSON for preferences
 * │   └── index.json             # Search index
 * ├── checkpoints/
 * │   ├── index.json             # Global checkpoint index
 * │   ├── cp_YYYYMMDD_HHMMSS/
 * │   │   ├── manifest.json      # Checkpoint metadata
 * │   │   ├── state.json         # State snapshot
 * │   │   └── files/             # File backups
 * │   └── ...
 * ├── telemetry/
 * │   ├── current_session.json   # Current session metrics
 * │   ├── history/
 * │   │   ├── YYYY-MM-DD.json    # Daily aggregates
 * │   │   └── ...
 * │   └── aggregations.json      # Pre-computed aggregations
 * ├── logs/
 * │   ├── justvibes-log.md       # Main activity log (markdown)
 * │   ├── justvibes-errors.md    # Error log (markdown)
 * │   ├── activity.log           # Machine-readable activity log
 * │   └── decisions.log          # Machine-readable decision log
 * └── cache/
 *     ├── stack.json             # Cached stack detection
 *     ├── symbols.json           # Cached symbol index
 *     └── deps.json              # Cached dependency graph
 */

/**
 * Root project state directory structure
 * Defines the complete .goodvibes directory hierarchy
 * @see SPEC-v2 Section 14.2
 */
export const PROJECT_STATE_STRUCTURE = {
  /** Root directory for all project state */
  root: '.goodvibes',
  /** Subdirectory names within .goodvibes */
  directories: {
    /** Session, agent, lock, and health state */
    state: 'state',
    /** Persistent memory (decisions, patterns, failures) */
    memory: 'memory',
    /** Checkpoint backups for rollback */
    checkpoints: 'checkpoints',
    /** Metrics and usage telemetry */
    telemetry: 'telemetry',
    /** Activity and error logs */
    logs: 'logs',
    /** Cached detection results */
    cache: 'cache',
  },
} as const;

export type ProjectStateDirectory = typeof PROJECT_STATE_STRUCTURE.directories[keyof typeof PROJECT_STATE_STRUCTURE.directories];

/**
 * State subdirectory files
 * Core runtime state files for session management
 * @see SPEC-v2 Section 7.2
 */
export const STATE_FILES = {
  /** Current session state including mode and batch tracking */
  session: 'state/session.json',
  /** Active agent registry and status */
  agents: 'state/agents.json',
  /** File and resource locks */
  locks: 'state/locks.json',
  /** Health check results and system status */
  health: 'state/health.json',
} as const;

export type StateFileKey = keyof typeof STATE_FILES;
export type StateFilePath = typeof STATE_FILES[StateFileKey];

/**
 * Memory subdirectory files
 * Persistent project memory for decisions, patterns, and failures
 * @see SPEC-v2 Section 8.2
 */
export const MEMORY_FILES = {
  /** Architecture and library decisions in markdown format */
  decisions: 'memory/decisions.md',
  /** Code patterns and conventions in markdown format */
  patterns: 'memory/patterns.md',
  /** Recorded failures and resolutions in markdown format */
  failures: 'memory/failures.md',
  /** User preferences in JSON format */
  preferences: 'memory/preferences.json',
  /** Search index for fast memory lookups */
  index: 'memory/index.json',
} as const;

export type MemoryFileKey = keyof typeof MEMORY_FILES;
export type MemoryFilePath = typeof MEMORY_FILES[MemoryFileKey];

/**
 * Telemetry subdirectory files
 * Metrics collection and aggregation
 * @see SPEC-v2 Section 9.2
 */
export const TELEMETRY_FILES = {
  /** Current session metrics and counters */
  current_session: 'telemetry/current_session.json',
  /** Historical data directory containing daily aggregates */
  history: 'telemetry/history',
  /** Pre-computed aggregations for dashboards */
  aggregations: 'telemetry/aggregations.json',
} as const;

export type TelemetryFileKey = keyof typeof TELEMETRY_FILES;
export type TelemetryFilePath = typeof TELEMETRY_FILES[TelemetryFileKey];

/**
 * Logs subdirectory files
 * Activity and error logging
 * @see SPEC-v2 Section 14.2
 */
export const LOG_FILES = {
  /** Main activity log in markdown format (human-readable) */
  justvibes_log: 'logs/justvibes-log.md',
  /** Error log in markdown format (human-readable) */
  justvibes_errors: 'logs/justvibes-errors.md',
  /** Machine-readable activity log */
  activity: 'logs/activity.log',
  /** Machine-readable decision log */
  decisions: 'logs/decisions.log',
} as const;

export type LogFileKey = keyof typeof LOG_FILES;
export type LogFilePath = typeof LOG_FILES[LogFileKey];

/**
 * Cache subdirectory files
 * Cached detection results for performance
 * @see SPEC-v2 Section 14.2
 */
export const CACHE_FILES = {
  /** Cached stack detection results */
  stack_detection: 'cache/stack.json',
  /** Cached symbol index for code navigation */
  symbol_index: 'cache/symbols.json',
  /** Cached dependency graph */
  dependency_graph: 'cache/deps.json',
} as const;

export type CacheFileKey = keyof typeof CACHE_FILES;
export type CacheFilePath = typeof CACHE_FILES[CacheFileKey];

/**
 * All file categories combined for comprehensive path resolution
 */
export const ALL_PROJECT_FILES = {
  ...STATE_FILES,
  ...MEMORY_FILES,
  ...TELEMETRY_FILES,
  ...LOG_FILES,
  ...CACHE_FILES,
} as const;

export type AllProjectFileKey = keyof typeof ALL_PROJECT_FILES;
export type AllProjectFilePath = typeof ALL_PROJECT_FILES[AllProjectFileKey];

/**
 * Result of directory structure initialization
 * @see SPEC-v2 Section 14.2
 */
export interface InitializationResult {
  /** Whether initialization completed successfully */
  success: boolean;
  /** List of directories that were created */
  created_directories: string[];
  /** List of files that were created (with default content) */
  created_files: string[];
  /** Any errors encountered during initialization */
  errors: string[];
}

/**
 * Result of structure verification
 * Validates the .goodvibes directory is intact and healthy
 * @see SPEC-v2 Section 14.2
 */
export interface ProjectStructureVerification {
  /** Whether the structure is valid and complete */
  valid: boolean;
  /** Directories that should exist but don't */
  missing_directories: string[];
  /** Files that should exist but don't */
  missing_files: string[];
  /** Files that exist but are corrupted or malformed */
  corrupted_files: string[];
  /** Disk usage breakdown by subdirectory (in bytes) */
  disk_usage: {
    /** Size of state directory */
    state: number;
    /** Size of memory directory */
    memory: number;
    /** Size of checkpoints directory */
    checkpoints: number;
    /** Size of telemetry directory */
    telemetry: number;
    /** Size of logs directory */
    logs: number;
    /** Size of cache directory */
    cache: number;
    /** Total size of .goodvibes directory */
    total: number;
  };
}

/**
 * Exported project state for backup or migration
 * @see SPEC-v2 Section 14.2
 */
export interface ProjectStateExport {
  /** ISO timestamp when export was created */
  exported_at: string;
  /** Exported state files content */
  state: {
    session: unknown;
    agents: unknown;
    locks: unknown;
    health: unknown;
  };
  /** Exported memory content */
  memory: {
    decisions: string;
    patterns: string;
    failures: string;
    preferences: unknown;
    index: unknown;
  };
  /** Exported telemetry data */
  telemetry: {
    current_session: unknown;
    aggregations: unknown;
  };
  /** List of checkpoint IDs included in export */
  checkpoints: string[];
}

/**
 * Project directory manager interface
 * Manages the complete .goodvibes directory structure
 * @see SPEC-v2 Section 14.2
 */
export interface ProjectDirectoryManager {
  // ─────────────────────────────────────────────────────────────────
  // Initialization
  // ─────────────────────────────────────────────────────────────────

  /**
   * Initialize the complete .goodvibes directory structure
   * Creates all subdirectories and default files if they don't exist
   * @returns Initialization result with created paths and any errors
   */
  initialize(): Promise<InitializationResult>;

  /**
   * Check if the .goodvibes directory has been initialized
   * @returns True if the root directory and required subdirectories exist
   */
  isInitialized(): Promise<boolean>;

  // ─────────────────────────────────────────────────────────────────
  // Verification
  // ─────────────────────────────────────────────────────────────────

  /**
   * Verify the complete directory structure is intact
   * Checks for missing directories, files, and corruption
   * @returns Verification result with any issues found
   */
  verifyStructure(): Promise<ProjectStructureVerification>;

  /**
   * Repair any issues found during verification
   * Creates missing directories and reinitializes corrupted files
   * @param verification - Previous verification result
   * @returns New verification result after repairs
   */
  repairStructure(verification: ProjectStructureVerification): Promise<ProjectStructureVerification>;

  // ─────────────────────────────────────────────────────────────────
  // Path Resolution
  // ─────────────────────────────────────────────────────────────────

  /**
   * Get the absolute path for a state file
   * @param file - State file key
   * @returns Absolute path to the file
   */
  getStatePath(file: StateFileKey): string;

  /**
   * Get the absolute path for a memory file
   * @param file - Memory file key
   * @returns Absolute path to the file
   */
  getMemoryPath(file: MemoryFileKey): string;

  /**
   * Get the absolute path for a telemetry file
   * @param file - Telemetry file key
   * @returns Absolute path to the file
   */
  getTelemetryPath(file: TelemetryFileKey): string;

  /**
   * Get the absolute path for a log file
   * @param file - Log file key
   * @returns Absolute path to the file
   */
  getLogPath(file: LogFileKey): string;

  /**
   * Get the absolute path for a cache file
   * @param file - Cache file key
   * @returns Absolute path to the file
   */
  getCachePath(file: CacheFileKey): string;

  /**
   * Get the absolute path for a checkpoint directory
   * @param id - Checkpoint identifier (e.g., cp_YYYYMMDD_HHMMSS)
   * @returns Absolute path to the checkpoint directory
   */
  getCheckpointPath(id: string): string;

  /**
   * Get the absolute path for a telemetry history file
   * @param date - Date string in YYYY-MM-DD format
   * @returns Absolute path to the history file
   */
  getTelemetryHistoryPath(date: string): string;

  /**
   * Get the project root directory (parent of .goodvibes)
   * @returns Absolute path to the project root
   */
  getProjectRoot(): string;

  /**
   * Get the .goodvibes root directory
   * @returns Absolute path to .goodvibes
   */
  getGoodvibesRoot(): string;

  // ─────────────────────────────────────────────────────────────────
  // Cleanup
  // ─────────────────────────────────────────────────────────────────

  /**
   * Clean up old checkpoints beyond the specified age
   * @param maxAge - Maximum age in milliseconds
   * @returns Number of checkpoints deleted
   */
  cleanupOldCheckpoints(maxAge: number): Promise<number>;

  /**
   * Clean up old log entries beyond the specified age
   * Truncates log files to remove entries older than maxAge
   * @param maxAge - Maximum age in milliseconds
   * @returns Number of log entries removed
   */
  cleanupLogs(maxAge: number): Promise<number>;

  /**
   * Clear all cached data
   * Removes all files from the cache directory
   */
  cleanupCache(): Promise<void>;

  /**
   * Clean up old telemetry history files
   * @param maxAge - Maximum age in milliseconds
   * @returns Number of history files deleted
   */
  cleanupTelemetryHistory(maxAge: number): Promise<number>;

  /**
   * Perform full cleanup of all stale data
   * @param options - Cleanup options
   * @returns Summary of cleanup actions
   */
  performFullCleanup(options: CleanupOptions): Promise<CleanupSummary>;

  // ─────────────────────────────────────────────────────────────────
  // Export
  // ─────────────────────────────────────────────────────────────────

  /**
   * Export the complete project state for backup or migration
   * @returns Exported state data
   */
  exportState(): Promise<ProjectStateExport>;

  /**
   * Import previously exported project state
   * @param exported - Exported state to import
   * @param options - Import options (merge vs overwrite)
   * @returns Import result
   */
  importState(exported: ProjectStateExport, options?: ImportOptions): Promise<ImportResult>;
}

/**
 * Options for cleanup operations
 */
export interface CleanupOptions {
  /** Maximum age for checkpoints in milliseconds (default: 7 days) */
  checkpoint_max_age?: number;
  /** Maximum age for logs in milliseconds (default: 30 days) */
  log_max_age?: number;
  /** Maximum age for telemetry history in milliseconds (default: 90 days) */
  telemetry_max_age?: number;
  /** Whether to clear the cache (default: false) */
  clear_cache?: boolean;
  /** Dry run - report what would be deleted without actually deleting */
  dry_run?: boolean;
}

/**
 * Summary of cleanup operations
 */
export interface CleanupSummary {
  /** Number of checkpoints deleted */
  checkpoints_deleted: number;
  /** Number of log entries removed */
  log_entries_removed: number;
  /** Number of telemetry history files deleted */
  telemetry_files_deleted: number;
  /** Whether cache was cleared */
  cache_cleared: boolean;
  /** Total bytes freed */
  bytes_freed: number;
  /** Any errors encountered */
  errors: string[];
}

/**
 * Options for importing state
 */
export interface ImportOptions {
  /** How to handle existing data: 'merge' combines, 'overwrite' replaces */
  mode: 'merge' | 'overwrite';
  /** Whether to import checkpoints */
  include_checkpoints?: boolean;
  /** Whether to import telemetry */
  include_telemetry?: boolean;
}

/**
 * Result of import operation
 */
export interface ImportResult {
  /** Whether import completed successfully */
  success: boolean;
  /** Files that were imported */
  imported_files: string[];
  /** Files that were skipped (already exist in merge mode) */
  skipped_files: string[];
  /** Any errors encountered */
  errors: string[];
}

/**
 * Gitignore entries for .goodvibes directory
 * Memory is tracked (not ignored), everything else is local state
 * @see SPEC-v2 Section 14.2
 */
export const GITIGNORE_ENTRIES = [
  '# GoodVibes state (local, not committed)',
  '.goodvibes/state/',
  '.goodvibes/checkpoints/',
  '.goodvibes/telemetry/',
  '.goodvibes/logs/',
  '.goodvibes/cache/',
  '',
  '# GoodVibes memory (tracked, committed)',
  '!.goodvibes/memory/',
] as const;

export type GitignoreEntry = typeof GITIGNORE_ENTRIES[number];

/**
 * Get the complete gitignore content for .goodvibes
 * @returns Gitignore content as a string
 */
export function getGitignoreContent(): string {
  return GITIGNORE_ENTRIES.join('\n');
}

/**
 * Default cleanup age constants (in milliseconds)
 */
export const DEFAULT_CLEANUP_AGES = {
  /** 7 days for checkpoints */
  CHECKPOINTS: 7 * 24 * 60 * 60 * 1000,
  /** 30 days for logs */
  LOGS: 30 * 24 * 60 * 60 * 1000,
  /** 90 days for telemetry history */
  TELEMETRY: 90 * 24 * 60 * 60 * 1000,
} as const;

/**
 * Resolve a relative path within .goodvibes to an absolute path
 * @param projectRoot - Absolute path to project root
 * @param relativePath - Path relative to .goodvibes root
 * @returns Absolute path
 */
export function resolveGoodvibesPath(projectRoot: string, relativePath: string): string {
  return `${projectRoot}/${PROJECT_STATE_STRUCTURE.root}/${relativePath}`;
}

/**
 * Get the full path for a state file
 * @param file - State file key
 * @returns Path relative to project root
 */
export function getFullStatePath(file: StateFileKey): string {
  return `${PROJECT_STATE_STRUCTURE.root}/${STATE_FILES[file]}`;
}

/**
 * Get the full path for a memory file
 * @param file - Memory file key
 * @returns Path relative to project root
 */
export function getFullMemoryPath(file: MemoryFileKey): string {
  return `${PROJECT_STATE_STRUCTURE.root}/${MEMORY_FILES[file]}`;
}

/**
 * Get the full path for a telemetry file
 * @param file - Telemetry file key
 * @returns Path relative to project root
 */
export function getFullTelemetryPath(file: TelemetryFileKey): string {
  return `${PROJECT_STATE_STRUCTURE.root}/${TELEMETRY_FILES[file]}`;
}

/**
 * Get the full path for a log file
 * @param file - Log file key
 * @returns Path relative to project root
 */
export function getFullLogPath(file: LogFileKey): string {
  return `${PROJECT_STATE_STRUCTURE.root}/${LOG_FILES[file]}`;
}

/**
 * Get the full path for a cache file
 * @param file - Cache file key
 * @returns Path relative to project root
 */
export function getFullCachePath(file: CacheFileKey): string {
  return `${PROJECT_STATE_STRUCTURE.root}/${CACHE_FILES[file]}`;
}

/**
 * Get all directories that should exist in .goodvibes
 * @returns Array of directory paths relative to project root
 */
export function getAllDirectories(): string[] {
  const root = PROJECT_STATE_STRUCTURE.root;
  const dirs = PROJECT_STATE_STRUCTURE.directories;
  return [
    root,
    `${root}/${dirs.state}`,
    `${root}/${dirs.memory}`,
    `${root}/${dirs.checkpoints}`,
    `${root}/${dirs.telemetry}`,
    `${root}/${dirs.telemetry}/history`,
    `${root}/${dirs.logs}`,
    `${root}/${dirs.cache}`,
  ];
}

/**
 * Get all required files that should exist in .goodvibes
 * @returns Array of file paths relative to project root
 */
export function getRequiredFiles(): string[] {
  const root = PROJECT_STATE_STRUCTURE.root;
  return [
    `${root}/${STATE_FILES.session}`,
    `${root}/${STATE_FILES.agents}`,
    `${root}/${STATE_FILES.locks}`,
    `${root}/${STATE_FILES.health}`,
    `${root}/${MEMORY_FILES.decisions}`,
    `${root}/${MEMORY_FILES.patterns}`,
    `${root}/${MEMORY_FILES.failures}`,
    `${root}/${MEMORY_FILES.preferences}`,
    `${root}/${MEMORY_FILES.index}`,
    `${root}/${TELEMETRY_FILES.current_session}`,
    `${root}/${TELEMETRY_FILES.aggregations}`,
  ];
}

/**
 * File category for a given path
 */
export type FileCategory = 'state' | 'memory' | 'checkpoints' | 'telemetry' | 'logs' | 'cache' | 'unknown';

/**
 * Determine the category of a file based on its path
 * @param filePath - File path relative to .goodvibes
 * @returns File category
 */
export function getFileCategory(filePath: string): FileCategory {
  if (filePath.startsWith('state/')) return 'state';
  if (filePath.startsWith('memory/')) return 'memory';
  if (filePath.startsWith('checkpoints/')) return 'checkpoints';
  if (filePath.startsWith('telemetry/')) return 'telemetry';
  if (filePath.startsWith('logs/')) return 'logs';
  if (filePath.startsWith('cache/')) return 'cache';
  return 'unknown';
}

/**
 * Check if a path is within the .goodvibes directory
 * @param path - Path to check
 * @returns True if path is within .goodvibes
 */
export function isGoodvibesPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  return normalized.includes('.goodvibes/') || normalized.endsWith('.goodvibes');
}

/**
 * Empty initialization result for failed operations
 */
export const EMPTY_INITIALIZATION_RESULT: InitializationResult = {
  success: false,
  created_directories: [],
  created_files: [],
  errors: [],
};

/**
 * Empty verification result for when structure is invalid
 */
export const EMPTY_VERIFICATION_RESULT: ProjectStructureVerification = {
  valid: false,
  missing_directories: [],
  missing_files: [],
  corrupted_files: [],
  disk_usage: {
    state: 0,
    memory: 0,
    checkpoints: 0,
    telemetry: 0,
    logs: 0,
    cache: 0,
    total: 0,
  },
};

/**
 * Empty cleanup summary for dry runs or failed cleanups
 */
export const EMPTY_CLEANUP_SUMMARY: CleanupSummary = {
  checkpoints_deleted: 0,
  log_entries_removed: 0,
  telemetry_files_deleted: 0,
  cache_cleared: false,
  bytes_freed: 0,
  errors: [],
};
