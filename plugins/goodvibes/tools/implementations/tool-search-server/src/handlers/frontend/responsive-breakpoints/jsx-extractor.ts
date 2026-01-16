/**
 * JSX Extractor for Responsive Breakpoints
 *
 * Extracts className attributes from JSX elements.
 *
 * @module handlers/frontend/responsive-breakpoints/jsx-extractor
 */

import ts from 'typescript';
import type { ClassNameExtraction } from './types.js';

/**
 * Extract className attributes from JSX elements
 */
export function extractClassNames(sourceFile: ts.SourceFile, elementFilter?: string): ClassNameExtraction[] {
  const results: ClassNameExtraction[] = [];
  let elementCounter = 0;

  function getElementName(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement): string {
    return node.tagName.getText(sourceFile);
  }

  function getLineNumber(node: ts.Node): number {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    return line + 1;
  }

  function extractStringValue(node: ts.Node): string {
    if (ts.isStringLiteral(node)) {
      return node.text;
    }
    if (ts.isNoSubstitutionTemplateLiteral(node)) {
      return node.text;
    }
    if (ts.isTemplateExpression(node)) {
      // Extract static parts from template literal
      let result = node.head.text;
      for (const span of node.templateSpans) {
        result += ' ' + span.literal.text;
      }
      return result;
    }
    if (ts.isJsxExpression(node) && node.expression) {
      return extractStringValue(node.expression);
    }
    if (ts.isCallExpression(node)) {
      // Handle cn(), clsx(), classNames() etc.
      let result = '';
      for (const arg of node.arguments) {
        if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
          result += ' ' + arg.text;
        } else if (ts.isTemplateExpression(arg)) {
          result += ' ' + extractStringValue(arg);
        } else if (ts.isArrayLiteralExpression(arg)) {
          for (const element of arg.elements) {
            result += ' ' + extractStringValue(element);
          }
        }
      }
      return result;
    }
    if (ts.isConditionalExpression(node)) {
      // Ternary: condition ? 'a' : 'b' - extract both branches
      return extractStringValue(node.whenTrue) + ' ' + extractStringValue(node.whenFalse);
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      // String concatenation
      return extractStringValue(node.left) + ' ' + extractStringValue(node.right);
    }
    if (ts.isParenthesizedExpression(node)) {
      return extractStringValue(node.expression);
    }
    return '';
  }

  function processAttributes(
    attributes: ts.JsxAttributes,
    elementName: string,
    line: number
  ): void {
    for (const attr of attributes.properties) {
      if (ts.isJsxAttribute(attr) && attr.name) {
        const attrName = attr.name.getText(sourceFile);
        if (attrName === 'className' || attrName === 'class') {
          let classValue = '';

          if (attr.initializer) {
            if (ts.isStringLiteral(attr.initializer)) {
              classValue = attr.initializer.text;
            } else if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
              classValue = extractStringValue(attr.initializer.expression);
            }
          }

          if (classValue.trim()) {
            elementCounter++;
            const elementId = `${elementName}#${elementCounter}`;

            // Apply filter if specified
            if (!elementFilter || elementId.includes(elementFilter) || elementName.includes(elementFilter)) {
              results.push({
                element: elementId,
                className: classValue,
                line,
              });
            }
          }
        }
      }
    }
  }

  function visit(node: ts.Node): void {
    if (ts.isJsxOpeningElement(node)) {
      const elementName = getElementName(node);
      const line = getLineNumber(node);
      processAttributes(node.attributes, elementName, line);
    } else if (ts.isJsxSelfClosingElement(node)) {
      const elementName = getElementName(node);
      const line = getLineNumber(node);
      processAttributes(node.attributes, elementName, line);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return results;
}
