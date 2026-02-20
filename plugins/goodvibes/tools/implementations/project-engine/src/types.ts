/**
 * Type definitions for project-engine v2.0.0.
 */

import type { ToolResponse } from './shared/response.js';

export type { ToolResponse, ToolResponseContent } from './shared/response.js';

/**
 * Handler function type for MCP tool handlers.
 */
export type ToolHandler = (args: unknown) => Promise<ToolResponse>;
