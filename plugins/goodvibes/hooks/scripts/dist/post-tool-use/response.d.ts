/**
 * Response Utilities for Post-Tool-Use Hook
 *
 * Common response creation and message handling.
 */
import type { HookResponse } from '../shared/index.js';
/**
 * Interface for collecting automation messages.
 */
export interface AutomationMessages {
    messages: string[];
}
/**
 * Creates a hook response with optional system message.
 * All hook handlers should use this to ensure consistent response format.
 *
 * @param systemMessage - Optional message to display in the system output
 * @returns HookResponse object with continue=true and optional systemMessage
 *
 * @example
 * // Response with no message
 * respond(createResponse());
 *
 * @example
 * // Response with error message
 * respond(createResponse('Build failed: 3 type errors'));
 */
export declare function createResponse(systemMessage?: string): HookResponse;
/**
 * Combines multiple automation messages into a single system message.
 * Joins messages with ' | ' separator for display in system output.
 *
 * @param messages - Array of message strings to combine
 * @returns Combined string with ' | ' separator, or undefined if no messages
 *
 * @example
 * const combined = combineMessages(['Tests passed', 'Build OK']);
 * // Returns: 'Tests passed | Build OK'
 *
 * @example
 * const combined = combineMessages([]);
 * // Returns: undefined
 */
export declare function combineMessages(messages: string[]): string | undefined;
