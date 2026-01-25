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
/**
 * The name of the .goodvibes configuration directory.
 *
 * This is the root directory for all GoodVibes persistent data.
 */
export declare const GOODVIBES_DIR = ".goodvibes";
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
export declare const SUBDIRS: {
    readonly memory: "memory";
    readonly logs: "logs";
    readonly state: "state";
    readonly telemetry: "telemetry";
    readonly plans: "plans";
};
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
export declare const MEMORY_FILES: {
    readonly decisions: "decisions.json";
    readonly patterns: "patterns.json";
    readonly failures: "failures.json";
    readonly preferences: "preferences.json";
    readonly index: "index.json";
};
/**
 * Log file names.
 *
 * These markdown files store different types of logs:
 * - `decisions.md`: Human-readable decision log
 * - `errors.md`: Error tracking and debugging log
 * - `activity.md`: General activity log (justvibes mode)
 * - `LOGGING-SPEC.md`: Logging specification documentation
 */
export declare const LOG_FILES: {
    readonly decisions: "decisions.md";
    readonly errors: "errors.md";
    readonly activity: "activity.md";
    readonly spec: "LOGGING-SPEC.md";
};
/**
 * State file names.
 *
 * These JSON files store runtime state:
 * - `hooks-state.json`: Hook execution state and session data
 */
export declare const STATE_FILES: {
    readonly hooksState: "hooks-state.json";
};
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
export declare function getGoodVibesDir(cwd: string): string;
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
export declare function getMemoryDir(cwd: string): string;
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
export declare function getLogsDir(cwd: string): string;
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
export declare function getStateDir(cwd: string): string;
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
export declare function getTelemetryDir(cwd: string): string;
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
export declare function getPlansDir(cwd: string): string;
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
export declare function getMemoryFilePath(cwd: string, type: MemoryFileType): string;
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
export declare function getLogFilePath(cwd: string, type: LogFileType): string;
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
export declare function getStateFilePath(cwd: string, type: StateFileType): string;
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
export declare function getTelemetryFilePath(cwd: string, date?: Date): string;
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
export declare function getAllGoodVibesDirs(cwd: string): {
    root: string;
    memory: string;
    logs: string;
    state: string;
    telemetry: string;
    plans: string;
};
