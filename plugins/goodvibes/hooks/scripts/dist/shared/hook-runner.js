/**
 * Shared Hook Runner
 *
 * Provides common boilerplate for hook entry points:
 * - Input reading from stdin
 * - Error handling patterns
 * - Main module detection
 * - Response output
 *
 * Usage:
 * ```ts
 * import { runHook, isMainModule } from './shared/hook-runner.js';
 *
 * async function myHookHandler(input: HookInput): Promise<HookResponse> {
 *   // Hook logic here
 *   return { continue: true };
 * }
 *
 * if (isMainModule(import.meta.url)) {
 *   runHook('MyHook', myHookHandler);
 * }
 * ```
 */
import { readHookInput, respond, createResponse } from './hook-io.js';
import { debug, logError } from './logging.js';
/**
 * Check if the current module is the main entry point.
 *
 * @param importMetaUrl - The import.meta.url of the calling module
 * @returns True if this is the main module being executed
 *
 * @example
 * ```ts
 * if (isMainModule(import.meta.url)) {
 *   runHook('MyHook', handler);
 * }
 * ```
 */
export function isMainModule(importMetaUrl) {
    // Normalize paths for cross-platform comparison
    const normalizedUrl = importMetaUrl.replace(/\\/g, '/').toLowerCase();
    let normalizedArgv = process.argv[1]?.replace(/\\/g, '/').toLowerCase() || '';
    // Handle Windows absolute paths (C:/path) by adding file:/// prefix
    if (normalizedArgv.match(/^[a-z]:/i)) {
        normalizedArgv = `file:///${normalizedArgv}`;
    }
    else if (!normalizedArgv.startsWith('file://')) {
        normalizedArgv = `file://${normalizedArgv}`;
    }
    return normalizedUrl === normalizedArgv;
}
/**
 * Create a default error response.
 *
 * @param hookName - Name of the hook for error message
 * @param error - The error that occurred
 * @returns A hook response with error message
 */
function createErrorResponse(hookName, error) {
    const message = error instanceof Error ? error.message : String(error);
    return createResponse({
        systemMessage: `${hookName} error: ${message}`,
    });
}
/**
 * Run a hook with standard error handling and input/output.
 *
 * This function:
 * 1. Reads input from stdin using readHookInput()
 * 2. Calls the handler with the parsed input
 * 3. Sends the response using respond()
 * 4. Handles any errors with logging and error response
 *
 * @param hookName - Name of the hook for logging
 * @param handler - The hook handler function
 * @param options - Optional configuration
 *
 * @example
 * ```ts
 * async function handleNotification(input: HookInput): Promise<HookResponse> {
 *   debug('Processing notification', { session_id: input.session_id });
 *   return createResponse();
 * }
 *
 * runHook('Notification', handleNotification);
 * ```
 */
export async function runHook(hookName, handler, options = {}) {
    const { onError, catchUncaught = true } = options;
    const handleError = (context, error) => {
        logError(`${hookName} ${context}`, error);
        const response = onError
            ? onError(error)
            : createErrorResponse(hookName, error);
        respond(response);
    };
    const execute = async () => {
        try {
            debug(`${hookName} hook starting`);
            const input = await readHookInput();
            debug(`${hookName} received input`, {
                hook_event_name: input.hook_event_name,
                session_id: input.session_id,
                tool_name: input.tool_name,
            });
            const response = await handler(input);
            respond(response);
        }
        catch (error) {
            handleError('main', error);
        }
    };
    /* v8 ignore start - defensive error handler */
    if (catchUncaught) {
        execute().catch((error) => {
            handleError('uncaught', error);
        });
    }
    else {
        await execute();
    }
    /* v8 ignore stop */
}
/**
 * Runs a hook synchronously without the uncaught rejection handler.
 *
 * Use this variant when you need to await the hook completion and handle
 * errors yourself. Unlike runHook, this function will throw if an error
 * occurs after the try/catch block.
 *
 * @typeParam TResponse - The response type (defaults to HookResponse)
 * @param hookName - Name of the hook for logging purposes
 * @param handler - The hook handler function to execute
 * @param options - Optional configuration (catchUncaught is always false)
 * @returns Promise that resolves when the hook completes
 */
export async function runHookSync(hookName, handler, options = {}) {
    await runHook(hookName, handler, { ...options, catchUncaught: false });
}
/**
 * Re-exported functions for hook development convenience.
 * @see hook-io.ts for createResponse documentation
 * @see logging.ts for debug and logError documentation
 */
export { createResponse, debug, logError };
