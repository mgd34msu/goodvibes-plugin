/**
 * Type extraction utilities for the api domain.
 *
 * Provides functions to parse TypeScript type information from handler files
 * and source content, used for OpenAPI spec generation and type drift detection.
 *
 * @module core/api/type-extraction
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as fsPromises from 'node:fs/promises';
import * as ts from 'typescript';

import type { JSONSchema } from './types.js';
import { typeToJsonSchema } from './openapi.js';

/**
 * Result of parsing handler types.
 */
export interface HandlerTypes {
  requestSchema: JSONSchema | null;
  responseSchema: JSONSchema | null;
}

/**
 * Try to parse request/response TypeScript types from a route handler file.
 *
 * Looks for Zod schemas, TypeScript interfaces named `*Request` and `*Response`,
 * and NextResponse.json() return types.
 *
 * @param filePath - Path to the handler file relative to projectPath
 * @param projectPath - Absolute project root path
 * @returns Parsed request and response schemas (either may be null if not found)
 */
export function parseHandlerTypes(filePath: string, projectPath: string): HandlerTypes {
  const fullPath = path.join(projectPath, filePath);

  if (!fs.existsSync(fullPath)) {
    return { requestSchema: null, responseSchema: null };
  }

  try {
    const content = fs.readFileSync(fullPath, 'utf-8');

    let requestSchema: JSONSchema | null = null;
    let responseSchema: JSONSchema | null = null;

    // Try to find Zod schema definitions
    const zodSchemaMatch = content.match(/(?:const|let)\s+(\w+)Schema\s*=\s*z\.object\s*\(\s*\{/);
    if (zodSchemaMatch) {
      requestSchema = {
        type: 'object',
        description: `Schema: ${zodSchemaMatch[1]}`,
        additionalProperties: true,
      };
    }

    // Try to find TypeScript interface for request
    const requestInterfaceMatch = content.match(/interface\s+(\w+Request)\s*\{([^}]+)\}/);
    if (requestInterfaceMatch) {
      requestSchema = parseInterfaceToSchema(requestInterfaceMatch[2], requestInterfaceMatch[1]);
    }

    // Try to find TypeScript interface for response
    const responseInterfaceMatch = content.match(/interface\s+(\w+Response)\s*\{([^}]+)\}/);
    if (responseInterfaceMatch) {
      responseSchema = parseInterfaceToSchema(responseInterfaceMatch[2], responseInterfaceMatch[1]);
    }

    // Check for NextResponse.json() return types
    const nextResponseMatch = content.match(/return\s+(?:NextResponse\.json|Response\.json)\s*\(\s*\{([^}]+)\}/);
    if (nextResponseMatch && !responseSchema) {
      responseSchema = {
        type: 'object',
        description: 'JSON response',
        additionalProperties: true,
      };
    }

    return { requestSchema, responseSchema };
  } catch {
    return { requestSchema: null, responseSchema: null };
  }
}

/**
 * Parse a TypeScript interface body string into a JSON Schema object.
 *
 * Uses simple regex-based parsing for common `propName: type;` and
 * `propName?: type;` property patterns.
 *
 * @param interfaceBody - The body content of the interface (between `{` and `}`)
 * @param name - The interface name used as the schema description
 * @returns JSON Schema representing the interface properties
 */
export function parseInterfaceToSchema(interfaceBody: string, name: string): JSONSchema {
  const properties: Record<string, JSONSchema> = {};
  const required: string[] = [];

  // Simple regex-based parsing for common patterns
  const propRegex = /(\w+)(\?)?:\s*([^;]+);/g;
  let match;

  while ((match = propRegex.exec(interfaceBody)) !== null) {
    const propName = match[1];
    const isOptional = match[2] === '?';
    const propType = match[3].trim();

    properties[propName] = typeToJsonSchema(propType);

    if (!isOptional) {
      required.push(propName);
    }
  }

  return {
    type: 'object',
    description: name,
    properties,
    ...(required.length > 0 && { required }),
  };
}

/**
 * Extract the text of a TypeScript TypeNode from a source file.
 *
 * Unwraps `Promise<T>`, `Response<T>`, `NextResponse<T>`, and `AxiosResponse<T>`
 * wrappers to return the inner type.
 *
 * @param typeNode - The TypeScript TypeNode to extract text from
 * @param sourceFile - The source file containing the node
 * @returns The type text with common wrappers removed
 */
export function extractTypeText(typeNode: ts.TypeNode, sourceFile: ts.SourceFile): string {
  const text = typeNode.getText(sourceFile);

  // Clean up Promise<...> wrapper
  const promiseMatch = text.match(/^Promise<(.+)>$/);
  if (promiseMatch) {
    return promiseMatch[1];
  }

  // Clean up Response or NextResponse wrappers
  if (text.includes('Response') || text.includes('NextResponse')) {
    const genericMatch = text.match(/<([^>]+)>/);
    if (genericMatch) {
      return genericMatch[1];
    }
  }

  return text;
}

/**
 * Compare two type strings for compatibility.
 *
 * Normalizes both types before comparing, accounting for common wrapper types
 * like Promise, Response, NextResponse, and AxiosResponse.
 *
 * @param backendType - Type annotation from the backend handler
 * @param frontendType - Type annotation from the frontend call site
 * @returns Whether types match and an optional diff description
 */
export function compareTypes(
  backendType: string | undefined,
  frontendType: string | undefined
): { matches: boolean; diff?: string } {
  if (!backendType && !frontendType) {
    return { matches: true };
  }

  if (!backendType) {
    return {
      matches: false,
      diff: `Backend has no type annotation, frontend expects: ${frontendType}`,
    };
  }

  if (!frontendType) {
    return {
      matches: false,
      diff: `Frontend has no type annotation, backend returns: ${backendType}`,
    };
  }

  // Normalize types for comparison
  const normalizedBackend = normalizeType(backendType);
  const normalizedFrontend = normalizeType(frontendType);

  if (normalizedBackend === normalizedFrontend) {
    return { matches: true };
  }

  // Check for compatible types (e.g., User vs UserResponse)
  if (
    normalizedBackend.includes(normalizedFrontend) ||
    normalizedFrontend.includes(normalizedBackend)
  ) {
    return {
      matches: false,
      diff: `Types may be compatible but differ: backend=${backendType}, frontend=${frontendType}`,
    };
  }

  return {
    matches: false,
    diff: `Type mismatch: backend=${backendType}, frontend=${frontendType}`,
  };
}

/**
 * Normalize a TypeScript type name for comparison.
 *
 * Strips whitespace and unwraps common generic wrapper types.
 *
 * @param typeName - The raw type name string
 * @returns Lowercased, normalized type string
 */
export function normalizeType(typeName: string): string {
  let normalized = typeName.replace(/\s+/g, '');

  // Remove common wrappers
  normalized = normalized
    .replace(/^Promise<(.+)>$/, '$1')
    .replace(/^Response<(.+)>$/, '$1')
    .replace(/^NextResponse<(.+)>$/, '$1')
    .replace(/^AxiosResponse<(.+)>$/, '$1');

  return normalized.toLowerCase();
}

/**
 * Extract request/response type info from a route handler file using the TypeScript compiler API.
 *
 * Walks the AST to find exported function declarations or variable statements
 * matching the HTTP method name and extracts their type annotations.
 *
 * @param filePath - Absolute path to the handler file
 * @param method - HTTP method name to look for (GET, POST, etc.)
 * @returns Extracted request and response type strings
 */
export async function extractTypesFromHandler(
  filePath: string,
  method: string
): Promise<{ request?: string; response?: string }> {
  const result: { request?: string; response?: string } = {};

  try {
    const content = await fsPromises.readFile(filePath, 'utf-8');

    // Create a TS source file for parsing
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );

    // Walk the AST to find handler function and its types
    const visit = (node: ts.Node): void => {
      // Look for export function GET/POST/etc.
      if (
        ts.isFunctionDeclaration(node) &&
        node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
        node.name?.text === method
      ) {
        // Extract return type if present
        if (node.type) {
          result.response = extractTypeText(node.type, sourceFile);
        }

        // Extract request parameter type
        if (node.parameters.length > 0) {
          const firstParam = node.parameters[0];
          if (firstParam.type) {
            result.request = extractTypeText(firstParam.type, sourceFile);
          }
        }
      }

      // Look for export const GET = async (...)
      if (
        ts.isVariableStatement(node) &&
        node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        for (const decl of node.declarationList.declarations) {
          if (
            ts.isIdentifier(decl.name) &&
            decl.name.text === method &&
            decl.initializer
          ) {
            if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
              const fn = decl.initializer;
              if (fn.type) {
                result.response = extractTypeText(fn.type, sourceFile);
              }
              if (fn.parameters.length > 0 && fn.parameters[0].type) {
                result.request = extractTypeText(fn.parameters[0].type, sourceFile);
              }
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    // Also look for Response.json<T> patterns
    const responseJsonMatch = content.match(/Response\.json<(\w+)>/);
    if (responseJsonMatch && !result.response) {
      result.response = responseJsonMatch[1];
    }

    // Look for NextResponse.json<T> patterns
    const nextResponseMatch = content.match(/NextResponse\.json<(\w+)>/);
    if (nextResponseMatch && !result.response) {
      result.response = nextResponseMatch[1];
    }

    // Look for type annotations in JSDoc
    const jsdocResponseMatch = content.match(/@returns?\s*\{([^}]+)\}/);
    if (jsdocResponseMatch && !result.response) {
      result.response = jsdocResponseMatch[1].trim();
    }
  } catch {
    // Parse error — return empty result
  }

  return result;
}
