/**
 * MCP response type definitions for registry-engine shared layer.
 */

export interface McpContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
}

export interface McpResponse {
  content: McpContent[];
  isError?: boolean;
  // Required by the MCP SDK: CallToolResult extends this shape and the SDK
  // spreads additional fields onto responses at runtime. Without this index
  // signature, TypeScript rejects valid MCP response objects.
  [key: string]: unknown;
}
