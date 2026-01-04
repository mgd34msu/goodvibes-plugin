/**
 * Logging
 *
 * Debug logging and error reporting utilities for hook scripts.
 */
/**
 * Logs a debug message to stderr with timestamp.
 *
 * Messages are written to stderr so they appear in Claude Code logs
 * without interfering with the JSON response on stdout.
 *
 * @param message - The debug message to log
 * @param data - Optional data object to include (will be JSON-stringified)
 *
 * @example
 * // Simple message
 * debug('Hook started');
 * // Output: [GoodVibes 2024-01-15T10:30:00.000Z] Hook started
 *
 * @example
 * // Message with data
 * debug('Processing tool', { tool: 'Bash', command: 'npm test' });
 * // Output: [GoodVibes 2024-01-15T10:30:00.000Z] Processing tool:
 * // { "tool": "Bash", "command": "npm test" }
 */
export declare function debug(message: string, data?: unknown): void;
/**
 * Logs an error to stderr with context and full stack trace.
 *
 * Provides structured error output including:
 * - Timestamp for correlation with other logs
 * - Context string to identify where the error occurred
 * - Error message and stack trace (if available)
 *
 * @param context - A description of where the error occurred (e.g., 'readConfig', 'validateInput')
 * @param error - The error object or any value that was thrown
 *
 * @example
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   logError('riskyOperation', error);
 * }
 * // Output: [GoodVibes 2024-01-15T10:30:00.000Z] ERROR in riskyOperation: Something went wrong
 * // Error: Something went wrong
 * //     at riskyOperation (file.ts:42:5)
 * //     ...
 */
export declare function logError(context: string, error: unknown): void;
