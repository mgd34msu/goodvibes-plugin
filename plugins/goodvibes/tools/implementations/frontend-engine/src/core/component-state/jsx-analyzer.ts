/**
 * JSX Analyzer for React Components
 *
 * Analyzes JSX to find state/props usage and props passed to children.
 *
 * @module core/component-state/jsx-analyzer
 */

import ts from 'typescript';
import type { AnalysisContext } from './types.js';

/**
 * Collect all identifiers used in an expression
 */
export function collectUsedIdentifiers(node: ts.Node, sourceFile: ts.SourceFile, identifiers: Set<string>): void {
  if (ts.isIdentifier(node)) {
    identifiers.add(node.getText(sourceFile));
  }
  ts.forEachChild(node, child => collectUsedIdentifiers(child, sourceFile, identifiers));
}

/**
 * Analyze JSX to find:
 * 1. Which state/props are used in JSX
 * 2. Which props are passed to child components
 * 3. Inline callbacks that may cause instability
 */
export function analyzeJsx(componentNode: ts.Node, ctx: AnalysisContext): void {
  const { sourceFile, stateVariables, propNames, contextValues, jsxUsedIdentifiers, jsxPassedProps, inlineCallbacks } = ctx;

  function determineSource(name: string): 'prop' | 'state' | 'derived' | 'context' {
    if (propNames.has(name)) return 'prop';
    if (stateVariables.has(name)) return 'state';
    if (contextValues.has(name)) return 'context';
    return 'derived';
  }

  function visit(node: ts.Node): void {
    // JSX element with props
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile);

      // Only analyze custom components (uppercase)
      if (/^[A-Z]/.test(tagName)) {
        for (const attr of node.attributes.properties) {
          if (ts.isJsxAttribute(attr) && attr.name) {
            const attrName = attr.name.getText(sourceFile);
            const initializer = attr.initializer;

            if (initializer && ts.isJsxExpression(initializer) && initializer.expression) {
              const expr = initializer.expression;
              const exprText = expr.getText(sourceFile);

              // Check for inline arrow functions
              if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
                const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
                inlineCallbacks.push({
                  component: tagName,
                  propName: attrName,
                  line: line + 1,
                });
              }

              // Determine source of the passed value
              let source: 'prop' | 'state' | 'derived' | 'context' = 'derived';

              if (ts.isIdentifier(expr)) {
                const name = expr.getText(sourceFile);
                source = determineSource(name);
                jsxUsedIdentifiers.add(name);
              } else if (ts.isPropertyAccessExpression(expr)) {
                // e.g., user.name or state.value
                const objectName = expr.expression.getText(sourceFile);
                source = determineSource(objectName);
                jsxUsedIdentifiers.add(objectName);
              }

              jsxPassedProps.push({
                prop_name: attrName,
                to_component: tagName,
                original_source: source,
              });
            }
          }
        }
      }
    }

    // Track identifiers used in JSX expressions
    if (ts.isJsxExpression(node) && node.expression) {
      collectUsedIdentifiers(node.expression, sourceFile, jsxUsedIdentifiers);
    }

    ts.forEachChild(node, visit);
  }

  visit(componentNode);
}
