/**
 * Path utilities for the GoodVibes core module.
 *
 * SINGLE SOURCE OF TRUTH for all .goodvibes directory paths.
 *
 * Provides constants and functions for resolving paths to the .goodvibes
 * directory and its subdirectories (logs, memory, state, telemetry, plans).
 *
 * All code that works with .goodvibes paths MUST import from this module
 * to ensure consistency across the codebase.
 *
 * @module paths
 */

import * as path from "path";

// ============================================================================
// Directory Constants
// ============================================================================

/**
 * The name of the .goodvibes configuration directory.
 *
 * This is the root directory for all GoodVibes persistent data.
 */
export const GOODVIBES_DIR = ".goodvibes";

/**
 * Directory names within .goodvibes.
 *
 * These subdirectories organize different types of persistent data:
 * - `memory`: Cross-session memory (decisions, patterns, failures)
 * - `logs`: Hook execution logs and activity tracking
 * - `state`: Session state and runtime data
 * - `telemetry`: Agent telemetry data (monthly JSONL files)
 * - `plans`: Reserved for future use (execution plans)
 */
export const SUBDIRS = {
  memory: "memory",
  logs: "logs",
  state: "state",
  telemetry: "telemetry",
  plans: "plans",
} as const;

// ============================================================================
// File Name Constants
// ============================================================================

/**
 * Memory file names.
 *
 * These JSON files store different types of persistent memory:
 * - `decisions.json`: Recorded decisions with rationale
 * - `patterns.json`: Discovered code patterns
 * - `failures.json`: Recorded failures and fixes
 * - `preferences.json`: User preferences (reserved for future use)
 * - `index.json`: Memory index metadata (reserved for future use)
 */
export const MEMORY_FILES = {
  decisions: "decisions.json",
  patterns: "patterns.json",
  failures: "failures.json",
  preferences: "preferences.json",
  index: "index.json",
} as const;

/**
 * Log file names.
 *
 * These markdown files store different types of logs:
 * - `decisions.md`: Human-readable decision log
 * - `errors.md`: Error tracking and debugging log
 * - `activity.md`: General activity log (justvibes mode)
 * - `LOGGING-SPEC.md`: Logging specification documentation
 */
export const LOG_FILES = {
  decisions: "decisions.md",
  errors: "errors.md",
  activity: "activity.md",
  spec: "LOGGING-SPEC.md",
} as const;

/**
 * State file names.
 *
 * These JSON files store runtime state:
 * - `hooks-state.json`: Hook execution state and session data
 */
export const STATE_FILES = {
  hooksState: "hooks-state.json",
} as const;

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Valid memory file types.
 *
 * Use this type to ensure type-safe access to memory files.
 */
export type MemoryFileType = keyof typeof MEMORY_FILES;

/**
 * Valid log file types.
 *
 * Use this type to ensure type-safe access to log files.
 */
export type LogFileType = keyof typeof LOG_FILES;

/**
 * Valid state file types.
 *
 * Use this type to ensure type-safe access to state files.
 */
export type StateFileType = keyof typeof STATE_FILES;

// ============================================================================
// Directory Path Functions
// ============================================================================

/**
 * Gets the path to the .goodvibes directory.
 *
 * This is the root directory for all GoodVibes persistent data.
 *
 * @param cwd - The current working directory (project root)
 * @returns Absolute path to .goodvibes directory
 *
 * @example
 * const goodvibesDir = getGoodVibesDir('/path/to/project');
 * // => '/path/to/project/.goodvibes'
 */
export function getGoodVibesDir(cwd: string): string {
  return path.join(cwd, GOODVIBES_DIR);
}

/**
 * Gets the path to the memory directory.
 *
 * Memory directory stores cross-session memory (decisions, patterns, failures).
 *
 * @param cwd - The current working directory (project root)
 * @returns Absolute path to .goodvibes/memory directory
 *
 * @example
 * const memoryDir = getMemoryDir('/path/to/project');
 * // => '/path/to/project/.goodvibes/memory'
 */
export function getMemoryDir(cwd: string): string {
  return path.join(cwd, GOODVIBES_DIR, SUBDIRS.memory);
}

/**
 * Gets the path to the logs directory.
 *
 * Logs directory stores hook execution logs and activity tracking.
 *
 * @param cwd - The current working directory (project root)
 * @returns Absolute path to .goodvibes/logs directory
 *
 * @example
 * const logsDir = getLogsDir('/path/to/project');
 * // => '/path/to/project/.goodvibes/logs'
 */
export function getLogsDir(cwd: string): string {
  return path.join(cwd, GOODVIBES_DIR, SUBDIRS.logs);
}

/**
 * Gets the path to the state directory.
 *
 * State directory stores session state and runtime data.
 *
 * @param cwd - The current working directory (project root)
 * @returns Absolute path to .goodvibes/state directory
 *
 * @example
 * const stateDir = getStateDir('/path/to/project');
 * // => '/path/to/project/.goodvibes/state'
 */
export function getStateDir(cwd: string): string {
  return path.join(cwd, GOODVIBES_DIR, SUBDIRS.state);
}

/**
 * Gets the path to the telemetry directory.
 *
 * Telemetry directory stores agent telemetry data in monthly JSONL files.
 *
 * @param cwd - The current working directory (project root)
 * @returns Absolute path to .goodvibes/telemetry directory
 *
 * @example
 * const telemetryDir = getTelemetryDir('/path/to/project');
 * // => '/path/to/project/.goodvibes/telemetry'
 */
export function getTelemetryDir(cwd: string): string {
  return path.join(cwd, GOODVIBES_DIR, SUBDIRS.telemetry);
}

/**
 * Gets the path to the plans directory.
 *
 * Plans directory is reserved for future use (execution plans).
 *
 * @param cwd - The current working directory (project root)
 * @returns Absolute path to .goodvibes/plans directory
 *
 * @example
 * const plansDir = getPlansDir('/path/to/project');
 * // => '/path/to/project/.goodvibes/plans'
 */
export function getPlansDir(cwd: string): string {
  return path.join(cwd, GOODVIBES_DIR, SUBDIRS.plans);
}

// ============================================================================
// File Path Functions
// ============================================================================

/**
 * Gets the path to a specific memory file.
 *
 * Memory files store different types of persistent memory data.
 *
 * @param cwd - The current working directory (project root)
 * @param type - The type of memory file to get
 * @returns Absolute path to the specified memory file
 *
 * @example
 * const decisionsPath = getMemoryFilePath('/path/to/project', 'decisions');
 * // => '/path/to/project/.goodvibes/memory/decisions.json'
 *
 * @example
 * const patternsPath = getMemoryFilePath('/path/to/project', 'patterns');
 * // => '/path/to/project/.goodvibes/memory/patterns.json'
 */
export function getMemoryFilePath(
  cwd: string,
  type: MemoryFileType
): string {
  return path.join(getMemoryDir(cwd), MEMORY_FILES[type]);
}

/**
 * Gets the path to a specific log file.
 *
 * Log files store different types of logs (decisions, errors, activity).
 *
 * @param cwd - The current working directory (project root)
 * @param type - The type of log file to get
 * @returns Absolute path to the specified log file
 *
 * @example
 * const decisionsLog = getLogFilePath('/path/to/project', 'decisions');
 * // => '/path/to/project/.goodvibes/logs/decisions.md'
 *
 * @example
 * const errorsLog = getLogFilePath('/path/to/project', 'errors');
 * // => '/path/to/project/.goodvibes/logs/errors.md'
 */
export function getLogFilePath(
  cwd: string,
  type: LogFileType
): string {
  return path.join(getLogsDir(cwd), LOG_FILES[type]);
}

/**
 * Gets the path to a specific state file.
 *
 * State files store runtime state and session data.
 *
 * @param cwd - The current working directory (project root)
 * @param type - The type of state file to get
 * @returns Absolute path to the specified state file
 *
 * @example
 * const hooksStatePath = getStateFilePath('/path/to/project', 'hooksState');
 * // => '/path/to/project/.goodvibes/state/hooks-state.json'
 */
export function getStateFilePath(
  cwd: string,
  type: StateFileType
): string {
  return path.join(getStateDir(cwd), STATE_FILES[type]);
}

/**
 * Gets the path to a telemetry file for a specific date.
 *
 * Telemetry files are organized by year-month (YYYY-MM.jsonl).
 * Each file contains JSONL records for that month.
 *
 * @param cwd - The current working directory (project root)
 * @param date - The date to get the telemetry file for (defaults to current date)
 * @returns Absolute path to the telemetry file for the specified month
 *
 * @example
 * const currentTelemetry = getTelemetryFilePath('/path/to/project');
 * // => '/path/to/project/.goodvibes/telemetry/2024-01.jsonl'
 *
 * @example
 * const janTelemetry = getTelemetryFilePath('/path/to/project', new Date('2024-01-15'));
 * // => '/path/to/project/.goodvibes/telemetry/2024-01.jsonl'
 */
export function getTelemetryFilePath(cwd: string, date?: Date): string {
  const targetDate = date ?? new Date();
  const yearMonth = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, "0")}`;
  return path.join(getTelemetryDir(cwd), `${yearMonth}.jsonl`);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Gets all directory paths within .goodvibes.
 *
 * This is useful for ensuring all directories exist on initialization.
 *
 * @param cwd - The current working directory (project root)
 * @returns Object containing all .goodvibes directory paths
 *
 * @example
 * const dirs = getAllGoodVibesDirs('/path/to/project');
 * // => {
 * //   root: '/path/to/project/.goodvibes',
 * //   memory: '/path/to/project/.goodvibes/memory',
 * //   logs: '/path/to/project/.goodvibes/logs',
 * //   state: '/path/to/project/.goodvibes/state',
 * //   telemetry: '/path/to/project/.goodvibes/telemetry',
 * //   plans: '/path/to/project/.goodvibes/plans'
 * // }
 */
export function getAllGoodVibesDirs(cwd: string): {
  root: string;
  memory: string;
  logs: string;
  state: string;
  telemetry: string;
  plans: string;
} {
  return {
    root: getGoodVibesDir(cwd),
    memory: getMemoryDir(cwd),
    logs: getLogsDir(cwd),
    state: getStateDir(cwd),
    telemetry: getTelemetryDir(cwd),
    plans: getPlansDir(cwd),
  };
}
