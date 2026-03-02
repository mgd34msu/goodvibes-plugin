/**
 * React Component Detector
 *
 * Detects HOC-wrapped React components, default export HOCs, and extracts
 * component names from various declaration types.
 *
 * @module core/react/component-detector
 */

import ts from 'typescript';
import {
  HOC_WRAPPING_CALLEE,
  LAZY_CALLEE,
  containsJsxReturn,
  getCalleeName,
} from '../../shared/ast.js';
import type { UnwrapResult } from './types.js';

// =============================================================================
// Component Name Extraction
// =============================================================================

/**
 * Extract component name from a node
 * @internal Exported for testing
 */
export function getComponentName(node: ts.Node, sourceFile: ts.SourceFile): string | null {
  if (ts.isFunctionDeclaration(node) && node.name) {
    return node.name.getText(sourceFile);
  }

  if (ts.isVariableStatement(node)) {
    for (const decl of node.declarationList.declarations) {
      /* v8 ignore next */ // Defensive: destructured variable declarations won't be components
      if (ts.isIdentifier(decl.name)) {
        return decl.name.getText(sourceFile);
      }
    }
  }

  if (ts.isClassDeclaration(node) && node.name) {
    return node.name.getText(sourceFile);
  }

  return null;
}

// =============================================================================
// HOC Detection
// =============================================================================

/**
 * Recursively unwrap nested HOC CallExpressions to find the inner render function
 * and collect wrapper names. Handles:
 *   memo(() => <div/>)
 *   forwardRef((props, ref) => <div/>)
 *   memo(forwardRef((props, ref) => <div/>))
 *   lazy(() => import('./Comp'))
 *   withRouter(MyComponent) / connect(mapState)(MyComponent)
 */
export function unwrapHocCall(callExpr: ts.CallExpression, sourceFile: ts.SourceFile): UnwrapResult {
  const result: UnwrapResult = {
    innerFn: null,
    wrappers: [],
    isLazy: false,
    hoistedComponent: null,
  };

  let current: ts.CallExpression = callExpr;

  while (true) {
    const calleeName = getCalleeName(current, sourceFile);
    const args = current.arguments;

    if (HOC_WRAPPING_CALLEE.has(calleeName)) {
      result.wrappers.push(calleeName);

      if (LAZY_CALLEE.has(calleeName)) {
        result.isLazy = true;
        // lazy(() => import('./X')) — no inner render fn to unwrap
        break;
      }

      // memo/forwardRef: first arg is the render function or another HOC call
      if (args.length > 0) {
        const firstArg = args[0];
        if (ts.isArrowFunction(firstArg) || ts.isFunctionExpression(firstArg)) {
          result.innerFn = firstArg;
          break;
        } else if (ts.isCallExpression(firstArg)) {
          // Nested HOC: e.g. memo(forwardRef(...))
          current = firstArg;
          continue;
        }
      }
      break;
    } else {
      // Unknown HOC (withRouter, connect, etc.) — look for a component identifier argument
      // For connect(mapState)(MyComponent) the outer call's arg is MyComponent
      // For withRouter(MyComponent) the first arg is MyComponent
      for (const arg of args) {
        if (ts.isIdentifier(arg)) {
          const name = arg.getText(sourceFile);
          if (/^[A-Z]/.test(name)) {
            result.hoistedComponent = name;
            result.wrappers.push(calleeName);
            break;
          }
        }
      }
      break;
    }
  }

  return result;
}

/**
 * Determine if a VariableDeclaration with a CallExpression initializer
 * represents an HOC-wrapped React component. Returns the unwrap result or null.
 */
export function detectHocWrappedComponent(
  decl: ts.VariableDeclaration,
  sourceFile: ts.SourceFile
): UnwrapResult | null {
  if (!decl.initializer || !ts.isCallExpression(decl.initializer)) return null;
  if (!ts.isIdentifier(decl.name)) return null;

  const varName = decl.name.getText(sourceFile);
  if (!/^[A-Z]/.test(varName)) return null;

  const unwrapped = unwrapHocCall(decl.initializer, sourceFile);

  // Accept if: it's a known HOC wrapper, or it's lazy
  if (unwrapped.wrappers.length === 0) return null;

  // For memo/forwardRef: require JSX in the inner function
  if (!unwrapped.isLazy && !unwrapped.hoistedComponent) {
    if (!unwrapped.innerFn) return null;
    if (!containsJsxReturn(unwrapped.innerFn, sourceFile)) return null;
  }

  return unwrapped;
}

/**
 * Detect HOC-wrapped default export:
 *   export default memo(() => <div/>)
 *   export default withRouter(MyComponent)
 * Returns { name, unwrapped } or null.
 */
export function detectDefaultExportHoc(
  node: ts.ExportAssignment,
  sourceFile: ts.SourceFile
): { name: string; unwrapped: UnwrapResult } | null {
  const expr = node.expression;
  if (!ts.isCallExpression(expr)) return null;

  const unwrapped = unwrapHocCall(expr, sourceFile);
  if (unwrapped.wrappers.length === 0) return null;

  // For memo/forwardRef: require JSX
  if (!unwrapped.isLazy && !unwrapped.hoistedComponent) {
    if (!unwrapped.innerFn) return null;
    if (!containsJsxReturn(unwrapped.innerFn, sourceFile)) return null;
  }

  // Determine the component name
  let name: string;
  if (unwrapped.hoistedComponent) {
    name = unwrapped.hoistedComponent;
  } else {
    // Anonymous — use the filename
    name = 'DefaultExport';
  }

  return { name, unwrapped };
}
