/**
 * JSX Class Utilities
 *
 * Shared utility functions for extracting CSS classes from JSX AST nodes.
 * Single source of truth used across tailwind-conflicts, stacking-context,
 * layout-hierarchy, sizing-strategy, and responsive-breakpoints.
 *
 * @module handlers/frontend/jsx-class-utils
 */

import ts from 'typescript';

/**
 * Extract CSS classes from a single AST node (string, template literal,
 * logical AND, ternary, object, array).
 * Mutates the `out` array in place for efficiency.
 */
export function extractClassesFromNode(node: ts.Node, out: string[]): void {
  // 'flex p-4'
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    const text = node.text.trim();
    if (text) out.push(...text.split(/\s+/));
    return;
  }

  // isActive && 'bg-blue-500'
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
  ) {
    if (ts.isStringLiteral(node.right) || ts.isNoSubstitutionTemplateLiteral(node.right)) {
      const text = node.right.text.trim();
      if (text) out.push(...text.split(/\s+/));
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
      // clsx({ myActiveState }) - only push if it looks like a CSS class
      // (lowercase with hyphens/slashes/brackets, not a camelCase JS identifier)
      if (ts.isShorthandPropertyAssignment(prop)) {
        const name = prop.name.text;
        if (name === name.toLowerCase() && /^[a-z][a-z0-9\-\/\[\]:.]*$/.test(name)) {
          out.push(name);
        }
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
 * Extract CSS classes from a JSX className or class attribute.
 * Handles string literals, template expressions, cn/clsx calls,
 * logical AND expressions, and both `className` and `class` attribute names.
 */
export function extractClassesFromAttribute(attr: ts.JsxAttribute): string[] {
  if (!attr.initializer) return [];

  // className="class1 class2"
  if (ts.isStringLiteral(attr.initializer)) {
    return attr.initializer.text.split(/\s+/).filter(Boolean);
  }

  // className={...}
  if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
    const expr = attr.initializer.expression;

    // className={"class1 class2"}
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
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
      if (ts.isStringLiteral(expr.right) || ts.isNoSubstitutionTemplateLiteral(expr.right)) {
        const text = expr.right.text.trim();
        if (text) classes.push(...text.split(/\s+/));
      }
      return classes;
    }
  }

  return [];
}
