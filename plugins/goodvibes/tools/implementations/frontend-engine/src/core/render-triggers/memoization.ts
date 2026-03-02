/**
 * Memoization Detection for React Components
 *
 * Detects React.memo, PureComponent, and shouldComponentUpdate patterns.
 *
 * @module core/render-triggers/memoization
 */

import ts from 'typescript';
import type { MemoInfo, MemoType, ComponentAnalysis } from './types.js';
import { getLineNumberFromSourceFile } from '../../shared/utils.js';

// =============================================================================
// Memoization Detection
// =============================================================================

/**
 * Check if a component is memoized
 */
export function detectMemoization(sourceFile: ts.SourceFile): Map<string, MemoInfo> {
  const memoInfo = new Map<string, MemoInfo>();

  function visit(node: ts.Node): void {
    // Check for React.memo wrapper
    // const MyComp = React.memo(function MyComp() {...})
    // const MyComp = memo(({ ... }) => {...})
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.initializer) {
          const componentName = decl.name.getText(sourceFile);

          if (ts.isCallExpression(decl.initializer)) {
            const callExpr = decl.initializer.expression.getText(sourceFile);
            if (callExpr === 'memo' || callExpr === 'React.memo') {
              memoInfo.set(componentName, {
                is_memoized: true,
                memo_type: 'React.memo',
              });
            }
          }
        }
      }
    }

    // Check for class extending PureComponent
    if (ts.isClassDeclaration(node) && node.name) {
      const className = node.name.getText(sourceFile);

      if (node.heritageClauses) {
        for (const clause of node.heritageClauses) {
          const clauseText = clause.getText(sourceFile);
          if (clauseText.includes('PureComponent')) {
            memoInfo.set(className, {
              is_memoized: true,
              memo_type: 'PureComponent',
            });
          }
        }
      }

      // Check for shouldComponentUpdate method
      if (node.members) {
        for (const member of node.members) {
          if (ts.isMethodDeclaration(member) && member.name) {
            const methodName = member.name.getText(sourceFile);
            if (methodName === 'shouldComponentUpdate') {
              // Only add if not already marked as PureComponent
              if (!memoInfo.has(className)) {
                memoInfo.set(className, {
                  is_memoized: true,
                  memo_type: 'shouldComponentUpdate',
                });
              }
            }
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return memoInfo;
}

// =============================================================================
// Component Detection
// =============================================================================

/**
 * Check if a node returns JSX
 */
export function containsJsxReturn(node: ts.Node): boolean {
  let hasJsx = false;

  function visit(n: ts.Node): void {
    if (hasJsx) return;
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
 * Find React components in a source file
 */
export function findComponents(sourceFile: ts.SourceFile, memoInfo: Map<string, MemoInfo>): ComponentAnalysis[] {
  const components: ComponentAnalysis[] = [];

  function visit(node: ts.Node): void {
    // Function declaration: function Component() { return <div/> }
    if (ts.isFunctionDeclaration(node) && node.name) {
      const name = node.name.getText(sourceFile);
      if (/^[A-Z]/.test(name) && containsJsxReturn(node)) {
        components.push({
          name,
          node,
          line: getLineNumberFromSourceFile(node.getStart(sourceFile), sourceFile),
          memoInfo: memoInfo.get(name) || { is_memoized: false },
        });
      }
    }

    // Arrow function assigned to const: const Component = () => <div/>
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          const name = decl.name.getText(sourceFile);
          if (/^[A-Z]/.test(name) && decl.initializer) {
            // Check if it's a React.memo call
            if (ts.isCallExpression(decl.initializer)) {
              const callText = decl.initializer.expression.getText(sourceFile);
              if ((callText === 'memo' || callText === 'React.memo') &&
                  decl.initializer.arguments.length > 0) {
                const arg = decl.initializer.arguments[0];
                if (containsJsxReturn(arg)) {
                  components.push({
                    name,
                    node: arg,
                    line: getLineNumberFromSourceFile(node.getStart(sourceFile), sourceFile),
                    memoInfo: memoInfo.get(name) || { is_memoized: true, memo_type: 'React.memo' },
                  });
                }
              }
            } else if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
              if (containsJsxReturn(decl.initializer)) {
                components.push({
                  name,
                  node: decl.initializer,
                  line: getLineNumberFromSourceFile(node.getStart(sourceFile), sourceFile),
                  memoInfo: memoInfo.get(name) || { is_memoized: false },
                });
              }
            }
          }
        }
      }
    }

    // Class component
    if (ts.isClassDeclaration(node) && node.name) {
      const name = node.name.getText(sourceFile);
      if (/^[A-Z]/.test(name) && node.heritageClauses) {
        for (const clause of node.heritageClauses) {
          const text = clause.getText(sourceFile);
          if (text.includes('Component') || text.includes('PureComponent')) {
            components.push({
              name,
              node,
              line: getLineNumberFromSourceFile(node.getStart(sourceFile), sourceFile),
              memoInfo: memoInfo.get(name) || { is_memoized: false },
            });
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return components;
}
