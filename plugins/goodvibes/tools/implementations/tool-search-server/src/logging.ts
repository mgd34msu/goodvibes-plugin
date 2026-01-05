/**
 * Logging utilities for GoodVibes MCP Server
 *
 * All logs are written to stderr to avoid interfering with
 * the JSON-RPC communication on stdout.
 */

/**
 * Log an informational message to stderr.
 * Used for startup messages and general status updates.
 *
 * @param message - The message to log
 * @param data - Optional data to include
 */
export function logInfo(message: string, data?: unknown): void {
  const timestamp = new Date().toISOString();
  if (data !== undefined) {
    console.error(`[GoodVibes ${timestamp}] ${message}:`, data);
  } else {
    console.error(`[GoodVibes ${timestamp}] ${message}`);
  }
}

/**
 * Log an error message to stderr.
 * Used for error conditions and failures.
 *
 * @param message - The error message
 * @param error - The error object or details
 */
export function logError(message: string, error?: unknown): void {
  const timestamp = new Date().toISOString();
  if (error !== undefined) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[GoodVibes ${timestamp}] ERROR: ${message}:`, errorMessage);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
  } else {
    console.error(`[GoodVibes ${timestamp}] ERROR: ${message}`);
  }
}

/**
 * Log a debug message to stderr.
 * Used for detailed diagnostic information.
 *
 * @param message - The debug message
 * @param data - Optional data to include
 */
export function logDebug(message: string, data?: unknown): void {
  const timestamp = new Date().toISOString();
  if (data !== undefined) {
    console.error(`[GoodVibes ${timestamp}] DEBUG: ${message}:`, JSON.stringify(data, null, 2));
  } else {
    console.error(`[GoodVibes ${timestamp}] DEBUG: ${message}`);
  }
}
