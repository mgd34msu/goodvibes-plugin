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
 * Extract CSS classes from a single AST node (string, logical AND, ternary, object, array)
 * Mutates the `out` array in place for efficiency.
 */
function extractClassesFromNode(node: ts.Node, out: string[]): void {
  // 'flex p-4'
  if (ts.isStringLiteral(node)) {
    out.push(...node.text.split(/\s+/).filter(Boolean));
    return;
  }

  // isActive && 'bg-blue-500'
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
  ) {
    if (ts.isStringLiteral(node.right)) {
      out.push(...node.right.text.split(/\s+/).filter(Boolean));
    }
    return;
  }

  // condition ? 'a' : 'b'
  if (ts.isConditionalExpression(node)) {
    extractClassesFromNode(node.whenTrue, out);
    extractClassesFromNode(node.whenFalse, out);
    return;
  }

  // { 'bg-blue-500': isActive, 'bg-gray-200': !isActive }
  if (ts.isObjectLiteralExpression(node)) {
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop)) {
        if (ts.isStringLiteral(prop.name)) {
          out.push(...prop.name.text.split(/\s+/).filter(Boolean));
        } else if (ts.isIdentifier(prop.name)) {
          out.push(prop.name.text);
        }
      }
      if (ts.isShorthandPropertyAssignment(prop)) {
        out.push(prop.name.text);
      }
    }
    return;
  }

  // ['flex', isActive && 'bg-blue-500']
  if (ts.isArrayLiteralExpression(node)) {
    for (const element of node.elements) {
      extractClassesFromNode(element, out);
    }
    return;
  }
}

/**
 * Extract CSS classes from a JSX className attribute
 */
export function extractClassesFromAttribute(
  attr: ts.JsxAttribute,
  sourceFile: ts.SourceFile
): string[] {
  if (!attr.initializer) return [];

  // className="class1 class2"
  if (ts.isStringLiteral(attr.initializer)) {
    return attr.initializer.text.split(/\s+/).filter(Boolean);
  }

  // className={...}
  if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
    const expr = attr.initializer.expression;

    // className={"class1 class2"}
    if (ts.isStringLiteral(expr)) {
      return expr.text.split(/\s+/).filter(Boolean);
    }

    // className={`class1 ${dynamic} class2`}
    if (ts.isTemplateExpression(expr)) {
      const classes: string[] = [];
      if (expr.head.text) {
        classes.push(...expr.head.text.split(/\s+/).filter(Boolean));
      }
      for (const span of expr.templateSpans) {
        if (span.literal.text) {
          classes.push(...span.literal.text.split(/\s+/).filter(Boolean));
        }
      }
      return classes;
    }

    // className={cn("class1", "class2")} or clsx() or classNames()
    if (ts.isCallExpression(expr)) {
      const classes: string[] = [];
      for (const arg of expr.arguments) {
        extractClassesFromNode(arg, classes);
      }
      return classes;
    }

    // className={isActive && 'bg-blue-500'}
    if (
      ts.isBinaryExpression(expr) &&
      expr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
    ) {
      const classes: string[] = [];
      if (ts.isStringLiteral(expr.right)) {
        classes.push(...expr.right.text.split(/\s+/).filter(Boolean));
      }
      return classes;
    }
  }

  return [];
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
            const classes = extractClassesFromAttribute(attr, sourceFile);
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
