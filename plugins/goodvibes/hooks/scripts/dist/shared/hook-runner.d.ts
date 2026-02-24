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
import { createResponse } from './hook-io.js';
import { debug, logError } from './logging.js';
import type { HookInput, HookResponse, CreateResponseOptions } from './hook-io.js';
/**
 * Hook handler function type.
 *
 * A function that receives parsed hook input and returns a response.
 * This is the main business logic for any hook implementation.
 *
 * @typeParam TResponse - The response type (defaults to HookResponse)
 * @param input - The parsed hook input from stdin
 * @returns Promise resolving to the hook response
 */
export type HookHandler<TResponse extends HookResponse = HookResponse> = (_input: HookInput) => Promise<TResponse>;
/**
 * Configuration options for the hook runner.
 */
export interface RunHookOptions {
    /**
     * Custom error response creator.
     *
     * Called when an error occurs during hook execution. Returns a HookResponse
     * to send back to Claude Code. Default creates a response with systemMessage
     * containing the error.
     *
     * @param error - The error that occurred during execution
     * @returns A HookResponse to send as the error response
     */
    onError?: (_error: unknown) => HookResponse;
    /**
     * Whether to catch uncaught promise rejections.
     *
     * When true (default), wraps execution in a .catch() handler to ensure
     * all errors are properly handled and a response is always sent.
     *
     * @default true
     */
    catchUncaught?: boolean;
}
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
export declare function isMainModule(importMetaUrl: string): boolean;
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
export declare function runHook<TResponse extends HookResponse = HookResponse>(hookName: string, handler: HookHandler<TResponse>, options?: RunHookOptions): Promise<void>;
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
export declare function runHookSync<TResponse extends HookResponse = HookResponse>(hookName: string, handler: HookHandler<TResponse>, options?: Omit<RunHookOptions, 'catchUncaught'>): Promise<void>;
/**
 * Re-exported types for hook development convenience.
 * @see hook-io.ts for full type documentation
 */
export type { HookInput, HookResponse, CreateResponseOptions };
/**
 * Re-exported functions for hook development convenience.
 * @see hook-io.ts for createResponse documentation
 * @see logging.ts for debug and logError documentation
 */
export { createResponse, debug, logError };
