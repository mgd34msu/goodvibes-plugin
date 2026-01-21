/**
 * JSX Analyzer for Stacking Context
 *
 * Analyzes JSX files for stacking context patterns.
 *
 * @module handlers/frontend/stacking-context/jsx-analyzer
 */

import ts from 'typescript';
import type { ElementInfo } from './types.js';
import { createsStackingContext, extractZIndex, extractPosition } from './context-rules.js';

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
      // Head
      if (expr.head.text) {
        classes.push(...expr.head.text.split(/\s+/).filter(Boolean));
      }
      // Template spans
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
        if (ts.isStringLiteral(arg)) {
          classes.push(...arg.text.split(/\s+/).filter(Boolean));
        }
        // Handle object syntax: { "class-name": condition }
        if (ts.isObjectLiteralExpression(arg)) {
          for (const prop of arg.properties) {
            if (ts.isPropertyAssignment(prop)) {
              if (ts.isStringLiteral(prop.name)) {
                classes.push(...prop.name.text.split(/\s+/).filter(Boolean));
              } else if (ts.isIdentifier(prop.name)) {
                classes.push(prop.name.text);
              }
            }
            if (ts.isShorthandPropertyAssignment(prop)) {
              classes.push(prop.name.text);
            }
          }
        }
      }
      return classes;
    }
  }

  return [];
}

/**
 * Get line number for a position in source file
 */
export function getLineNumber(pos: number, sourceFile: ts.SourceFile): number {
  const { line } = sourceFile.getLineAndCharacterOfPosition(pos);
  return line + 1;
}

/**
 * Analyze a JSX file for stacking contexts
 */
export function analyzeJsxFile(
  filePath: string,
  content: string,
  sourceFile: ts.SourceFile
): ElementInfo[] {
  const elements: ElementInfo[] = [];
  const elementStack: number[] = []; // Stack of parent indices

  function visit(node: ts.Node): void {
    // JSX Opening Element or Self-Closing Element
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile);
      const line = getLineNumber(node.getStart(), sourceFile);
      const isComponent = /^[A-Z]/.test(tagName);

      // Extract classes from className attribute
      let classes: string[] = [];
      for (const attr of node.attributes.properties) {
        if (ts.isJsxAttribute(attr)) {
          const attrName = attr.name.getText(sourceFile);
          if (attrName === 'className' || attrName === 'class') {
            classes = extractClassesFromAttribute(attr, sourceFile);
            break;
          }
        }
      }

      // Check if this creates a stacking context
      const { creates, reason } = createsStackingContext(classes);
      const z_index = extractZIndex(classes);
      const position = extractPosition(classes);

      const elementInfo: ElementInfo = {
        element: `${tagName}:${line}`,
        line,
        classes,
        z_index,
        position,
        creates_context: creates,
        context_reason: reason,
        parent_index: elementStack.length > 0 ? elementStack[elementStack.length - 1] : null,
        is_component: isComponent,
      };

      const currentIndex = elements.length;
      elements.push(elementInfo);

      // If this is an opening element (not self-closing), push to stack
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
