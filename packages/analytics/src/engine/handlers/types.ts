/**
 * Shared handler types and utilities for analytics MCP tool handlers.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Standard MCP tool response format.
 */
export type HandlerResponse = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build an MCP text response from a plain string.
 */
export function text(msg: string): HandlerResponse {
  return { content: [{ type: 'text', text: msg }] };
}
