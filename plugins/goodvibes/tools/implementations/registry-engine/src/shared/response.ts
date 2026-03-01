/**
 * MCP response helpers for registry-engine.
 * ok() for success responses, fail() for error responses.
 */

import type { McpResponse } from './types.js';

/**
 * Create a successful MCP response.
 */
export function ok(data: unknown): McpResponse {
  return {
    content: [{
      type: 'text',
      text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
    }],
  };
}

/**
 * Create an error MCP response.
 */
export function fail(message: string): McpResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}
