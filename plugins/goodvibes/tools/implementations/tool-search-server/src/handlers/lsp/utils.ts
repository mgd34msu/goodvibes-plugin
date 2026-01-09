/**
 * Shared utilities for LSP handlers
 *
 * Provides common response formatting, path manipulation, and preview helpers
 * used across all LSP tool handlers.
 *
 * @module handlers/lsp/utils
 */

import * as path from 'path';
import type ts from 'typescript';

// =============================================================================
// Response Types
// =============================================================================

/**
 * Standard MCP tool response format.
 */
export interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

// =============================================================================
// Response Helpers
// =============================================================================

/**
 * Create a successful MCP tool response with JSON content.
 *
 * @param data - The data to serialize as JSON
 * @returns Formatted tool response
 */
export function createSuccessResponse<T>(data: T): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Create an error MCP tool response.
 *
 * @param message - The error message
 * @param context - Optional additional context to include
 * @returns Formatted error response
 */
export function createErrorResponse(
  message: string,
  context?: Record<string, unknown>
): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message, ...context }, null, 2) }],
    isError: true,
  };
}

// =============================================================================
// Path Helpers
// =============================================================================

/**
 * Normalize a file path to use forward slashes.
 *
 * @param filePath - The file path to normalize
 * @returns Normalized path with forward slashes
 */
export function normalizeFilePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

/**
 * Make an absolute path relative to a project root.
 *
 * @param absolutePath - The absolute file path
 * @param projectRoot - The project root directory
 * @returns Relative path with forward slashes
 */
export function makeRelativePath(absolutePath: string, projectRoot: string): string {
  return normalizeFilePath(path.relative(projectRoot, absolutePath));
}

/**
 * Resolve a file path to an absolute path.
 *
 * @param filePath - The file path (relative or absolute)
 * @param projectRoot - The project root directory
 * @returns Absolute file path
 */
export function resolveFilePath(filePath: string, projectRoot: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(projectRoot, filePath);
}

// =============================================================================
// Preview Helpers
// =============================================================================

/** Maximum length for line previews */
const MAX_PREVIEW_LENGTH = 120;

/**
 * Get a preview of a specific line from a source file via the language service.
 *
 * @param service - The TypeScript language service
 * @param fileName - The file name to get preview from
 * @param line - The 1-based line number
 * @returns The line content (trimmed and truncated if needed), or empty string on error
 */
export function getLinePreview(
  service: ts.LanguageService,
  fileName: string,
  line: number
): string {
  try {
    const sourceFile = service.getProgram()?.getSourceFile(fileName);
    if (!sourceFile) return '';

    const lineStarts = sourceFile.getLineStarts();
    if (line < 1 || line > lineStarts.length) return '';

    const lineStart = lineStarts[line - 1];
    const lineEnd = line < lineStarts.length ? lineStarts[line] : sourceFile.text.length;
    const lineText = sourceFile.text.slice(lineStart, lineEnd).replace(/[\r\n]+$/, '').trim();

    return lineText.length > MAX_PREVIEW_LENGTH
      ? lineText.slice(0, MAX_PREVIEW_LENGTH) + '...'
      : lineText;
  } catch {
    return '';
  }
}

/**
 * Get a preview of a line from a source file object directly.
 *
 * @param sourceFile - The TypeScript source file
 * @param line - The 1-based line number
 * @returns The line content (trimmed and truncated if needed), or empty string on error
 */
export function getPreviewFromSourceFile(
  sourceFile: ts.SourceFile,
  line: number
): string {
  try {
    const lineStart = sourceFile.getPositionOfLineAndCharacter(line - 1, 0);
    const lineEnd = line < sourceFile.getLineStarts().length
      ? sourceFile.getPositionOfLineAndCharacter(line, 0)
      : sourceFile.text.length;

    const preview = sourceFile.text.slice(lineStart, lineEnd).trim();

    return preview.length > MAX_PREVIEW_LENGTH
      ? preview.slice(0, MAX_PREVIEW_LENGTH) + '...'
      : preview;
  } catch {
    return '';
  }
}
