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
  [key: string]: unknown;
}
