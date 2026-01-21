/**
 * Logging utilities for analysis-engine.
 * Logs to stderr to keep stdout clean for MCP protocol.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'tool';

interface LogEntry {
  level: LogLevel;
  message: string;
  data?: unknown;
  timestamp: string;
}

function formatLog(entry: LogEntry): string {
  const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]`;
  if (entry.data !== undefined) {
    return `${prefix} ${entry.message} ${JSON.stringify(entry.data)}`;
  }
  return `${prefix} ${entry.message}`;
}

function log(level: LogLevel, message: string, data?: unknown): void {
  const entry: LogEntry = {
    level,
    message,
    data,
    timestamp: new Date().toISOString(),
  };
  console.error(formatLog(entry));
}

export const logger = {
  debug: (message: string, data?: unknown) => log('debug', message, data),
  info: (message: string, data?: unknown) => log('info', message, data),
  warn: (message: string, data?: unknown) => log('warn', message, data),
  error: (message: string, data?: unknown) => log('error', message, data),
  tool: (name: string, args?: unknown) => log('tool', `Calling ${name}`, args),
};

/**
 * Log an error message (for backward compatibility with handlers).
 */
export function logError(message: string, error?: unknown): void {
  logger.error(message, error);
}

/**
 * Log a warning message (for backward compatibility with handlers).
 */
export function logWarn(message: string, data?: unknown): void {
  logger.warn(message, data);
}

/**
 * Log an informational message (for backward compatibility with handlers).
 */
export function logInfo(message: string, data?: unknown): void {
  logger.info(message, data);
}
