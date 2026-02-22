/**
 * Tailwind Conflicts Core
 *
 * AST analysis, className extraction, and JSX parsing
 * for Tailwind conflicts analysis.
 *
 * @module handlers/frontend/tailwind-conflicts-core
 */

import ts from 'typescript';
import type { ElementInfo } from './tailwind-conflicts-analyzers.js';
import { extractClassesFromAttribute } from './jsx-class-utils.js';

// =============================================================================
// AST Analysis Helpers
// =============================================================================

/**
 * Get line number for a position
 */
export function getLineNumber(pos: number, sourceFile: ts.SourceFile): number {
  const { line } = sourceFile.getLineAndCharacterOfPosition(pos);
  return line + 1;
}

/**
 * Get raw className string
 */
export function getRawClassName(attr: ts.JsxAttribute, sourceFile: ts.SourceFile): string {
  if (!attr.initializer) return '';

  if (ts.isStringLiteral(attr.initializer)) {
    return attr.initializer.text;
  }

  if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
    const expr = attr.initializer.expression;
    if (ts.isStringLiteral(expr)) {
      return expr.text;
    }
    // For more complex expressions, return the source text
    return expr.getText(sourceFile);
  }

  /* v8 ignore next */
  return '';
}

// =============================================================================
// JSX File Analysis
// =============================================================================

/**
 * Analyze JSX file for class conflicts
 */
export function analyzeJsxFile(content: string, sourceFile: ts.SourceFile): ElementInfo[] {
  const elements: ElementInfo[] = [];

  function visit(node: ts.Node): void {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile);
      const line = getLineNumber(node.getStart(), sourceFile);

      for (const attr of node.attributes.properties) {
        if (ts.isJsxAttribute(attr)) {
          const attrName = attr.name.getText(sourceFile);
          if (attrName === 'className' || attrName === 'class') {
            const classes = extractClassesFromAttribute(attr);
            const rawClassName = getRawClassName(attr, sourceFile);

            if (classes.length > 0) {
              elements.push({
                element: `${tagName}:${line}`,
                line,
                classes,
                rawClassName,
              });
            }
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return elements;
}
