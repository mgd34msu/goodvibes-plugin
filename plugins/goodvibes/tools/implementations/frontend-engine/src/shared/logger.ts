/**
 * Logging utilities for frontend-engine.
 *
 * Logs to stderr to keep stdout clean for MCP protocol.
 * All log output uses console.error per MCP requirements.
 *
 * @module shared/logger
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Log severity levels.
 * 'tool' is preserved for backwards compatibility; prefer 'request' for new code.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'tool' | 'request';

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
 *
 * Use logger.request() or logger.tool() to log MCP tool invocations.
 */
export const logger = {
  debug: (message: string, data?: unknown) => log('debug', message, data),
  info: (message: string, data?: unknown) => log('info', message, data),
  warn: (message: string, data?: unknown) => log('warn', message, data),
  error: (message: string, data?: unknown) => log('error', message, data),
  /** Log an MCP tool/handler invocation. */
  tool: (name: string, args?: unknown) => log('tool', `Calling ${name}`, args),
  /** Log an MCP tool/handler invocation. Alias for tool(). */
  request: (name: string, args?: unknown) => log('request', `Calling ${name}`, args),
};
