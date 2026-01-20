/**
 * OpenAPI specification helper utilities
 *
 * Provides utilities for working with OpenAPI specifications including
 * path parameter substitution, request body extraction, and response
 * schema resolution.
 *
 * @module handlers/edit/validate-api-contract/openapi-helpers
 */

import type {
  JSONSchema,
  OperationObject,
  ParameterObject,
  PathSubstitutionResult,
} from './types.js';

/**
 * Substitute path parameters in a URL path
 *
 * Replaces {paramName} placeholders with example values or sensible defaults.
 * Returns information about which parameters were substituted and which are missing.
 *
 * @param pathTemplate - Path template with {param} placeholders
 * @param parameters - Array of parameter objects from the spec
 * @returns Object with substituted path, status, and missing parameters
 */
export function substitutePathParams(
  pathTemplate: string,
  parameters: ParameterObject[] | undefined
): PathSubstitutionResult {
  const missing: string[] = [];
  let substituted = false;

  const path = pathTemplate.replace(/\{(\w+)\}/g, (match, paramName) => {
    const param = parameters?.find((p) => p.in === 'path' && p.name === paramName);

    if (param?.example !== undefined) {
      substituted = true;
      return String(param.example);
    }

    // Use sensible defaults based on common parameter names
    const defaults: Record<string, string> = {
      id: '1',
      userId: '1',
      user_id: '1',
      postId: '1',
      post_id: '1',
      itemId: '1',
      item_id: '1',
      slug: 'test',
      uuid: '00000000-0000-0000-0000-000000000001',
      name: 'test',
    };

    if (defaults[paramName]) {
      substituted = true;
      return defaults[paramName];
    }

    // Try schema default or integer type hint
    if (param?.schema?.type === 'integer') {
      substituted = true;
      return '1';
    }

    if (param?.schema?.type === 'string') {
      substituted = true;
      return 'test';
    }

    missing.push(paramName);
    return match; // Keep original if we can't substitute
  });

  return { path, substituted, missing };
}

/**
 * Extract request body example from operation
 *
 * Looks for example values in the requestBody content, checking both
 * the 'example' field and 'examples' collection.
 *
 * @param operation - The OpenAPI operation object
 * @returns The example request body or undefined if not found
 */
export function extractRequestExample(
  operation: OperationObject | undefined
): unknown | undefined {
  if (!operation?.requestBody?.content) {
    return undefined;
  }

  const content = operation.requestBody.content;
  const mediaType = content['application/json'] || Object.values(content)[0];

  if (mediaType?.example !== undefined) {
    return mediaType.example;
  }

  if (mediaType?.examples) {
    const firstExample = Object.values(mediaType.examples)[0];
    if (firstExample?.value !== undefined) {
      return firstExample.value;
    }
  }

  return undefined;
}

/**
 * Get the response schema for a given status code
 *
 * Tries to find a matching response schema in order of precedence:
 * 1. Exact status code match (e.g., "200")
 * 2. Wildcard match (e.g., "2XX")
 * 3. Default response
 *
 * @param operation - The OpenAPI operation object
 * @param statusCode - The HTTP status code received
 * @returns The response schema or undefined if not found
 */
export function getResponseSchema(
  operation: OperationObject,
  statusCode: number
): JSONSchema | undefined {
  // Try exact match first
  const exactResponse = operation.responses[String(statusCode)];
  if (exactResponse?.content) {
    const mediaType =
      exactResponse.content['application/json'] ||
      Object.values(exactResponse.content)[0];
    return mediaType?.schema;
  }

  // Try wildcard matches (2XX, 4XX, etc.)
  const wildcardKey = `${Math.floor(statusCode / 100)}XX`;
  const wildcardResponse = operation.responses[wildcardKey];
  if (wildcardResponse?.content) {
    const mediaType =
      wildcardResponse.content['application/json'] ||
      Object.values(wildcardResponse.content)[0];
    return mediaType?.schema;
  }

  // Try default response
  const defaultResponse = operation.responses['default'];
  if (defaultResponse?.content) {
    const mediaType =
      defaultResponse.content['application/json'] ||
      Object.values(defaultResponse.content)[0];
    return mediaType?.schema;
  }

  return undefined;
}

/**
 * Check if an HTTP status code is documented in the operation
 *
 * Checks for exact match, wildcard match (e.g., 2XX), or default response.
 *
 * @param operation - The OpenAPI operation object
 * @param statusCode - The HTTP status code to check
 * @returns True if the status code is documented
 */
export function isStatusCodeDocumented(
  operation: OperationObject,
  statusCode: number
): boolean {
  const statusStr = String(statusCode);
  const wildcardKey = `${Math.floor(statusCode / 100)}XX`;

  return (
    statusStr in operation.responses ||
    wildcardKey in operation.responses ||
    'default' in operation.responses
  );
}
