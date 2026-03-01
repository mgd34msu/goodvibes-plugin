/**
 * OpenAPI pure helper functions for the api domain.
 *
 * Provides conversion and generation utilities for building OpenAPI 3.0.3
 * specifications from route and type information.
 *
 * @module core/api/openapi
 */

import * as yaml from 'js-yaml';

import type { JSONSchema, OpenApiParameter } from './types.js';

/**
 * Convert a Next.js or Express route path to OpenAPI path format.
 *
 * @param routePath - Route path with framework-specific param syntax
 * @returns OpenAPI path with `{param}` syntax
 *
 * @example
 * ```typescript
 * convertRoutePathToOpenApi('/api/users/[id]'); // '/api/users/{id}'
 * convertRoutePathToOpenApi('/api/posts/:postId'); // '/api/posts/{postId}'
 * ```
 */
export function convertRoutePathToOpenApi(routePath: string): string {
  return routePath
    // Convert Next.js dynamic segments: [id] -> {id}
    .replace(/\[([^\]]+)\]/g, '{$1}')
    // Convert Express-style params: :id -> {id}
    .replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '{$1}');
}

/**
 * Extract path parameters from a route path.
 *
 * Supports both Next.js style (`[id]`) and Express style (`:id`) parameters.
 *
 * @param routePath - URL path pattern containing parameter placeholders
 * @returns Array of OpenAPI parameter objects for path parameters
 *
 * @example
 * ```typescript
 * extractPathParameters('/api/users/[id]');
 * // [{ name: 'id', in: 'path', required: true, ... }]
 * ```
 */
export function extractPathParameters(routePath: string): OpenApiParameter[] {
  const params: OpenApiParameter[] = [];

  // Match Next.js style: [id], [slug], etc.
  const nextjsPattern = /\[([^\]]+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = nextjsPattern.exec(routePath)) !== null) {
    params.push({
      name: match[1],
      in: 'path',
      required: true,
      description: `Path parameter: ${match[1]}`,
      schema: { type: 'string' },
    });
  }

  // Match Express style: :id, :postId, etc.
  const expressPattern = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;
  while ((match = expressPattern.exec(routePath)) !== null) {
    // Avoid duplicates
    if (!params.find(p => p.name === match![1])) {
      params.push({
        name: match[1],
        in: 'path',
        required: true,
        description: `Path parameter: ${match[1]}`,
        schema: { type: 'string' },
      });
    }
  }

  return params;
}

/**
 * Generate an operation ID from an HTTP method and route path.
 *
 * Converts the path to camelCase and prefixes with the lowercased method.
 *
 * @param method - HTTP method (GET, POST, etc.)
 * @param routePath - URL path pattern
 * @returns camelCase operation ID string
 *
 * @example
 * ```typescript
 * generateOperationId('GET', '/api/users/[id]'); // 'getUsersById'
 * generateOperationId('POST', '/api/posts'); // 'postPosts'
 * ```
 */
export function generateOperationId(method: string, routePath: string): string {
  // Remove /api prefix if present
  const cleanPath = routePath.replace(/^\/api\/?/, '');

  // Convert path segments to camelCase
  const segments = cleanPath
    .split('/')
    .filter(Boolean)
    .map(segment => {
      // Handle dynamic segments
      const match = segment.match(/\[([^\]]+)\]|:([a-zA-Z_][a-zA-Z0-9_]*)|\{([^}]+)\}/);
      if (match) {
        const paramName = match[1] || match[2] || match[3];
        return `By${paramName.charAt(0).toUpperCase()}${paramName.slice(1)}`;
      }
      return segment;
    });

  // Build operation ID
  const methodPrefix = method.toLowerCase();
  const pathPart = segments
    .map((seg, idx) => idx === 0 ? seg : seg.charAt(0).toUpperCase() + seg.slice(1))
    .join('');

  return pathPart ? `${methodPrefix}${pathPart.charAt(0).toUpperCase()}${pathPart.slice(1)}` : methodPrefix;
}

/**
 * Extract the primary tag from a route path (first segment after /api).
 *
 * @param routePath - URL path pattern
 * @returns Capitalized tag name, or 'Default' if not determinable
 *
 * @example
 * ```typescript
 * extractTag('/api/users/[id]'); // 'Users'
 * extractTag('/api/auth/login'); // 'Auth'
 * ```
 */
export function extractTag(routePath: string): string {
  const match = routePath.match(/^\/api\/([^/\[{]+)/);
  if (match) {
    return match[1].charAt(0).toUpperCase() + match[1].slice(1);
  }
  return 'Default';
}

/**
 * Convert a TypeScript type string to a JSON Schema object.
 *
 * Handles primitives, arrays, Record types, union types, literal types, and Date.
 * Falls back to a `$ref` for unknown named types.
 *
 * @param typeStr - TypeScript type string to convert
 * @returns Corresponding JSON Schema object
 *
 * @example
 * ```typescript
 * typeToJsonSchema('string'); // { type: 'string' }
 * typeToJsonSchema('string[]'); // { type: 'array', items: { type: 'string' } }
 * typeToJsonSchema('string | null'); // { type: 'string', nullable: true }
 * ```
 */
export function typeToJsonSchema(typeStr: string): JSONSchema {
  const trimmed = typeStr.trim();

  // Handle primitive types
  if (trimmed === 'string') return { type: 'string' };
  if (trimmed === 'number') return { type: 'number' };
  if (trimmed === 'boolean') return { type: 'boolean' };
  if (trimmed === 'null') return { nullable: true };
  if (trimmed === 'undefined') return { nullable: true };
  if (trimmed === 'any' || trimmed === 'unknown') return { type: 'object', additionalProperties: true };
  if (trimmed === 'void') return {}; // No response body
  if (trimmed === 'never') return { not: {} }; // Unreachable

  // Handle array types: string[], Array<string>
  const arrayMatch = trimmed.match(/^(.+)\[\]$/) || trimmed.match(/^Array<(.+)>$/);
  if (arrayMatch) {
    return {
      type: 'array',
      items: typeToJsonSchema(arrayMatch[1]),
    };
  }

  // Handle Record type: Record<string, number>
  const recordMatch = trimmed.match(/^Record<(.+),\s*(.+)>$/);
  if (recordMatch) {
    return {
      type: 'object',
      additionalProperties: typeToJsonSchema(recordMatch[2]),
    };
  }

  // Handle union types: string | number
  // Use bracket-aware splitting to handle nested generics like Map<string, A | B>
  if (containsTopLevelUnion(trimmed)) {
    const parts = splitUnionAtTopLevel(trimmed);
    // Check if it's a nullable type
    const nonNullParts = parts.filter(p => p !== 'null' && p !== 'undefined');
    const isNullable = parts.length > nonNullParts.length;

    if (nonNullParts.length === 1) {
      const schema = typeToJsonSchema(nonNullParts[0]);
      schema.nullable = true;
      return schema;
    }

    return {
      oneOf: nonNullParts.map(p => typeToJsonSchema(p)),
      ...(isNullable && { nullable: true }),
    };
  }

  // Handle literal types: "active" | "inactive"
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
    const value = trimmed.slice(1, -1);
    return { type: 'string', enum: [value] };
  }

  // Handle Date type
  if (trimmed === 'Date') {
    return { type: 'string', format: 'date-time' };
  }

  // Default: reference to a schema component
  return { $ref: `#/components/schemas/${trimmed}` };
}

/**
 * Generate an example value from a JSON Schema.
 *
 * Recursively builds example objects matching the schema structure.
 *
 * @param schema - JSON Schema to generate an example for
 * @returns An example value conforming to the schema
 */
export function generateExample(schema: JSONSchema): unknown {
  if (schema.$ref) {
    return { '...': 'Reference object' };
  }

  if (schema.example !== undefined) {
    return schema.example;
  }

  if (schema.default !== undefined) {
    return schema.default;
  }

  if (schema.enum && schema.enum.length > 0) {
    return schema.enum[0];
  }

  switch (schema.type) {
    case 'string':
      if (schema.format === 'date-time') return '2024-01-15T10:30:00Z';
      if (schema.format === 'date') return '2024-01-15';
      if (schema.format === 'email') return 'user@example.com';
      if (schema.format === 'uri') return 'https://example.com';
      if (schema.format === 'uuid') return '550e8400-e29b-41d4-a716-446655440000';
      return 'string';
    case 'number':
    case 'integer':
      return 123;
    case 'boolean':
      return true;
    case 'array':
      if (schema.items) {
        return [generateExample(schema.items)];
      }
      return [];
    case 'object':
      if (schema.properties) {
        const obj: Record<string, unknown> = {};
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          obj[key] = generateExample(propSchema);
        }
        return obj;
      }
      return {};
    default:
      return null;
  }
}

/**
 * Create a default request body JSON Schema based on the HTTP method.
 *
 * Returns null for methods that typically lack a request body (GET, DELETE, HEAD, OPTIONS).
 *
 * @param method - HTTP method string (uppercase)
 * @returns A generic schema for request bodies, or null if not applicable
 */
export function createDefaultRequestSchema(method: string): JSONSchema | null {
  // GET, DELETE, HEAD typically don't have request bodies
  if (['GET', 'DELETE', 'HEAD', 'OPTIONS'].includes(method)) {
    return null;
  }

  // POST, PUT, PATCH typically do
  return {
    type: 'object',
    properties: {},
    additionalProperties: true,
    description: 'Request body (schema not detected)',
  };
}

/**
 * Create a default response JSON Schema.
 *
 * @returns A generic schema indicating an undetected response body
 */
export function createDefaultResponseSchema(): JSONSchema {
  return {
    type: 'object',
    properties: {},
    additionalProperties: true,
    description: 'Response body (schema not detected)',
  };
}

/**
 * Resolve path parameter placeholders in an OpenAPI path with example values.
 *
 * Replaces `{paramName}` segments with the parameter's example value or 'test-id'.
 *
 * @param urlPath - OpenAPI path string with `{param}` placeholders
 * @param params - Array of parameter definitions including optional examples
 * @returns Resolved path with placeholders replaced by example values
 *
 * @example
 * ```typescript
 * resolvePathParams('/api/users/{id}', [{ name: 'id', example: '42', in: 'path' }]);
 * // '/api/users/42'
 * ```
 */
export function resolvePathParams(
  urlPath: string,
  params: Array<{ name: string; in: string; example?: unknown }>
): string {
  let resolvedPath = urlPath;
  for (const param of params) {
    if (param.in === 'path') {
      const value = param.example || 'test-id';
      resolvedPath = resolvedPath.replace(`{${param.name}}`, String(value));
    }
  }
  return resolvedPath;
}

/**
 * Convert a JavaScript value to YAML string representation.
 *
 * Uses js-yaml for reliable serialization of OpenAPI spec objects.
 *
 * @param obj - The value to serialize to YAML
 * @returns YAML string representation of the value
 */
export function toYaml(obj: unknown): string {
  return yaml.dump(obj, { lineWidth: -1, noRefs: true });
}

/**
 * Check whether a type string contains a ` | ` union operator at the top level
 * (i.e., not nested inside angle brackets, curly braces, or parentheses).
 *
 * @param typeStr - The type string to check
 * @returns True if there is a top-level union operator
 */
function containsTopLevelUnion(typeStr: string): boolean {
  let depth = 0;
  for (let i = 0; i < typeStr.length - 2; i++) {
    const ch = typeStr[i];
    if (ch === '<' || ch === '{' || ch === '(') depth++;
    else if (ch === '>' || ch === '}' || ch === ')') depth--;
    else if (depth === 0 && typeStr[i] === ' ' && typeStr[i + 1] === '|' && typeStr[i + 2] === ' ') {
      return true;
    }
  }
  return false;
}

/**
 * Split a union type string on ` | ` operators at the top level only.
 *
 * Correctly handles nested generics like `Map<string, A | B>`.
 *
 * @param typeStr - The union type string to split
 * @returns Array of type parts
 */
function splitUnionAtTopLevel(typeStr: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < typeStr.length; i++) {
    const ch = typeStr[i];
    if (ch === '<' || ch === '{' || ch === '(') depth++;
    else if (ch === '>' || ch === '}' || ch === ')') depth--;
    else if (depth === 0 && typeStr.slice(i, i + 3) === ' | ') {
      parts.push(typeStr.slice(start, i).trim());
      i += 2; // skip ` |`
      start = i + 1; // skip space
    }
  }
  parts.push(typeStr.slice(start).trim());
  return parts;
}
