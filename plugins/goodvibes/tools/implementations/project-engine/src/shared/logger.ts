/**
 * Logging utilities for project-engine v2.0.0.
 *
 * Logs to stderr to keep stdout clean for MCP protocol.
 * All log output uses console.error per MCP requirements.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Log severity levels.
 * 'request' replaces the legacy 'tool' level for cross-engine reuse.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'request';

/**
 * A structured log entry.
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  data?: unknown;
  timestamp: string;
}

// =============================================================================
// Formatting
// =============================================================================

/**
 * Format a log entry as a string.
 *
 * @param entry - The log entry to format
 * @returns Formatted log string with timestamp and level prefix
 */
export function formatLog(entry: LogEntry): string {
  const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]`;
  if (entry.data !== undefined) {
    return `${prefix} ${entry.message} ${JSON.stringify(entry.data)}`;
  }
  return `${prefix} ${entry.message}`;
}

// =============================================================================
// Core Logger
// =============================================================================

function log(level: LogLevel, message: string, data?: unknown): void {
  const entry: LogEntry = {
    level,
    message,
    data,
    timestamp: new Date().toISOString(),
  };
  console.error(formatLog(entry));
}

/**
 * Logger instance with per-level methods.
 * Use logger.request() instead of the deprecated logger.tool().
 */
export const logger = {
  debug: (message: string, data?: unknown) => log('debug', message, data),
  info: (message: string, data?: unknown) => log('info', message, data),
  warn: (message: string, data?: unknown) => log('warn', message, data),
  error: (message: string, data?: unknown) => log('error', message, data),
  /** Log an MCP tool/handler invocation. */
  request: (name: string, args?: unknown) => log('request', `Calling ${name}`, args),
};

// =============================================================================
// Convenience Helpers
// =============================================================================

/**
 * Log an error with a descriptive message.
 *
 * @param message - Human-readable description of the error
 * @param error - The error value (Error object, string, or unknown)
 */
export function logError(message: string, error?: unknown): void {
  logger.error(message, error);
}

/**
 * Log a warning with an optional data payload.
 *
 * @param message - Human-readable warning message
 * @param data - Optional additional context
 */
export function logWarn(message: string, data?: unknown): void {
  logger.warn(message, data);
}
