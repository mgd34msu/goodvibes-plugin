/**
 * Accessibility Tree Core
 *
 * AST analysis, JSX parsing, and element extraction
 * for accessibility tree analysis.
 *
 * @module handlers/frontend/accessibility-tree-core
 */

import ts from 'typescript';
import type { ElementInfo } from './accessibility-tree-utils.js';

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
 * Extract attribute value from a JSX attribute
 */
export function extractAttributeValue(attr: ts.JsxAttribute, sourceFile: ts.SourceFile): string {
  if (!attr.initializer) {
    // Boolean attribute (e.g., disabled)
    return 'true';
  }

  // String literal: attr="value"
  if (ts.isStringLiteral(attr.initializer)) {
    return attr.initializer.text;
  }

  // JSX expression: attr={value}
  if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
    const expr = attr.initializer.expression;

    // String literal in expression: attr={"value"}
    if (ts.isStringLiteral(expr)) {
      return expr.text;
    }

    // Boolean literals
    if (expr.kind === ts.SyntaxKind.TrueKeyword) {
      return 'true';
    }
    if (expr.kind === ts.SyntaxKind.FalseKeyword) {
      return 'false';
    }

    // Number literal
    if (ts.isNumericLiteral(expr)) {
      return expr.text;
    }

    // Prefix unary expression (e.g., -1 for tabIndex={-1})
    if (ts.isPrefixUnaryExpression(expr)) {
      if (expr.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(expr.operand)) {
        return '-' + expr.operand.text;
      }
    }

    // Template literal
    if (ts.isTemplateExpression(expr)) {
      return expr.head.text + '[dynamic]';
    }

    // Identifier (variable)
    if (ts.isIdentifier(expr)) {
      return `[${expr.text}]`;
    }

    // Call expression (e.g., cn(), clsx())
    if (ts.isCallExpression(expr)) {
      const parts: string[] = [];
      for (const arg of expr.arguments) {
        if (ts.isStringLiteral(arg)) {
          parts.push(arg.text);
        }
      }
      return parts.join(' ');
    }

    return '[expression]';
  }

  return '';
}

/**
 * Extract text content from JSX children
 */
export function extractTextContent(node: ts.Node, sourceFile: ts.SourceFile): string {
  const textParts: string[] = [];

  function visit(child: ts.Node): void {
    if (ts.isJsxText(child)) {
      const text = child.text.trim();
      if (text) {
        textParts.push(text);
      }
    } else if (ts.isJsxExpression(child) && child.expression) {
      if (ts.isStringLiteral(child.expression)) {
        textParts.push(child.expression.text);
      }
    }
    ts.forEachChild(child, visit);
  }

  ts.forEachChild(node, visit);
  return textParts.join(' ').trim();
}

// =============================================================================
// JSX File Analysis
// =============================================================================

/**
 * Analyze JSX file for accessibility tree
 */
export function analyzeJsxFile(
  filePath: string,
  content: string,
  sourceFile: ts.SourceFile,
  targetElement?: string
): ElementInfo[] {
  const elements: ElementInfo[] = [];
  const elementStack: number[] = [];

  function visit(node: ts.Node): void {
    // JSX Opening Element or Self-Closing Element
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile);
      const line = getLineNumber(node.getStart(), sourceFile);
      const isComponent = /^[A-Z]/.test(tagName);

      // Filter by target element if specified
      if (targetElement && tagName !== targetElement) {
        if (ts.isJsxOpeningElement(node)) {
          elementStack.push(-1); // Push placeholder
        }
        ts.forEachChild(node, visit);
        return;
      }

      // Extract all attributes
      const attributes = new Map<string, string>();
      for (const attr of node.attributes.properties) {
        if (ts.isJsxAttribute(attr) && attr.name) {
          const attrName = attr.name.getText(sourceFile);
          const attrValue = extractAttributeValue(attr, sourceFile);
          attributes.set(attrName, attrValue);
        }
        // Handle spread attributes
        if (ts.isJsxSpreadAttribute(attr)) {
          attributes.set('[spread]', 'true');
        }
      }

      // Get text content for this element
      let textContent = '';
      if (ts.isJsxElement(node.parent)) {
        textContent = extractTextContent(node.parent, sourceFile);
      }

      const elementInfo: ElementInfo = {
        tag: tagName,
        line,
        identifier: `${tagName}:${line}`,
        attributes,
        textContent,
        isComponent,
        parentIndex: elementStack.length > 0 ? elementStack[elementStack.length - 1] : null,
        childIndices: [],
      };

      const currentIndex = elements.length;
      elements.push(elementInfo);

      // Update parent's children
      if (elementInfo.parentIndex !== null && elementInfo.parentIndex >= 0) {
        elements[elementInfo.parentIndex].childIndices.push(currentIndex);
      }

      // If opening element, push to stack
      if (ts.isJsxOpeningElement(node)) {
        elementStack.push(currentIndex);
      }
    }

    // JSX Closing Element - pop from stack
    if (ts.isJsxClosingElement(node)) {
      elementStack.pop();
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return elements;
}
