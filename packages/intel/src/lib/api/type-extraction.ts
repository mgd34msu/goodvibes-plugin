/**
 * Handler type extraction for `api_spec`.
 *
 * Ported near-verbatim from v1 project-engine `core/api/type-extraction.ts`
 * (regex-based Zod/interface/NextResponse detection over the handler's raw
 * text — deliberately NOT wired onto the shared compiler host: this is a
 * best-effort, low-confidence signal for the OpenAPI generator, and the
 * `extractTypesFromHandler` variant already parses its own throwaway
 * `ts.createSourceFile` per file, which needs no type-checking Program).
 *
 * @module lib/api/type-extraction
 */

import * as fs from 'node:fs';

import type { JSONSchema } from './types.js';
import { typeToJsonSchema } from './openapi.js';

/** Result of parsing handler request/response types. */
export interface HandlerTypes {
  requestSchema: JSONSchema | null;
  responseSchema: JSONSchema | null;
}

/**
 * Try to parse request/response TypeScript types from a route handler file.
 *
 * Looks for Zod schemas, TypeScript interfaces named `*Request`/`*Response`,
 * and `NextResponse.json()`/`Response.json()` return shapes.
 *
 * @param absoluteFilePath - resolved absolute path to the handler file
 */
export function parseHandlerTypes(absoluteFilePath: string): HandlerTypes {
  if (!fs.existsSync(absoluteFilePath)) {
    return { requestSchema: null, responseSchema: null };
  }

  try {
    const content = fs.readFileSync(absoluteFilePath, 'utf-8');

    let requestSchema: JSONSchema | null = null;
    let responseSchema: JSONSchema | null = null;

    const zodSchemaMatch = content.match(
      /(?:const|let)\s+(\w+)Schema\s*=\s*z\.(?:object|array|string|number|enum|union|intersection)\s*[(<(]/,
    );
    if (zodSchemaMatch) {
      requestSchema = {
        type: 'object',
        description: `Schema: ${zodSchemaMatch[1]}`,
        additionalProperties: true,
      };
    }

    const requestInterfaceMatch = content.match(/interface\s+(\w+Request)\s*\{/);
    if (requestInterfaceMatch && requestInterfaceMatch.index !== undefined) {
      const bodyStart = content.indexOf('{', requestInterfaceMatch.index);
      const body = extractBracketBody(content, bodyStart);
      if (body !== null) requestSchema = parseInterfaceToSchema(body, requestInterfaceMatch[1]);
    }

    const responseInterfaceMatch = content.match(/interface\s+(\w+Response)\s*\{/);
    if (responseInterfaceMatch && responseInterfaceMatch.index !== undefined) {
      const bodyStart = content.indexOf('{', responseInterfaceMatch.index);
      const body = extractBracketBody(content, bodyStart);
      if (body !== null) responseSchema = parseInterfaceToSchema(body, responseInterfaceMatch[1]);
    }

    const nextResponseMatch = content.match(/return\s+(?:NextResponse\.json|Response\.json)\s*\(\s*\{([^}]+)\}/);
    if (nextResponseMatch && !responseSchema) {
      responseSchema = { type: 'object', description: 'JSON response', additionalProperties: true };
    }

    return { requestSchema, responseSchema };
  } catch {
    return { requestSchema: null, responseSchema: null };
  }
}

/**
 * Extract the body of a bracket-delimited block, starting at the opening `{`
 * at `startIndex`. Handles nested brackets.
 */
function extractBracketBody(content: string, startIndex: number): string | null {
  if (content[startIndex] !== '{') return null;
  let depth = 0;
  for (let i = startIndex; i < content.length; i++) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') {
      depth--;
      if (depth === 0) return content.slice(startIndex + 1, i);
    }
  }
  return null;
}

/**
 * Parse a TypeScript interface body string into a JSON Schema object using
 * simple regex-based `propName: type;` / `propName?: type;` matching.
 */
export function parseInterfaceToSchema(interfaceBody: string, name: string): JSONSchema {
  const properties: Record<string, JSONSchema> = {};
  const required: string[] = [];

  const propRegex = /(\w+)(\?)?:\s*([^;]+);/g;
  let match: RegExpExecArray | null;
  while ((match = propRegex.exec(interfaceBody)) !== null) {
    const propName = match[1];
    const isOptional = match[2] === '?';
    const propType = match[3].trim();

    properties[propName] = typeToJsonSchema(propType);
    if (!isOptional) required.push(propName);
  }

  return {
    type: 'object',
    description: name,
    properties,
    ...(required.length > 0 && { required }),
  };
}
