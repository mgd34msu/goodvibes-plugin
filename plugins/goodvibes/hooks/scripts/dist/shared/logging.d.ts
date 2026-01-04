/**
 * Logging
 *
 * Debug logging and error reporting utilities for hook scripts.
 */
/**
 * Log debug message to stderr (visible in Claude Code logs but won't affect hook response)
 */
export declare function debug(message: string, data?: unknown): void;
/**
 * Log error to stderr with full stack trace
 */
export declare function logError(context: string, error: unknown): void;
