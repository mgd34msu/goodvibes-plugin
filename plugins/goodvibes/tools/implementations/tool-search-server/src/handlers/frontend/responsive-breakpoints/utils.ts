/**
 * Utility functions for Analyze Responsive Breakpoints
 *
 * @module handlers/frontend/responsive-breakpoints/utils
 */

import * as path from 'path';
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

// =============================================================================
// Path Helpers
// =============================================================================

export function normalizeFilePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

export function makeRelativePath(absolutePath: string, projectRoot: string): string {
  return normalizeFilePath(path.relative(projectRoot, absolutePath));
}
