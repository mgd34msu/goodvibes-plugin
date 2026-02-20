/**
 * Response utilities for MCP handlers
 *
 * Provides standardized response construction functions for MCP tool handlers.
 * This module centralizes the response patterns used across all handlers to
 * ensure consistency and reduce code duplication.
 *
 * @module shared/response
 */

// =============================================================================
// Response Types
// =============================================================================

/**
 * Standard MCP tool response content item.
 */
export interface ToolResponseContent {
  type: 'text';
  text: string;
}

/**
 * Standard MCP tool response format.
 * Used as the return type for all MCP tool handlers.
 */
export interface ToolResponse {
  content: ToolResponseContent[];
  isError?: boolean;
}

// =============================================================================
// Success Response Helpers
// =============================================================================

/**
 * Create a successful MCP tool response with JSON content.
 *
 * Serializes the data object to formatted JSON and wraps it in the
 * standard MCP response format.
 *
 * @template T - The type of data being serialized
 * @param data - The data to serialize as JSON
 * @returns Formatted tool response with JSON content
 *
 * @example
 * ```typescript
 * return createSuccessResponse({
 *   files: ['a.ts', 'b.ts'],
 *   count: 2
 * });
 * // Returns: { content: [{ type: 'text', text: '{\n  "files": [...],\n  "count": 2\n}' }] }
 * ```
 */
export function createSuccessResponse<T>(data: T): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Create a successful MCP tool response with plain text content.
 *
 * Use this for responses that should contain plain text rather than JSON,
 * such as file contents, markdown, or formatted output.
 *
 * @param text - The text content to return
 * @returns Formatted tool response with text content
 *
 * @example
 * ```typescript
 * return createTextResponse('# Skill Content\n\nThis is the skill...');
 * ```
 */
export function createTextResponse(text: string): ToolResponse {
  return {
    content: [{ type: 'text', text }],
  };
}

// =============================================================================
// Error Response Helpers
// =============================================================================

/**
 * Create an error MCP tool response.
 *
 * Returns a response with isError: true, which indicates to the MCP client
 * that the operation failed. The error is serialized as JSON with an
 * "error" field and optional additional context.
 *
 * @param message - The error message
 * @param context - Optional additional context to include in the response
 * @returns Formatted error response
 *
 * @example
 * ```typescript
 * return createErrorResponse('File not found', { path: '/missing/file.ts' });
 * // Returns: { content: [{ type: 'text', text: '{ "error": "File not found", "path": "..." }' }], isError: true }
 * ```
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

/**
 * Create an error response from an Error object or unknown error.
 *
 * Safely extracts the error message from various error types and creates
 * a standardized error response.
 *
 * @param error - The error object (Error, string, or unknown)
 * @param prefix - Optional prefix for the error message
 * @returns Formatted error response
 *
 * @example
 * ```typescript
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   return createErrorFromException(error, 'Operation failed');
 * }
 * ```
 */
export function createErrorFromException(
  error: unknown,
  prefix?: string
): ToolResponse {
  const message = error instanceof Error ? error.message : String(error);
  const fullMessage = prefix ? `${prefix}: ${message}` : message;
  return createErrorResponse(fullMessage);
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Create a "not found" error response for resources.
 *
 * Convenience function for the common case of returning an error
 * when a requested resource doesn't exist.
 *
 * @param resourceType - Type of resource (e.g., 'Skill', 'File', 'Template')
 * @param identifier - The identifier that wasn't found
 * @returns Formatted error response
 *
 * @example
 * ```typescript
 * if (!skill) {
 *   return createNotFoundResponse('Skill', args.path);
 * }
 * ```
 */
export function createNotFoundResponse(
  resourceType: string,
  identifier: string
): ToolResponse {
  return createErrorResponse(`${resourceType} not found: ${identifier}`);
}

/**
 * Create a validation error response for missing required arguments.
 *
 * @param argumentName - Name of the missing argument
 * @returns Formatted error response
 *
 * @example
 * ```typescript
 * if (!args.file) {
 *   return createMissingArgumentResponse('file');
 * }
 * ```
 */
export function createMissingArgumentResponse(argumentName: string): ToolResponse {
  return createErrorResponse(`Missing required argument: ${argumentName}`);
}

/**
 * Create a validation error response for invalid argument values.
 *
 * @param argumentName - Name of the invalid argument
 * @param reason - Explanation of why the value is invalid
 * @returns Formatted error response
 *
 * @example
 * ```typescript
 * if (args.line < 1) {
 *   return createInvalidArgumentResponse('line', 'must be a positive integer');
 * }
 * ```
 */
export function createInvalidArgumentResponse(
  argumentName: string,
  reason: string
): ToolResponse {
  return createErrorResponse(`Invalid ${argumentName}: ${reason}`);
}
