/**
 * Response construction utilities for MCP tool handlers.
 *
 * Provides standardized, short-named factory functions for building MCP
 * responses. All functions return McpResponse. Import McpResponse and
 * McpContent from './types.js' for type-only references.
 *
 * @module shared/response
 */

import type { McpContent, McpResponse } from './types.js';

// Re-export types for consumers that import from this module
export type { McpContent, McpResponse };

// =============================================================================
// Legacy Type Aliases (backwards compatibility)
// =============================================================================

/** @deprecated Use McpContent */
export type ToolResponseContent = McpContent;

/** @deprecated Use McpResponse */
export type ToolResponse = McpResponse;

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
 * @param data - The data to serialize as formatted JSON
 * @returns McpResponse with JSON content
 *
 * @example
 * ```typescript
 * return ok({ files: ['a.ts', 'b.ts'], count: 2 });
 * ```
 */
export function ok<T>(data: T): McpResponse {
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
 * @param textContent - The text content to return
 * @returns McpResponse with plain text content
 *
 * @example
 * ```typescript
 * return text('# Skill Content\n\nThis is the skill...');
 * ```
 */
export function text(textContent: string): McpResponse {
  return {
    content: [{ type: 'text', text: textContent }],
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
 * @returns McpResponse with isError: true
 *
 * @example
 * ```typescript
 * return fail('File not found', { path: '/missing/file.ts' });
 * ```
 */
export function fail(
  message: string,
  context?: Record<string, unknown>
): McpResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message, ...context }, null, 2) }],
    isError: true,
  };
}

/**
 * Create an error response from an Error object or unknown thrown value.
 *
 * Safely extracts the error message from various error types and creates
 * a standardized error response.
 *
 * @param error - The error object (Error, string, or unknown)
 * @param prefix - Optional prefix for the error message
 * @returns McpResponse with isError: true
 *
 * @example
 * ```typescript
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   return failFromException(error, 'Operation failed');
 * }
 * ```
 */
export function failFromException(
  error: unknown,
  prefix?: string
): McpResponse {
  const message = error instanceof Error ? error.message : String(error);
  const fullMessage = prefix ? `${prefix}: ${message}` : message;
  return fail(fullMessage);
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
 * @returns McpResponse with isError: true
 *
 * @example
 * ```typescript
 * if (!skill) return notFound('Skill', args.path);
 * ```
 */
export function notFound(
  resourceType: string,
  identifier: string
): McpResponse {
  return fail(`${resourceType} not found: ${identifier}`);
}

/**
 * Create a validation error response for missing required arguments.
 *
 * @param argumentName - Name of the missing argument
 * @returns McpResponse with isError: true
 *
 * @example
 * ```typescript
 * if (!args.file) return missingArg('file');
 * ```
 */
export function missingArg(argumentName: string): McpResponse {
  return fail(`Missing required argument: ${argumentName}`);
}

/**
 * Create a validation error response for invalid argument values.
 *
 * @param argumentName - Name of the invalid argument
 * @param reason - Explanation of why the value is invalid
 * @returns McpResponse with isError: true
 *
 * @example
 * ```typescript
 * if (args.line < 1) return invalidArg('line', 'must be a positive integer');
 * ```
 */
export function invalidArg(
  argumentName: string,
  reason: string
): McpResponse {
  return fail(`Invalid ${argumentName}: ${reason}`);
}

// =============================================================================
// Legacy Function Aliases (backwards compatibility)
// =============================================================================

/** @deprecated Use ok() */
export const createSuccessResponse = ok;

/** @deprecated Use text() */
export const createTextResponse = text;

/** @deprecated Use fail() */
export const createErrorResponse = fail;

/** @deprecated Use failFromException() */
export const createErrorFromException = failFromException;

/** @deprecated Use notFound() */
export const createNotFoundResponse = notFound;

/** @deprecated Use missingArg() */
export const createMissingArgumentResponse = missingArg;

/** @deprecated Use invalidArg() */
export const createInvalidArgumentResponse = invalidArg;
