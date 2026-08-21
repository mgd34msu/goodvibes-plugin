/**
 * AST primitives for React component detection, Lane 4.
 *
 * Ported verbatim from frontend-engine `shared/ast.ts` (the read-only v1 quarry).
 * Pure functions over a `ts.SourceFile`; they carry no parsing of their own. The
 * frontend analyzers obtain that SourceFile from the shared compiler host
 * (`../frontend/source.ts` → `@goodvibes/intel host`), rewiring off the v1
 * ad-hoc `ts.createSourceFile` per §3.3.
 *
 * @module frontend/ast
 */

import ts from 'typescript';

/** Known React memo() callee names (simple and namespace forms). */
export const MEMO_CALLEE = new Set(['memo', 'React.memo']);

/** Known React forwardRef() callee names (simple and namespace forms). */
export const FORWARD_REF_CALLEE = new Set(['forwardRef', 'React.forwardRef']);

/** Known React lazy() callee names (simple and namespace forms). */
export const LAZY_CALLEE = new Set(['lazy', 'React.lazy']);

/** All known HOC wrapping callee names that wrap render functions. */
export const HOC_WRAPPING_CALLEE = new Set([
  ...MEMO_CALLEE,
  ...FORWARD_REF_CALLEE,
  ...LAZY_CALLEE,
]);

/**
 * Check if an AST node contains a JSX return (element / self-closing / fragment).
 * @param node - node to inspect (e.g. a function body)
 * @param _sourceFile - the source file context (unused; kept for call-site parity)
 */
export function containsJsxReturn(node: ts.Node, _sourceFile: ts.SourceFile): boolean {
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
 * Get the root callee name of a CallExpression, unwrapping curried HOCs like
 * `connect(mapState)(Comp)` to the outermost function name.
 * @param callExpr - the call expression
 * @param sourceFile - the source file context
 */
export function getCalleeName(callExpr: ts.CallExpression, sourceFile: ts.SourceFile): string {
  let expr: ts.Expression = callExpr.expression;
  while (ts.isCallExpression(expr)) {
    expr = expr.expression;
  }
  return expr.getText(sourceFile);
}

/**
 * Check if an AST node represents a React component (function, arrow, HOC-wrapped
 * const, or class extending Component/PureComponent).
 * @param node - the node to inspect
 * @param sourceFile - the source file context
 */
export function isReactComponent(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  // function Component() { return <div/> }
  if (ts.isFunctionDeclaration(node) && node.name) {
    const name = node.name.getText(sourceFile);
    if (/^[A-Z]/.test(name)) {
      return containsJsxReturn(node, sourceFile);
    }
  }

  // const Component = () => <div/>  |  const Component = memo(() => <div/>)
  if (ts.isVariableStatement(node)) {
    for (const decl of node.declarationList.declarations) {
      if (ts.isIdentifier(decl.name)) {
        const name = decl.name.getText(sourceFile);
        if (/^[A-Z]/.test(name) && decl.initializer) {
          if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
            return containsJsxReturn(decl.initializer, sourceFile);
          }
          if (ts.isCallExpression(decl.initializer)) {
            const callee = getCalleeName(decl.initializer, sourceFile);
            return HOC_WRAPPING_CALLEE.has(callee);
          }
        }
      }
    }
  }

  // class Component extends React.Component
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
