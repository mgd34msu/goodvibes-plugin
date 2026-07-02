/**
 * JSX class extractor — Lane 4.
 * Ported verbatim from frontend-engine `core/jsx/class-extractor.ts`.
 *
 * @module frontend/jsx/class-extractor
 */

import ts from 'typescript';

/** Extract CSS classes from a single AST node into `out` (in place). */
export function extractClassesFromNode(node: ts.Node, out: string[]): void {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    const text = node.text.trim();
    if (text) out.push(...text.split(/\s+/));
    return;
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    if (ts.isStringLiteral(node.right) || ts.isNoSubstitutionTemplateLiteral(node.right)) {
      const text = node.right.text.trim();
      if (text) out.push(...text.split(/\s+/));
    }
    return;
  }
  if (ts.isConditionalExpression(node)) {
    extractClassesFromNode(node.whenTrue, out);
    extractClassesFromNode(node.whenFalse, out);
    return;
  }
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
        const name = prop.name.text;
        if (name === name.toLowerCase() && /^[a-z][a-z0-9/[\]:.-]*$/.test(name)) {
          out.push(name);
        }
      }
    }
    return;
  }
  if (ts.isArrayLiteralExpression(node)) {
    for (const element of node.elements) extractClassesFromNode(element, out);
  }
}

/** Extract CSS classes from a JSX className/class attribute. */
export function extractClassesFromAttribute(attr: ts.JsxAttribute): string[] {
  if (!attr.initializer) return [];
  if (ts.isStringLiteral(attr.initializer)) {
    return attr.initializer.text.split(/\s+/).filter(Boolean);
  }
  if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
    const expr = attr.initializer.expression;
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
      return expr.text.split(/\s+/).filter(Boolean);
    }
    if (ts.isTemplateExpression(expr)) {
      const classes: string[] = [];
      if (expr.head.text) classes.push(...expr.head.text.split(/\s+/).filter(Boolean));
      for (const span of expr.templateSpans) {
        if (span.literal.text) classes.push(...span.literal.text.split(/\s+/).filter(Boolean));
      }
      return classes;
    }
    if (ts.isCallExpression(expr)) {
      const classes: string[] = [];
      for (const arg of expr.arguments) extractClassesFromNode(arg, classes);
      return classes;
    }
    if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
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
