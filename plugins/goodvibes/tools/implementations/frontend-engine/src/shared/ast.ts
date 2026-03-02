/**
 * AST analysis primitives for React component detection.
 *
 * Provides TypeScript AST utilities used across multiple frontend-engine
 * handlers for identifying React components and HOC patterns.
 *
 * @module shared/ast
 */

import ts from 'typescript';

// =============================================================================
// HOC Constants
// =============================================================================

/** Known React memo() callee names (simple and namespace forms) */
export const MEMO_CALLEE = new Set(['memo', 'React.memo']);

/** Known React forwardRef() callee names (simple and namespace forms) */
export const FORWARD_REF_CALLEE = new Set(['forwardRef', 'React.forwardRef']);

/** Known React lazy() callee names (simple and namespace forms) */
export const LAZY_CALLEE = new Set(['lazy', 'React.lazy']);

/** All known HOC wrapping callee names that wrap render functions */
export const HOC_WRAPPING_CALLEE = new Set([
  ...MEMO_CALLEE,
  ...FORWARD_REF_CALLEE,
  ...LAZY_CALLEE,
]);

// =============================================================================
// AST Analysis Helpers
// =============================================================================

/**
 * Check if a function body contains a JSX return.
 *
 * Traverses the AST of the given node looking for JSX elements,
 * self-closing elements, or fragments.
 *
 * @param node - The AST node to inspect (function body)
 * @param sourceFile - The TypeScript source file context
 * @returns true if the node contains any JSX return
 */
export function containsJsxReturn(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  let hasJsx = false;

  function visit(n: ts.Node): void {
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) {
      hasJsx = true;
      return;
    }
    ts.forEachChild(n, visit);
  }

  visit(node);
  return hasJsx;
}

/**
 * Check if an AST node represents a React component (function or class).
 *
 * Detects:
 * - Function declarations: `function Component() { return <div/> }`
 * - Arrow functions assigned to const: `const Component = () => <div/>`
 * - HOC-wrapped: `const Component = memo(() => <div/>)`, `forwardRef(...)`, `lazy(...)`
 * - Class components: `class Component extends React.Component`
 *
 * @param node - The AST node to inspect
 * @param sourceFile - The TypeScript source file context
 * @returns true if the node is a React component definition
 */
export function isReactComponent(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  // Function declaration: function Component() { return <div/> }
  if (ts.isFunctionDeclaration(node) && node.name) {
    const name = node.name.getText(sourceFile);
    if (/^[A-Z]/.test(name)) {
      return containsJsxReturn(node, sourceFile);
    }
  }

  // Arrow function assigned to const: const Component = () => <div/>
  // Also handles HOC-wrapped: const Component = memo(() => <div/>), forwardRef(...), lazy(...)
  if (ts.isVariableStatement(node)) {
    for (const decl of node.declarationList.declarations) {
      if (ts.isIdentifier(decl.name)) {
        const name = decl.name.getText(sourceFile);
        if (/^[A-Z]/.test(name) && decl.initializer) {
          if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
            return containsJsxReturn(decl.initializer, sourceFile);
          }
          // HOC-wrapped component
          if (ts.isCallExpression(decl.initializer)) {
            const callee = getCalleeName(decl.initializer, sourceFile);
            return HOC_WRAPPING_CALLEE.has(callee);
          }
        }
      }
    }
  }

  // Class component: class Component extends React.Component
  if (ts.isClassDeclaration(node) && node.name) {
    const name = node.name.getText(sourceFile);
    if (/^[A-Z]/.test(name) && node.heritageClauses) {
      for (const clause of node.heritageClauses) {
        const clauseText = clause.getText(sourceFile);
        if (clauseText.includes('Component') || clauseText.includes('PureComponent')) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Get the root callee name of a CallExpression.
 *
 * Handles simple identifiers, property accesses, and curried HOCs like
 * connect(mapState)(Comp) by unwrapping nested CallExpression callees
 * to find the outermost function name.
 *
 * @param callExpr - The CallExpression AST node
 * @param sourceFile - The TypeScript source file context
 * @returns The name of the outermost callee
 */
export function getCalleeName(callExpr: ts.CallExpression, sourceFile: ts.SourceFile): string {
  let expr: ts.Expression = callExpr.expression;
  // Unwrap curried form: connect(mapState)(Comp) -> expression is connect(mapState) CallExpression
  while (ts.isCallExpression(expr)) {
    expr = expr.expression;
  }
  return expr.getText(sourceFile);
}
