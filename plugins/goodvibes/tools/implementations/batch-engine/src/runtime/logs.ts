/**
 * Logs Manager for Batch Engine
 *
 * Re-exports the canonical LogsManager from @goodvibes/core.
 * Uses the single source of truth for logging functionality.
 *
 * @see SPEC-v2 Section 14.2.5
 * @module batch-engine/logs
 */

// ============================================================================
// Core Imports
// ============================================================================

import {
  LogsManager as CoreLogsManager,
  ILogsManager,
  createLogsManager as createCoreLogsManager,
  DecisionLogEntry,
  ErrorLogEntry,
  ActivityLogEntry,
  ErrorCategory,
} from '../../../../../src/core/logs.js';

import {
  getLogsDir,
  getLogFilePath,
  LogFileType,
} from '../../../../../src/core/paths.js';

// ============================================================================
// Type Aliases and Re-exports (for backward compatibility)
// ============================================================================

/**
 * LogsManager type - uses core LogsManager implementation.
 */
export type LogsManager = ILogsManager;

/**
 * LogsManagerImpl - re-export the core LogsManager class.
 * Used in batch-engine for type assertions and instantiation.
 */
export { CoreLogsManager as LogsManagerImpl };

/**
 * Re-export the LogsManagerImpl type for type assertions.
 */
export type { CoreLogsManager };

/**
 * Re-export core log entry types.
 */
export type {
  DecisionLogEntry,
  ErrorLogEntry,
  ActivityLogEntry,
  ErrorCategory,
  LogFileType,
};

/**
 * Re-export core path utilities.
 */
export { getLogsDir, getLogFilePath };

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new LogsManager instance.
 *
 * @param projectRoot - The project root directory (defaults to cwd)
 * @returns A new LogsManager instance
 */
export function createLogsManager(projectRoot?: string): LogsManager {
  return createCoreLogsManager(projectRoot ?? process.cwd());
}

/**
 * Singleton logs manager instance.
 */
let globalLogsManager: LogsManager | null = null;

/**
 * Get the global LogsManager instance.
 *
 * @param projectRoot - The project root directory (defaults to cwd)
 * @returns The global LogsManager instance
 */
export function getLogsManager(projectRoot?: string): LogsManager {
  if (!globalLogsManager) {
    globalLogsManager = createLogsManager(projectRoot);
  }
  return globalLogsManager;
}

/**
 * Reset the global LogsManager (useful for testing).
 */
export function resetGlobalLogsManager(): void {
  globalLogsManager = null;
}
