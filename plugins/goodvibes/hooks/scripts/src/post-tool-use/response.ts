/**
 * Response Utilities for Post-Tool-Use Hook
 *
 * Common response creation and message handling.
 */

import type { HookResponse } from '../shared.js';

/**
 * Interface for collecting automation messages.
 */
export interface AutomationMessages {
  messages: string[];
}

/**
 * Creates a hook response with optional system message.
 */
export function createResponse(systemMessage?: string): HookResponse {
  return {
    continue: true,
    systemMessage,
  };
}

/**
 * Combines multiple automation messages into a single system message.
 */
export function combineMessages(messages: string[]): string | undefined {
  return messages.length > 0 ? messages.join(' | ') : undefined;
}
