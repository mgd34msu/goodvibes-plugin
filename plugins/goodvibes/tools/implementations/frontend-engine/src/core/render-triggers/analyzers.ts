/**
 * Render Trigger Analyzers
 *
 * Analyzes state hooks, props, context, inline definitions, and expensive computations.
 *
 * @module core/render-triggers/analyzers
 */

import ts from 'typescript';
import type {
  RenderTrigger,
  InlineDefinition,
  ExpensiveComputation,
  ContextSubscription,
  ChildAnalysis,
  ContextGranularity,
  MemoInfo,
} from './types.js';
import {
  getLineNumber,
  getCodeSnippet,
  isInsideJsxAttribute,
  isInsideMemoizationHook,
} from './utils.js';

// =============================================================================
// State Hook Analysis
// =============================================================================

/**
 * Find state hooks (useState, useReducer) and their identifiers
 */
export function findStateHooks(componentNode: ts.Node, sourceFile: ts.SourceFile): RenderTrigger[] {
  const triggers: RenderTrigger[] = [];

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const callText = node.expression.getText(sourceFile);

      if (callText === 'useState' || callText === 'React.useState') {
        // Extract the state variable name from destructuring
        const parent = node.parent;
        if (ts.isVariableDeclaration(parent) && ts.isArrayBindingPattern(parent.name)) {
          const elements = parent.name.elements;
          if (elements.length >= 1 && ts.isBindingElement(elements[0])) {
            const stateName = elements[0].name.getText(sourceFile);
            triggers.push({
              type: 'state',
              name: stateName,
              source: `useState hook at line ${getLineNumber(node, sourceFile)}`,
              frequency: 'on_change',
              preventable: false,
            });
          }
        }
      } else if (callText === 'useReducer' || callText === 'React.useReducer') {
        const parent = node.parent;
        if (ts.isVariableDeclaration(parent) && ts.isArrayBindingPattern(parent.name)) {
          const elements = parent.name.elements;
          if (elements.length >= 1 && ts.isBindingElement(elements[0])) {
            const stateName = elements[0].name.getText(sourceFile);
            triggers.push({
              type: 'state',
              name: stateName,
              source: `useReducer hook at line ${getLineNumber(node, sourceFile)}`,
              frequency: 'on_change',
              preventable: false,
            });
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(componentNode);
  return triggers;
}

/**
 * Find props that trigger re-renders
 */
export function findPropTriggers(componentNode: ts.Node, sourceFile: ts.SourceFile, isMemoized: boolean): RenderTrigger[] {
  const triggers: RenderTrigger[] = [];
  const props: string[] = [];

  // Extract props from function parameters
  let params: ts.NodeArray<ts.ParameterDeclaration> | undefined;

  if (ts.isFunctionDeclaration(componentNode)) {
    params = componentNode.parameters;
  } else if (ts.isArrowFunction(componentNode) || ts.isFunctionExpression(componentNode)) {
    params = componentNode.parameters;
  }

  if (params && params.length > 0) {
    const firstParam = params[0];

    // Destructured props
    if (ts.isObjectBindingPattern(firstParam.name)) {
      for (const element of firstParam.name.elements) {
        if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
          props.push(element.name.getText(sourceFile));
        }
      }
    }
  }

  // Add a generic prop trigger
  if (props.length > 0) {
    triggers.push({
      type: 'prop',
      name: props.join(', '),
      source: 'Component props',
      frequency: isMemoized ? 'on_change' : 'every_render',
      preventable: !isMemoized,
      prevention_method: isMemoized ? undefined : 'Wrap component with React.memo()',
    });
  }

  return triggers;
}

/**
 * Check for forceUpdate usage (class components)
 */
export function findForceUpdateTriggers(componentNode: ts.Node, sourceFile: ts.SourceFile): RenderTrigger[] {
  const triggers: RenderTrigger[] = [];

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const callText = node.expression.getText(sourceFile);
      if (callText === 'this.forceUpdate' || callText.endsWith('.forceUpdate')) {
        triggers.push({
          type: 'force_update',
          source: `forceUpdate() call at line ${getLineNumber(node, sourceFile)}`,
          frequency: 'rare',
          preventable: true,
          prevention_method: 'Avoid forceUpdate; use state or props to trigger re-renders',
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(componentNode);
  return triggers;
}

// =============================================================================
// Inline Definition Detection
// =============================================================================

/**
 * Find inline definitions that create new references on every render
 */
export function findInlineDefinitions(componentNode: ts.Node, sourceFile: ts.SourceFile): InlineDefinition[] {
  const issues: InlineDefinition[] = [];

  function visitJsxAttribute(node: ts.JsxAttribute): void {
    const initializer = node.initializer;
    if (!initializer || !ts.isJsxExpression(initializer)) return;

    const expr = initializer.expression;
    if (!expr) return;

    // Skip if inside a memoization hook
    if (isInsideMemoizationHook(expr, sourceFile)) return;

    const attrName = node.name.getText(sourceFile);

    // Inline object: style={{ margin: 10 }}
    if (ts.isObjectLiteralExpression(expr)) {
      issues.push({
        type: 'object',
        code_snippet: getCodeSnippet(expr, sourceFile),
        line: getLineNumber(expr, sourceFile),
        issue: `Inline object for "${attrName}" creates new reference on every render`,
        fix: 'Extract to useMemo or constant outside component',
      });
    }

    // Inline function: onClick={() => handle(id)}
    if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
      issues.push({
        type: 'function',
        code_snippet: getCodeSnippet(expr, sourceFile),
        line: getLineNumber(expr, sourceFile),
        issue: `Inline function for "${attrName}" creates new reference on every render`,
        fix: 'Use useCallback with proper dependencies',
      });
    }

    // Inline array: items={[1, 2, 3]}
    if (ts.isArrayLiteralExpression(expr)) {
      issues.push({
        type: 'array',
        code_snippet: getCodeSnippet(expr, sourceFile),
        line: getLineNumber(expr, sourceFile),
        issue: `Inline array for "${attrName}" creates new reference on every render`,
        fix: 'Extract to useMemo or constant outside component',
      });
    }

    // Inline JSX: children={<Component />}
    if (ts.isJsxElement(expr) || ts.isJsxSelfClosingElement(expr)) {
      issues.push({
        type: 'jsx',
        code_snippet: getCodeSnippet(expr, sourceFile),
        line: getLineNumber(expr, sourceFile),
        issue: `Inline JSX for "${attrName}" creates new element on every render`,
        fix: 'Extract to a memoized component or useMemo',
      });
    }
  }

  function visit(node: ts.Node): void {
    if (ts.isJsxAttribute(node)) {
      visitJsxAttribute(node);
    }
    ts.forEachChild(node, visit);
  }

  visit(componentNode);
  return issues;
}

// =============================================================================
// Expensive Computation Detection
// =============================================================================

/**
 * Find expensive computations not wrapped in useMemo
 */
export function findExpensiveComputations(componentNode: ts.Node, sourceFile: ts.SourceFile): ExpensiveComputation[] {
  const computations: ExpensiveComputation[] = [];
  const memoizedVars = new Set<string>();

  // First pass: find variables wrapped in useMemo
  function findMemoized(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isCallExpression(node.initializer)) {
      const callText = node.initializer.expression.getText(sourceFile);
      if (callText === 'useMemo' || callText === 'React.useMemo') {
        if (ts.isIdentifier(node.name)) {
          memoizedVars.add(node.name.getText(sourceFile));
        }
      }
    }
    ts.forEachChild(node, findMemoized);
  }
  findMemoized(componentNode);

  // Second pass: find expensive operations
  function findExpensive(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      // Skip if inside useMemo
      if (isInsideMemoizationHook(node, sourceFile)) {
        ts.forEachChild(node, findExpensive);
        return;
      }

      // Skip if this is a useMemo/useCallback call itself
      const callText = node.expression.getText(sourceFile);
      if (['useMemo', 'useCallback', 'React.useMemo', 'React.useCallback'].includes(callText)) {
        ts.forEachChild(node, findExpensive);
        return;
      }

      // Check for array methods that could be expensive
      if (ts.isPropertyAccessExpression(node.expression)) {
        const methodName = node.expression.name.getText(sourceFile);
        const expensiveMethods = ['map', 'filter', 'reduce', 'sort', 'flatMap', 'find', 'findIndex'];

        if (expensiveMethods.includes(methodName)) {
          // Check if it's in a useMemo dependency
          const line = getLineNumber(node, sourceFile);
          computations.push({
            description: `Array ${methodName}() operation`,
            line,
            is_memoized: false,
            suggestion: `Wrap in useMemo if the array or callback rarely changes`,
          });
        }
      }

      // Check for Object.keys/values/entries
      if (ts.isPropertyAccessExpression(node.expression)) {
        const text = node.expression.getText(sourceFile);
        if (text.match(/^Object\.(keys|values|entries)$/)) {
          computations.push({
            description: `${text}() creates new array on every call`,
            line: getLineNumber(node, sourceFile),
            is_memoized: false,
            suggestion: 'Wrap in useMemo if the object rarely changes',
          });
        }
      }
    }

    // Check for object spread creating new references
    if (ts.isObjectLiteralExpression(node) && !isInsideJsxAttribute(node) && !isInsideMemoizationHook(node, sourceFile)) {
      const hasSpread = node.properties.some(p => ts.isSpreadAssignment(p));
      if (hasSpread) {
        // Check if this is in a variable declaration or return statement (not JSX)
        const parent = node.parent;
        if (ts.isVariableDeclaration(parent) || ts.isReturnStatement(parent)) {
          computations.push({
            description: 'Object spread creates new object reference',
            line: getLineNumber(node, sourceFile),
            is_memoized: false,
            suggestion: 'Wrap in useMemo if spread rarely changes',
          });
        }
      }
    }

    ts.forEachChild(node, findExpensive);
  }

  findExpensive(componentNode);
  return computations;
}

// =============================================================================
// Context Subscription Analysis
// =============================================================================

/**
 * Analyze context usage patterns
 */
export function analyzeContextUsage(componentNode: ts.Node, sourceFile: ts.SourceFile): ContextSubscription[] {
  const subscriptions: ContextSubscription[] = [];

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const callText = node.expression.getText(sourceFile);

      if (callText === 'useContext' || callText === 'React.useContext') {
        const args = node.arguments;
        if (args.length > 0) {
          const contextName = args[0].getText(sourceFile);

          // Check how the context value is used
          const parent = node.parent;

          let selector: string | undefined;
          let granularity: ContextGranularity = 'entire_context';
          let issue: string | undefined;

          // Check if destructuring only part of the context
          if (ts.isVariableDeclaration(parent) && ts.isObjectBindingPattern(parent.name)) {
            const props = parent.name.elements
              .filter(e => ts.isBindingElement(e) && ts.isIdentifier(e.name))
              .map(e => (e as ts.BindingElement).name.getText(sourceFile));

            if (props.length > 0) {
              selector = `{ ${props.join(', ')} }`;
              // Even with destructuring, component re-renders on any context change
              issue = `Destructuring ${props.length} properties, but component re-renders when ANY context value changes`;
            }
          }

          if (!selector) {
            issue = 'Subscribes to entire context; any change will trigger re-render';
          }

          subscriptions.push({
            context: contextName,
            selector,
            granularity,
            issue,
          });
        }
      }

      // Check for useSelector (Redux-style selector patterns)
      if (callText === 'useSelector') {
        const args = node.arguments;
        if (args.length > 0) {
          const selectorCode = getCodeSnippet(args[0], sourceFile);
          subscriptions.push({
            context: 'Redux Store',
            selector: selectorCode,
            granularity: 'selected_value',
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(componentNode);
  return subscriptions;
}

// =============================================================================
// Child Component Analysis
// =============================================================================

/**
 * Analyze props passed to child components
 */
export function analyzeChildProps(
  componentNode: ts.Node,
  sourceFile: ts.SourceFile,
  inlineDefinitions: InlineDefinition[],
  memoInfo: Map<string, MemoInfo>
): ChildAnalysis[] {
  const children: ChildAnalysis[] = [];
  const inlineLines = new Set(inlineDefinitions.map(d => d.line));

  function visit(node: ts.Node): void {
    // Check JSX elements (custom components start with uppercase)
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile);

      // Only custom components (uppercase)
      if (/^[A-Z]/.test(tagName)) {
        const unstableProps: string[] = [];

        // Analyze attributes
        const attributes = node.attributes;
        if (attributes && ts.isJsxAttributes(attributes)) {
          for (const attr of attributes.properties) {
            if (ts.isJsxAttribute(attr) && attr.initializer && ts.isJsxExpression(attr.initializer)) {
              const expr = attr.initializer.expression;
              if (expr) {
                const attrLine = getLineNumber(expr, sourceFile);
                const attrName = attr.name.getText(sourceFile);

                // Check if this attribute has an inline definition issue
                if (inlineLines.has(attrLine)) {
                  unstableProps.push(attrName);
                }

                // Also check for inline definitions not in our list yet
                if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr) ||
                    ts.isObjectLiteralExpression(expr) || ts.isArrayLiteralExpression(expr)) {
                  if (!isInsideMemoizationHook(expr, sourceFile) && !unstableProps.includes(attrName)) {
                    unstableProps.push(attrName);
                  }
                }
              }
            }
          }
        }

        children.push({
          component: tagName,
          // Note: memoInfo only contains components defined in the current file.
          // Imported components (e.g., from other modules) default to unmemoized.
          memoized: memoInfo.get(tagName)?.is_memoized ?? false,
          receives_unstable_props: unstableProps.length > 0,
          unstable_props: unstableProps.length > 0 ? unstableProps : undefined,
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(componentNode);

  // Deduplicate children by component name
  const uniqueChildren = new Map<string, ChildAnalysis>();
  for (const child of children) {
    const existing = uniqueChildren.get(child.component);
    if (existing) {
      // Merge unstable props
      if (child.unstable_props) {
        existing.unstable_props = [
          ...new Set([...(existing.unstable_props || []), ...child.unstable_props])
        ];
        existing.receives_unstable_props = true;
      }
    } else {
      uniqueChildren.set(child.component, child);
    }
  }

  return Array.from(uniqueChildren.values());
}
