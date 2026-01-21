/**
 * Component Detector for React Components
 *
 * Detects React components in source files.
 *
 * @module handlers/frontend/component-state/component-detector
 */

import ts from 'typescript';

/**
 * Check if a function body contains JSX return
 */
export function containsJsxReturn(node: ts.Node): boolean {
  let hasJsx = false;

  function visit(n: ts.Node): void {
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) {
      hasJsx = true;
      return;
    }
    if (!hasJsx) {
      ts.forEachChild(n, visit);
    }
  }

  visit(node);
  return hasJsx;
}

/**
 * Check if a node is a React component
 */
export function isReactComponent(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  // Function declaration: function Component() { return <div/> }
  if (ts.isFunctionDeclaration(node) && node.name) {
    const name = node.name.getText(sourceFile);
    if (/^[A-Z]/.test(name)) {
      return containsJsxReturn(node);
    }
  }

  // Arrow function assigned to const: const Component = () => <div/>
  if (ts.isVariableStatement(node)) {
    for (const decl of node.declarationList.declarations) {
      if (ts.isIdentifier(decl.name)) {
        const name = decl.name.getText(sourceFile);
        if (/^[A-Z]/.test(name) && decl.initializer) {
          // Direct arrow/function expression
          if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
            return containsJsxReturn(decl.initializer);
          }
          // React.memo() or React.forwardRef() wrapped components
          if (ts.isCallExpression(decl.initializer)) {
            const callExpr = decl.initializer;
            // Check if it's React.memo, memo, React.forwardRef, forwardRef
            const callText = callExpr.expression.getText(sourceFile);
            if (/^(React\.)?(memo|forwardRef)$/.test(callText)) {
              // The first argument should be the component function
              const firstArg = callExpr.arguments[0];
              if (firstArg && (ts.isArrowFunction(firstArg) || ts.isFunctionExpression(firstArg))) {
                return containsJsxReturn(firstArg);
              }
            }
          }
        }
      }
    }
  }

  return false;
}

/**
 * Get component name from a node
 */
export function getComponentName(node: ts.Node, sourceFile: ts.SourceFile): string | null {
  if (ts.isFunctionDeclaration(node) && node.name) {
    return node.name.getText(sourceFile);
  }

  if (ts.isVariableStatement(node)) {
    for (const decl of node.declarationList.declarations) {
      if (ts.isIdentifier(decl.name)) {
        return decl.name.getText(sourceFile);
      }
    }
  }

  return null;
}
