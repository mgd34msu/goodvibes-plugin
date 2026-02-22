/**
 * Utility functions for Trace Component State
 *
 * @module handlers/frontend/component-state/utils
 */

import * as path from 'path';
import ts from 'typescript';
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

function normalizeFilePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

export function makeRelativePath(absolutePath: string, projectRoot: string): string {
  return normalizeFilePath(path.relative(projectRoot, absolutePath));
}

export function resolveFilePath(filePath: string, projectRoot: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(projectRoot, filePath);
}

// =============================================================================
// Type Extraction Helpers
// =============================================================================

/**
 * Get the type string from a node
 */
export function getTypeString(node: ts.Node | undefined, sourceFile: ts.SourceFile): string {
  if (!node) return 'unknown';

  if (ts.isTypeReferenceNode(node)) {
    return node.getText(sourceFile);
  }
  if (ts.isTypeLiteralNode(node)) {
    return node.getText(sourceFile);
  }
  if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) {
    return node.getText(sourceFile);
  }
  if (ts.isArrayTypeNode(node)) {
    return node.getText(sourceFile);
  }
  // Primitive types
  if (node.kind === ts.SyntaxKind.StringKeyword) return 'string';
  if (node.kind === ts.SyntaxKind.NumberKeyword) return 'number';
  if (node.kind === ts.SyntaxKind.BooleanKeyword) return 'boolean';

  return node.getText(sourceFile);
}

/**
 * Infer type from initial value
 */
export function inferTypeFromValue(node: ts.Node | undefined, sourceFile: ts.SourceFile): string {
  if (!node) return 'unknown';

  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return 'string';
  if (ts.isNumericLiteral(node)) return 'number';
  if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) return 'boolean';
  if (ts.isArrayLiteralExpression(node)) {
    if (node.elements.length === 0) return 'unknown[]';
    const firstType = inferTypeFromValue(node.elements[0], sourceFile);
    return `${firstType}[]`;
  }
  if (ts.isObjectLiteralExpression(node)) return 'object';
  if (node.kind === ts.SyntaxKind.NullKeyword) return 'null';
  if (node.kind === ts.SyntaxKind.UndefinedKeyword) return 'undefined';
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return 'function';

  // For complex expressions, just return the text (truncated)
  const text = node.getText(sourceFile);
  return text.length > 120 ? text.slice(0, 117) + '...' : text;
}

/**
 * Extract the variable name from array destructuring
 */
export function extractDestructuredNames(node: ts.Node, sourceFile: ts.SourceFile): [string, string | undefined] {
  // Look for: const [state, setState] = useState(...)
  if (ts.isVariableDeclaration(node.parent)) {
    const binding = node.parent.name;
    if (ts.isArrayBindingPattern(binding) && binding.elements.length >= 1) {
      const first = binding.elements[0];
      const second = binding.elements.length >= 2 ? binding.elements[1] : undefined;

      const firstName = ts.isBindingElement(first) && ts.isIdentifier(first.name)
        ? first.name.getText(sourceFile)
        : undefined;

      const secondName = second && ts.isBindingElement(second) && ts.isIdentifier(second.name)
        ? second.name.getText(sourceFile)
        : undefined;

      return [firstName ?? 'unknown', secondName];
    }
    // Simple assignment: const ref = useRef(...)
    if (ts.isIdentifier(binding)) {
      return [binding.getText(sourceFile), undefined];
    }
  }
  return ['unknown', undefined];
}

/**
 * Extract dependency array from hook call
 */
export function extractDependencyArray(node: ts.Node | undefined, sourceFile: ts.SourceFile): string[] {
  if (!node) return [];

  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map(el => el.getText(sourceFile));
  }

  return [];
}

/**
 * Check if a function has a cleanup return
 */
export function hasCleanupReturn(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  let hasCleanup = false;

  function visit(n: ts.Node): void {
    if (ts.isReturnStatement(n) && n.expression) {
      // Check if returning a function
      if (ts.isArrowFunction(n.expression) || ts.isFunctionExpression(n.expression)) {
        hasCleanup = true;
      }
    }
    if (!hasCleanup) {
      ts.forEachChild(n, visit);
    }
  }

  visit(node);
  return hasCleanup;
}
