/**
 * Core MCP response types for frontend-engine.
 *
 * @module shared/types
 */

// =============================================================================
// MCP Response Types
// =============================================================================

/**
 * A single content item in an MCP tool response.
 */
export interface McpContent {
  type: 'text';
  text: string;
}

/**
 * Standard MCP tool response format.
 * Used as the return type for all MCP tool handlers.
 */
export interface McpResponse {
  content: McpContent[];
  isError?: boolean;
}
