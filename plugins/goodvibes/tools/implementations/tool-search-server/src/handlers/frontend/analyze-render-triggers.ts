/**
 * Analyze Render Triggers Handler
 *
 * Identifies what causes React components to re-render by analyzing:
 * - Memoization status (React.memo, PureComponent, shouldComponentUpdate)
 * - Inline definitions (objects, arrays, functions, JSX in render)
 * - Expensive computations not wrapped in useMemo
 * - Context subscriptions and their granularity
 * - Child component prop stability
 *
 * @module handlers/frontend/analyze-render-triggers
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

// =============================================================================
// Types
// =============================================================================

/**
 * Arguments for the analyze_render_triggers tool
 */
export interface AnalyzeRenderTriggersArgs {
  /** Path to the React component file to analyze */
  file: string;
  /** Analyze child component memoization (default: false) */
  include_children?: boolean;
}

/**
 * Memoization type information
 */
type MemoType = 'React.memo' | 'PureComponent' | 'shouldComponentUpdate';

/**
 * Render trigger types
 */
type TriggerType = 'state' | 'prop' | 'context' | 'parent' | 'force_update';

/**
 * Frequency of render triggers
 */
type TriggerFrequency = 'every_render' | 'on_change' | 'rare';

/**
 * Inline definition types
 */
type InlineDefinitionType = 'object' | 'array' | 'function' | 'jsx';

/**
 * Context granularity
 */
type ContextGranularity = 'entire_context' | 'selected_value';

/**
 * Optimization suggestion priority
 */
type OptimizationPriority = 'high' | 'medium' | 'low';

/**
 * Optimization suggestion types
 */
type OptimizationType = 'memo' | 'useCallback' | 'useMemo' | 'context_split' | 'state_colocation';

/**
 * Information about a render trigger
 */
interface RenderTrigger {
  type: TriggerType;
  name?: string;
  source: string;
  frequency: TriggerFrequency;
  preventable: boolean;
  prevention_method?: string;
}

/**
 * Information about an inline definition
 */
interface InlineDefinition {
  type: InlineDefinitionType;
  code_snippet: string;
  line: number;
  issue: string;
  fix: string;
}

/**
 * Information about an expensive computation
 */
interface ExpensiveComputation {
  description: string;
  line: number;
  is_memoized: boolean;
  suggestion?: string;
}

/**
 * Information about a context subscription
 */
interface ContextSubscription {
  context: string;
  selector?: string;
  granularity: ContextGranularity;
  issue?: string;
}

/**
 * Information about a child component's prop stability
 */
interface ChildAnalysis {
  component: string;
  memoized: boolean;
  receives_unstable_props: boolean;
  unstable_props?: string[];
}

/**
 * Optimization suggestion
 */
interface OptimizationSuggestion {
  priority: OptimizationPriority;
  type: OptimizationType;
  description: string;
  estimated_impact: string;
  code_example?: string;
}

/**
 * Result of render trigger analysis
 */
interface AnalyzeRenderTriggersResult {
  component: string;
  file: string;
  is_memoized: boolean;
  memo_type?: MemoType;
  render_triggers: RenderTrigger[];
  inline_definitions: InlineDefinition[];
  expensive_computations: ExpensiveComputation[];
  context_subscriptions: ContextSubscription[];
  children_analysis?: ChildAnalysis[];
  optimization_suggestions: OptimizationSuggestion[];
}

/**
 * Tool response format
 */
interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Internal memoization info
 */
interface MemoInfo {
  is_memoized: boolean;
  memo_type?: MemoType;
}

/**
 * Internal component info for analysis
 */
interface ComponentAnalysis {
  name: string;
  node: ts.Node;
  line: number;
  memoInfo: MemoInfo;
}

// =============================================================================
// Response Helpers
// =============================================================================

function createSuccessResponse<T>(data: T): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

function createErrorResponse(message: string, context?: Record<string, unknown>): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message, ...context }, null, 2) }],
    isError: true,
  };
}

// =============================================================================
// Path Helpers
// =============================================================================

function normalizeFilePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function makeRelativePath(absolutePath: string, projectRoot: string): string {
  return normalizeFilePath(path.relative(projectRoot, absolutePath));
}

// =============================================================================
// AST Helpers
// =============================================================================

/**
 * Get line number for a node (1-based)
 */
function getLineNumber(node: ts.Node, sourceFile: ts.SourceFile): number {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return line + 1;
}

/**
 * Get a clean code snippet for a node
 */
function getCodeSnippet(node: ts.Node, sourceFile: ts.SourceFile, maxLength = 80): string {
  const text = node.getText(sourceFile).replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
}

/**
 * Check if we're inside a JSX attribute context
 */
function isInsideJsxAttribute(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isJsxAttribute(current)) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

/**
 * Check if a node is inside a hook call (useCallback, useMemo)
 */
function isInsideMemoizationHook(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isCallExpression(current)) {
      const callText = current.expression.getText();
      if (callText === 'useCallback' || callText === 'useMemo' ||
          callText === 'React.useCallback' || callText === 'React.useMemo') {
        return true;
      }
    }
    current = current.parent;
  }
  return false;
}

/**
 * Check if a node is a constant outside the component
 */
function isTopLevelConstant(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    // If we hit a function/arrow function that's not at the top level, we're inside a component
    if ((ts.isFunctionDeclaration(current) || ts.isArrowFunction(current) ||
         ts.isFunctionExpression(current)) && current.parent !== sourceFile) {
      return false;
    }
    // If parent is source file, we're at the top level
    if (current.parent === sourceFile) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

// =============================================================================
// Memoization Detection
// =============================================================================

/**
 * Check if a component is memoized
 */
function detectMemoization(sourceFile: ts.SourceFile): Map<string, MemoInfo> {
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
function containsJsxReturn(node: ts.Node): boolean {
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
function findComponents(sourceFile: ts.SourceFile, memoInfo: Map<string, MemoInfo>): ComponentAnalysis[] {
  const components: ComponentAnalysis[] = [];

  function visit(node: ts.Node): void {
    // Function declaration: function Component() { return <div/> }
    if (ts.isFunctionDeclaration(node) && node.name) {
      const name = node.name.getText(sourceFile);
      if (/^[A-Z]/.test(name) && containsJsxReturn(node)) {
        components.push({
          name,
          node,
          line: getLineNumber(node, sourceFile),
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
                    line: getLineNumber(node, sourceFile),
                    memoInfo: memoInfo.get(name) || { is_memoized: true, memo_type: 'React.memo' },
                  });
                }
              }
            } else if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
              if (containsJsxReturn(decl.initializer)) {
                components.push({
                  name,
                  node: decl.initializer,
                  line: getLineNumber(node, sourceFile),
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
              line: getLineNumber(node, sourceFile),
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

// =============================================================================
// Render Trigger Analysis
// =============================================================================

/**
 * Find state hooks (useState, useReducer) and their identifiers
 */
function findStateHooks(componentNode: ts.Node, sourceFile: ts.SourceFile): RenderTrigger[] {
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
function findPropTriggers(componentNode: ts.Node, sourceFile: ts.SourceFile, isMemoized: boolean): RenderTrigger[] {
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
function findForceUpdateTriggers(componentNode: ts.Node, sourceFile: ts.SourceFile): RenderTrigger[] {
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
function findInlineDefinitions(componentNode: ts.Node, sourceFile: ts.SourceFile): InlineDefinition[] {
  const issues: InlineDefinition[] = [];

  function visitJsxAttribute(node: ts.JsxAttribute): void {
    const initializer = node.initializer;
    if (!initializer || !ts.isJsxExpression(initializer)) return;

    const expr = initializer.expression;
    if (!expr) return;

    // Skip if inside a memoization hook
    if (isInsideMemoizationHook(expr)) return;

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
function findExpensiveComputations(componentNode: ts.Node, sourceFile: ts.SourceFile): ExpensiveComputation[] {
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
      if (isInsideMemoizationHook(node)) {
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

      // Check for spread into new object/array
      if (ts.isSpreadElement(node.parent)) {
        // This is handled by the parent object/array literal
      }
    }

    // Check for object spread creating new references
    if (ts.isObjectLiteralExpression(node) && !isInsideJsxAttribute(node) && !isInsideMemoizationHook(node)) {
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
function analyzeContextUsage(componentNode: ts.Node, sourceFile: ts.SourceFile): ContextSubscription[] {
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
function analyzeChildProps(
  componentNode: ts.Node,
  sourceFile: ts.SourceFile,
  inlineDefinitions: InlineDefinition[]
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
                  if (!isInsideMemoizationHook(expr) && !unstableProps.includes(attrName)) {
                    unstableProps.push(attrName);
                  }
                }
              }
            }
          }
        }

        children.push({
          component: tagName,
          memoized: false, // We'd need to analyze the child component to know this
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

// =============================================================================
// Optimization Suggestions
// =============================================================================

/**
 * Generate optimization suggestions based on analysis
 */
function generateSuggestions(
  isMemoized: boolean,
  inlineDefinitions: InlineDefinition[],
  expensiveComputations: ExpensiveComputation[],
  contextSubscriptions: ContextSubscription[],
  childrenAnalysis: ChildAnalysis[]
): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = [];

  // Check if component should be memoized
  if (!isMemoized && childrenAnalysis.length > 0) {
    suggestions.push({
      priority: 'medium',
      type: 'memo',
      description: 'Consider wrapping component with React.memo() to prevent unnecessary re-renders from parent',
      estimated_impact: 'Prevents re-renders when props are shallowly equal',
      code_example: 'export const MyComponent = React.memo(function MyComponent(props) { ... })',
    });
  }

  // Inline functions
  const inlineFunctions = inlineDefinitions.filter(d => d.type === 'function');
  if (inlineFunctions.length > 0) {
    suggestions.push({
      priority: 'high',
      type: 'useCallback',
      description: `${inlineFunctions.length} inline function(s) create new references on every render`,
      estimated_impact: 'Prevents child components from re-rendering when using React.memo',
      code_example: `const handleClick = useCallback(() => {
  // handler logic
}, [dependency]);`,
    });
  }

  // Inline objects/arrays
  const inlineObjects = inlineDefinitions.filter(d => d.type === 'object' || d.type === 'array');
  if (inlineObjects.length > 0) {
    suggestions.push({
      priority: 'high',
      type: 'useMemo',
      description: `${inlineObjects.length} inline object(s)/array(s) create new references on every render`,
      estimated_impact: 'Prevents unnecessary re-renders in memoized child components',
      code_example: `const style = useMemo(() => ({ margin: 10 }), []);`,
    });
  }

  // Expensive computations
  const unmemoizedComputations = expensiveComputations.filter(c => !c.is_memoized);
  if (unmemoizedComputations.length > 0) {
    suggestions.push({
      priority: 'medium',
      type: 'useMemo',
      description: `${unmemoizedComputations.length} potentially expensive computation(s) run on every render`,
      estimated_impact: 'Reduces CPU usage by caching computation results',
      code_example: `const sortedItems = useMemo(() => items.sort(compareFn), [items]);`,
    });
  }

  // Context subscriptions
  const broadContextSubs = contextSubscriptions.filter(
    c => c.granularity === 'entire_context' && c.issue
  );
  if (broadContextSubs.length > 0) {
    suggestions.push({
      priority: 'medium',
      type: 'context_split',
      description: 'Component subscribes to entire context(s) and re-renders on any change',
      estimated_impact: 'Split context or use selectors to reduce unnecessary re-renders',
      code_example: `// Split context into smaller pieces
const UserContext = createContext(null);
const ThemeContext = createContext(null);

// Or use a selector library like use-context-selector`,
    });
  }

  // Children receiving unstable props
  const unstableChildren = childrenAnalysis.filter(c => c.receives_unstable_props);
  if (unstableChildren.length > 0 && isMemoized) {
    suggestions.push({
      priority: 'high',
      type: 'useCallback',
      description: `${unstableChildren.length} child component(s) receive unstable props, negating any memoization`,
      estimated_impact: 'Critical - memoized children will still re-render due to unstable props',
    });
  }

  // Sort by priority
  const priorityOrder: Record<OptimizationPriority, number> = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return suggestions;
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Handles the analyze_render_triggers MCP tool call.
 *
 * Analyzes a React component file to identify:
 * - Whether the component is memoized
 * - What triggers re-renders (state, props, context, parent)
 * - Inline definitions that create unstable references
 * - Expensive computations not wrapped in useMemo
 * - Context subscription patterns
 * - Props passed to child components
 *
 * @param args - The analyze_render_triggers tool arguments
 * @returns MCP tool response with render trigger analysis
 */
export async function handleAnalyzeRenderTriggers(
  args: AnalyzeRenderTriggersArgs
): Promise<ToolResponse> {
  const projectRoot = process.cwd();
  const includeChildren = args.include_children ?? false;

  // Validate file argument
  if (!args.file) {
    return createErrorResponse('file argument is required');
  }

  const filePath = path.isAbsolute(args.file)
    ? args.file
    : path.resolve(projectRoot, args.file);

  if (!fs.existsSync(filePath)) {
    return createErrorResponse(`File not found: ${args.file}`, { provided_path: args.file });
  }

  // Check file extension
  const ext = path.extname(filePath).toLowerCase();
  if (!['.tsx', '.jsx', '.ts', '.js'].includes(ext)) {
    return createErrorResponse(
      'File must be a React component file (.tsx, .jsx, .ts, or .js)',
      { provided_extension: ext }
    );
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      ext === '.tsx' || ext === '.jsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );

    const relativePath = makeRelativePath(filePath, projectRoot);

    // Detect memoization patterns
    const memoInfo = detectMemoization(sourceFile);

    // Find components in the file
    const components = findComponents(sourceFile, memoInfo);

    if (components.length === 0) {
      return createSuccessResponse({
        message: 'No React components found in file',
        file: relativePath,
      });
    }

    // Analyze the first/main component (or we could return all)
    const mainComponent = components[0];
    const componentMemo = mainComponent.memoInfo;

    // Gather all render triggers
    const renderTriggers: RenderTrigger[] = [
      ...findStateHooks(mainComponent.node, sourceFile),
      ...findPropTriggers(mainComponent.node, sourceFile, componentMemo.is_memoized),
      ...findForceUpdateTriggers(mainComponent.node, sourceFile),
    ];

    // Add parent re-render trigger
    renderTriggers.push({
      type: 'parent',
      source: 'Parent component re-render',
      frequency: componentMemo.is_memoized ? 'on_change' : 'every_render',
      preventable: !componentMemo.is_memoized,
      prevention_method: componentMemo.is_memoized
        ? undefined
        : 'Wrap component with React.memo()',
    });

    // Find inline definitions
    const inlineDefinitions = findInlineDefinitions(mainComponent.node, sourceFile);

    // Find expensive computations
    const expensiveComputations = findExpensiveComputations(mainComponent.node, sourceFile);

    // Analyze context usage
    const contextSubscriptions = analyzeContextUsage(mainComponent.node, sourceFile);

    // Analyze child components if requested
    let childrenAnalysis: ChildAnalysis[] | undefined;
    if (includeChildren) {
      childrenAnalysis = analyzeChildProps(mainComponent.node, sourceFile, inlineDefinitions);
    }

    // Generate optimization suggestions
    const optimizationSuggestions = generateSuggestions(
      componentMemo.is_memoized,
      inlineDefinitions,
      expensiveComputations,
      contextSubscriptions,
      childrenAnalysis || []
    );

    const result: AnalyzeRenderTriggersResult = {
      component: mainComponent.name,
      file: relativePath,
      is_memoized: componentMemo.is_memoized,
      memo_type: componentMemo.memo_type,
      render_triggers: renderTriggers,
      inline_definitions: inlineDefinitions,
      expensive_computations: expensiveComputations,
      context_subscriptions: contextSubscriptions,
      children_analysis: childrenAnalysis,
      optimization_suggestions: optimizationSuggestions,
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during analysis';
    return createErrorResponse(message, { file: args.file });
  }
}
