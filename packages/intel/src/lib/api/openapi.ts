/**
 * OpenAPI generation helpers for `api_spec`.
 *
 * Ported near-verbatim from v1 project-engine `core/api/openapi.ts`. The
 * disk-write path (`fs.writeFileSync` in the v1 extension) does NOT port —
 * intel is read-only by design (§4.1 api_spec row: "read-only"); `toYaml`
 * still produces the YAML text in-memory for callers that want it in the
 * response, but nothing here touches the filesystem.
 *
 * @module lib/api/openapi
 */

import * as yaml from 'js-yaml';

import type { JSONSchema, OpenApiParameter } from './types.js';

/**
 * Convert a Next.js or Express route path to OpenAPI `{param}` syntax.
 * @example convertRoutePathToOpenApi('/api/users/[id]') // '/api/users/{id}'
 * @example convertRoutePathToOpenApi('/api/posts/:postId') // '/api/posts/{postId}'
 */
export function convertRoutePathToOpenApi(routePath: string): string {
  return routePath
    .replace(/\[([^\]]+)\]/g, '{$1}') // Next.js dynamic segments
    .replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '{$1}'); // Express-style params
}

/**
 * Extract path parameters from a route path (Next.js `[id]` and Express `:id` styles).
 */
export function extractPathParameters(routePath: string): OpenApiParameter[] {
  const params: OpenApiParameter[] = [];

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

  const expressPattern = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;
  while ((match = expressPattern.exec(routePath)) !== null) {
    if (!params.find((p) => p.name === match![1])) {
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
 * Generate a camelCase operation ID from an HTTP method and route path.
 * @example generateOperationId('GET', '/api/users/[id]') // 'getUsersById'
 */
export function generateOperationId(method: string, routePath: string): string {
  const cleanPath = routePath.replace(/^\/api\/?/, '');

  const segments = cleanPath
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      const match = segment.match(/\[([^\]]+)\]|:([a-zA-Z_][a-zA-Z0-9_]*)|\{([^}]+)\}/);
      if (match) {
        const paramName = match[1] || match[2] || match[3];
        return `By${paramName.charAt(0).toUpperCase()}${paramName.slice(1)}`;
      }
      return segment;
    });

  const methodPrefix = method.toLowerCase();
  const pathPart = segments.map((seg, idx) => (idx === 0 ? seg : seg.charAt(0).toUpperCase() + seg.slice(1))).join('');

  return pathPart ? `${methodPrefix}${pathPart.charAt(0).toUpperCase()}${pathPart.slice(1)}` : methodPrefix;
}

/** Extract the primary tag from a route path (first segment after /api). */
export function extractTag(routePath: string): string {
  const match = routePath.match(/^\/api\/([^/[{]+)/);
  if (match) {return match[1].charAt(0).toUpperCase() + match[1].slice(1);}
  return 'Default';
}

/**
 * Convert a TypeScript type string to a JSON Schema object. Handles
 * primitives, arrays, Record types, union types, literal types, and Date;
 * falls back to a `$ref` for unknown named types.
 */
export function typeToJsonSchema(typeStr: string): JSONSchema {
  const trimmed = typeStr.trim();

  if (trimmed === 'string') {return { type: 'string' };}
  if (trimmed === 'number') {return { type: 'number' };}
  if (trimmed === 'boolean') {return { type: 'boolean' };}
  if (trimmed === 'null') {return { nullable: true };}
  if (trimmed === 'undefined') {return { nullable: true };}
  if (trimmed === 'any' || trimmed === 'unknown') {return { type: 'object', additionalProperties: true };}
  if (trimmed === 'void') {return {};}
  if (trimmed === 'never') {return { not: {} };}

  const arrayMatch = trimmed.match(/^(.+)\[\]$/) || trimmed.match(/^Array<(.+)>$/);
  if (arrayMatch) {
    return { type: 'array', items: typeToJsonSchema(arrayMatch[1]) };
  }

  const recordMatch = trimmed.match(/^Record<(.+),\s*(.+)>$/);
  if (recordMatch) {
    return { type: 'object', additionalProperties: typeToJsonSchema(recordMatch[2]) };
  }

  if (containsTopLevelUnion(trimmed)) {
    const parts = splitUnionAtTopLevel(trimmed);
    const nonNullParts = parts.filter((p) => p !== 'null' && p !== 'undefined');
    const isNullable = parts.length > nonNullParts.length;

    if (nonNullParts.length === 1) {
      const schema = typeToJsonSchema(nonNullParts[0]);
      schema.nullable = true;
      return schema;
    }

    return {
      oneOf: nonNullParts.map((p) => typeToJsonSchema(p)),
      ...(isNullable && { nullable: true }),
    };
  }

  if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
    const value = trimmed.slice(1, -1);
    return { type: 'string', enum: [value] };
  }

  if (trimmed === 'Date') {return { type: 'string', format: 'date-time' };}

  return { $ref: `#/components/schemas/${trimmed}` };
}

/** Generate an example value from a JSON Schema, recursively. */
export function generateExample(schema: JSONSchema): unknown {
  if (schema.$ref) {return { '...': 'Reference object' };}
  if (schema.example !== undefined) {return schema.example;}
  if (schema.default !== undefined) {return schema.default;}
  if (schema.enum && schema.enum.length > 0) {return schema.enum[0];}

  switch (schema.type) {
    case 'string':
      if (schema.format === 'date-time') {return '2024-01-15T10:30:00Z';}
      if (schema.format === 'date') {return '2024-01-15';}
      if (schema.format === 'email') {return 'user@example.com';}
      if (schema.format === 'uri') {return 'https://example.com';}
      if (schema.format === 'uuid') {return '550e8400-e29b-41d4-a716-446655440000';}
      return 'string';
    case 'number':
    case 'integer':
      return 123;
    case 'boolean':
      return true;
    case 'array':
      return schema.items ? [generateExample(schema.items)] : [];
    case 'object': {
      if (!schema.properties) {return {};}
      const obj: Record<string, unknown> = {};
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        obj[key] = generateExample(propSchema);
      }
      return obj;
    }
    default:
      return null;
  }
}

/** Default request body schema for methods that typically carry one (POST/PUT/PATCH). */
export function createDefaultRequestSchema(method: string): JSONSchema | null {
  if (['GET', 'DELETE', 'HEAD', 'OPTIONS'].includes(method)) {return null;}
  return {
    type: 'object',
    properties: {},
    additionalProperties: true,
    description: 'Request body (schema not detected)',
  };
}

/** Default response body schema when nothing more specific was detected. */
export function createDefaultResponseSchema(): JSONSchema {
  return {
    type: 'object',
    properties: {},
    additionalProperties: true,
    description: 'Response body (schema not detected)',
  };
}

/**
 * Resolve `{param}` placeholders in an OpenAPI path with example values, for
 * `api_validate`'s static path-canonicalization (no live requests are made).
 */
export function resolvePathParams(urlPath: string, params: Array<{ name: string; in: string; example?: unknown }>): string {
  let resolvedPath = urlPath;
  for (const param of params) {
    if (param.in === 'path') {
      const value = param.example || 'test-id';
      resolvedPath = resolvedPath.replace(`{${param.name}}`, String(value));
    }
  }
  return resolvedPath;
}

/** Serialize a value to YAML (in-memory only — no filesystem write). */
export function toYaml(obj: unknown): string {
  return yaml.dump(obj, { lineWidth: -1, noRefs: true });
}

/**
 * True when a type string contains a top-level ` | ` union operator (not
 * nested inside angle brackets, curly braces, or parentheses).
 */
function containsTopLevelUnion(typeStr: string): boolean {
  let depth = 0;
  for (let i = 0; i < typeStr.length - 2; i++) {
    const ch = typeStr[i];
    if (ch === '<' || ch === '{' || ch === '(') {depth++;}
    else if (ch === '>' || ch === '}' || ch === ')') {depth--;}
    else if (depth === 0 && typeStr[i] === ' ' && typeStr[i + 1] === '|' && typeStr[i + 2] === ' ') {
      return true;
    }
  }
  return false;
}

/** Split a union type string on top-level ` | ` operators only. */
function splitUnionAtTopLevel(typeStr: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < typeStr.length; i++) {
    const ch = typeStr[i];
    if (ch === '<' || ch === '{' || ch === '(') {depth++;}
    else if (ch === '>' || ch === '}' || ch === ')') {depth--;}
    else if (depth === 0 && typeStr.slice(i, i + 3) === ' | ') {
      parts.push(typeStr.slice(start, i).trim());
      i += 2;
      start = i + 1;
    }
  }
  parts.push(typeStr.slice(start).trim());
  return parts;
}
