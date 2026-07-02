/**
 * React component detector — Lane 4.
 * Ported verbatim from frontend-engine `core/react/component-detector.ts`, with
 * the HOC/ast helpers sourced from `../ast.js` (the ported `shared/ast`).
 *
 * @module frontend/react/component-detector
 */

import ts from 'typescript';
import { HOC_WRAPPING_CALLEE, LAZY_CALLEE, containsJsxReturn, getCalleeName } from '../ast.js';
import type { UnwrapResult } from './types.js';

/** Extract a component name from a declaration node. */
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
  if (ts.isClassDeclaration(node) && node.name) {
    return node.name.getText(sourceFile);
  }
  return null;
}

/** Recursively unwrap nested HOC CallExpressions to find the render fn + wrappers. */
export function unwrapHocCall(callExpr: ts.CallExpression, sourceFile: ts.SourceFile): UnwrapResult {
  const result: UnwrapResult = { innerFn: null, wrappers: [], isLazy: false, hoistedComponent: null };
  let current: ts.CallExpression = callExpr;

  for (;;) {
    const calleeName = getCalleeName(current, sourceFile);
    const args = current.arguments;

    if (HOC_WRAPPING_CALLEE.has(calleeName)) {
      result.wrappers.push(calleeName);
      if (LAZY_CALLEE.has(calleeName)) {
        result.isLazy = true;
        break;
      }
      if (args.length > 0) {
        const firstArg = args[0];
        if (ts.isArrowFunction(firstArg) || ts.isFunctionExpression(firstArg)) {
          result.innerFn = firstArg;
          break;
        } else if (ts.isCallExpression(firstArg)) {
          current = firstArg;
          continue;
        }
      }
      break;
    } else {
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

/** Determine if a VariableDeclaration initialized with a CallExpression is an HOC component. */
export function detectHocWrappedComponent(
  decl: ts.VariableDeclaration,
  sourceFile: ts.SourceFile,
): UnwrapResult | null {
  if (!decl.initializer || !ts.isCallExpression(decl.initializer)) return null;
  if (!ts.isIdentifier(decl.name)) return null;

  const varName = decl.name.getText(sourceFile);
  if (!/^[A-Z]/.test(varName)) return null;

  const unwrapped = unwrapHocCall(decl.initializer, sourceFile);
  if (unwrapped.wrappers.length === 0) return null;

  if (!unwrapped.isLazy && !unwrapped.hoistedComponent) {
    if (!unwrapped.innerFn) return null;
    if (!containsJsxReturn(unwrapped.innerFn, sourceFile)) return null;
  }
  return unwrapped;
}

/** Detect an HOC-wrapped default export (`export default memo(...)` etc.). */
export function detectDefaultExportHoc(
  node: ts.ExportAssignment,
  sourceFile: ts.SourceFile,
): { name: string; unwrapped: UnwrapResult } | null {
  const expr = node.expression;
  if (!ts.isCallExpression(expr)) return null;

  const unwrapped = unwrapHocCall(expr, sourceFile);
  if (unwrapped.wrappers.length === 0) return null;

  if (!unwrapped.isLazy && !unwrapped.hoistedComponent) {
    if (!unwrapped.innerFn) return null;
    if (!containsJsxReturn(unwrapped.innerFn, sourceFile)) return null;
  }

  const name = unwrapped.hoistedComponent ?? 'DefaultExport';
  return { name, unwrapped };
}
