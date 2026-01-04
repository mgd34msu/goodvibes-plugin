/**
 * Logging
 *
 * Debug logging and error reporting utilities for hook scripts.
 */
/**
 * Log debug message to stderr (visible in Claude Code logs but won't affect hook response)
 */
export function debug(message, data) {
    const timestamp = new Date().toISOString();
    if (data !== undefined) {
        console.error(`[GoodVibes ${timestamp}] ${message}:`, JSON.stringify(data, null, 2));
    }
    else {
        console.error(`[GoodVibes ${timestamp}] ${message}`);
    }
}
/**
 * Log error to stderr with full stack trace
 */
export function logError(context, error) {
    const timestamp = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error(`[GoodVibes ${timestamp}] ERROR in ${context}: ${message}`);
    if (stack) {
        console.error(stack);
    }
}
