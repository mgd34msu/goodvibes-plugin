/**
 * Utility functions for Analyze Stacking Context
 *
 * @module handlers/frontend/stacking-context/utils
 */

import type { ToolResponse } from './types.js';

// =============================================================================
// Response Helpers
// =============================================================================

export function createSuccessResponse<T>(data: T): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

export function createErrorResponse(message: string, context?: Record<string, unknown>): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message, ...context }, null, 2) }],
    isError: true,
  };
}
