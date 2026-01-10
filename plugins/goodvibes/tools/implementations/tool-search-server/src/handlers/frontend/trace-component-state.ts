/**
 * Trace Component State Handler
 *
 * Traces React state and props through component trees using TypeScript
 * AST analysis. Analyzes useState, useReducer, useRef, useContext, useEffect,
 * and other hooks. Detects common issues like prop drilling and callback
 * instability.
 *
 * @module handlers/frontend/trace-component-state
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

// =============================================================================
// Types
// =============================================================================

/**
 * Arguments for the trace_component_state tool
 */
export interface TraceComponentStateArgs {
  /** File path to analyze (relative to project root or absolute) */
  file: string;
  /** Analyze imported child components (default: false) */
  include_children?: boolean;
  /** How deep to trace child components (default: 2) */
  depth?: number;
}

/**
 * Local state information from hooks
 */
interface LocalStateInfo {
  name: string;
  type: string;
  hook: 'useState' | 'useReducer' | 'useRef';
  initial_value?: string;
  setter?: string;
  used_in_jsx: boolean;
  passed_to_children?: string[];
}

/**
 * Received prop information
 */
interface ReceivedProp {
  name: string;
  type?: string;
  required: boolean;
  default_value?: string;
}

/**
 * Props passed down to children
 */
interface PassedDownProp {
  prop_name: string;
  to_component: string;
  original_source: 'prop' | 'state' | 'derived' | 'context';
}

/**
 * Props analysis
 */
interface PropsAnalysis {
  received: ReceivedProp[];
  passed_down: PassedDownProp[];
}

/**
 * Consumed context information
 */
interface ConsumedContext {
  hook: string;
  context_name?: string;
  values_used: string[];
}

/**
 * Provided context information
 */
interface ProvidedContext {
  context_name: string;
  value_source: string;
}

/**
 * Context analysis
 */
interface ContextAnalysis {
  consumed: ConsumedContext[];
  provided: ProvidedContext[];
}

/**
 * Effect hook information
 */
interface EffectInfo {
  type: 'useEffect' | 'useLayoutEffect' | 'useMemo' | 'useCallback';
  dependencies: string[];
  has_cleanup: boolean;
}

/**
 * Issue detected in the component
 */
interface ComponentIssue {
  type: 'prop_drilling' | 'callback_instability' | 'missing_memo' | 'effect_deps' | 'state_in_render';
  severity: 'error' | 'warning' | 'info';
  location: string;
  description: string;
  suggestion: string;
}

/**
 * Result of tracing component state
 */
interface TraceComponentStateResult {
  component: string;
  file: string;
  local_state: LocalStateInfo[];
  props: PropsAnalysis;
  context: ContextAnalysis;
  effects: EffectInfo[];
  issues: ComponentIssue[];
}

/**
 * Tool response format
 */
interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
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

function resolveFilePath(filePath: string, projectRoot: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(projectRoot, filePath);
}

// =============================================================================
// AST Analysis Context
// =============================================================================

interface AnalysisContext {
  sourceFile: ts.SourceFile;
  projectRoot: string;
  stateVariables: Map<string, LocalStateInfo>;
  propNames: Set<string>;
  contextValues: Map<string, ConsumedContext>;
  jsxUsedIdentifiers: Set<string>;
  jsxPassedProps: PassedDownProp[];
  inlineCallbacks: Array<{ component: string; propName: string; line: number }>;
}

// =============================================================================
// Hook Analysis
// =============================================================================

/**
 * Extract the variable name from array destructuring
 */
function extractDestructuredNames(node: ts.Node, sourceFile: ts.SourceFile): [string, string | undefined] {
  // Look for: const [state, setState] = useState(...)
  if (ts.isVariableDeclaration(node.parent)) {
    const binding = node.parent.name;
    if (ts.isArrayBindingPattern(binding) && binding.elements.length >= 1) {
      const first = binding.elements[0];
      const second = binding.elements.length >= 2 ? binding.elements[1] : undefined;

      const firstName = ts.isBindingElement(first) && ts.isIdentifier(first.name)
        ? first.name.getText(sourceFile)
        : undefined;

      const secondName = second && ts.isBindingElement(second) && ts.isIdentifier(second.name)
        ? second.name.getText(sourceFile)
        : undefined;

      return [firstName ?? 'unknown', secondName];
    }
    // Simple assignment: const ref = useRef(...)
    if (ts.isIdentifier(binding)) {
      return [binding.getText(sourceFile), undefined];
    }
  }
  return ['unknown', undefined];
}

/**
 * Extract dependency array from hook call
 */
function extractDependencyArray(node: ts.Node | undefined, sourceFile: ts.SourceFile): string[] {
  if (!node) return [];

  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map(el => el.getText(sourceFile));
  }

  return [];
}

/**
 * Check if a function has a cleanup return
 */
function hasCleanupReturn(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  let hasCleanup = false;

  function visit(n: ts.Node): void {
    if (ts.isReturnStatement(n) && n.expression) {
      // Check if returning a function
      if (ts.isArrowFunction(n.expression) || ts.isFunctionExpression(n.expression)) {
        hasCleanup = true;
      }
    }
    if (!hasCleanup) {
      ts.forEachChild(n, visit);
    }
  }

  visit(node);
  return hasCleanup;
}

/**
 * Get the type string from a node
 */
function getTypeString(node: ts.Node | undefined, sourceFile: ts.SourceFile): string {
  if (!node) return 'unknown';

  if (ts.isTypeReferenceNode(node)) {
    return node.getText(sourceFile);
  }
  if (ts.isTypeLiteralNode(node)) {
    return node.getText(sourceFile);
  }
  if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) {
    return node.getText(sourceFile);
  }
  if (ts.isArrayTypeNode(node)) {
    return node.getText(sourceFile);
  }
  // Primitive types
  if (node.kind === ts.SyntaxKind.StringKeyword) return 'string';
  if (node.kind === ts.SyntaxKind.NumberKeyword) return 'number';
  if (node.kind === ts.SyntaxKind.BooleanKeyword) return 'boolean';

  return node.getText(sourceFile);
}

/**
 * Infer type from initial value
 */
function inferTypeFromValue(node: ts.Node | undefined, sourceFile: ts.SourceFile): string {
  if (!node) return 'unknown';

  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return 'string';
  if (ts.isNumericLiteral(node)) return 'number';
  if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) return 'boolean';
  if (ts.isArrayLiteralExpression(node)) {
    if (node.elements.length === 0) return 'unknown[]';
    const firstType = inferTypeFromValue(node.elements[0], sourceFile);
    return `${firstType}[]`;
  }
  if (ts.isObjectLiteralExpression(node)) return 'object';
  if (node.kind === ts.SyntaxKind.NullKeyword) return 'null';
  if (node.kind === ts.SyntaxKind.UndefinedKeyword) return 'undefined';
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return 'function';

  // For complex expressions, just return the text (truncated)
  const text = node.getText(sourceFile);
  return text.length > 50 ? text.slice(0, 47) + '...' : text;
}

/**
 * Extract all hook usages from a component
 */
function extractHooks(
  componentNode: ts.Node,
  ctx: AnalysisContext
): { states: LocalStateInfo[]; effects: EffectInfo[]; contexts: ConsumedContext[] } {
  const states: LocalStateInfo[] = [];
  const effects: EffectInfo[] = [];
  const contexts: ConsumedContext[] = [];
  const { sourceFile } = ctx;

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const fnText = node.expression.getText(sourceFile);
      const fnName = fnText.replace(/^React\./, '');

      // useState
      if (fnName === 'useState') {
        const [stateName, setterName] = extractDestructuredNames(node, sourceFile);
        const initialValue = node.arguments[0]?.getText(sourceFile);

        // Try to get type from generic: useState<Type>()
        let stateType = 'unknown';
        if (node.typeArguments && node.typeArguments.length > 0) {
          stateType = getTypeString(node.typeArguments[0], sourceFile);
        } else if (node.arguments[0]) {
          stateType = inferTypeFromValue(node.arguments[0], sourceFile);
        }

        const stateInfo: LocalStateInfo = {
          name: stateName,
          type: stateType,
          hook: 'useState',
          initial_value: initialValue,
          setter: setterName,
          used_in_jsx: false,
          passed_to_children: [],
        };

        states.push(stateInfo);
        ctx.stateVariables.set(stateName, stateInfo);
        if (setterName) {
          ctx.stateVariables.set(setterName, stateInfo);
        }
      }

      // useReducer
      if (fnName === 'useReducer') {
        const [stateName, dispatchName] = extractDestructuredNames(node, sourceFile);
        const initialState = node.arguments[1]?.getText(sourceFile);

        let stateType = 'unknown';
        if (node.typeArguments && node.typeArguments.length > 0) {
          stateType = getTypeString(node.typeArguments[0], sourceFile);
        }

        const stateInfo: LocalStateInfo = {
          name: stateName,
          type: stateType,
          hook: 'useReducer',
          initial_value: initialState,
          setter: dispatchName,
          used_in_jsx: false,
          passed_to_children: [],
        };

        states.push(stateInfo);
        ctx.stateVariables.set(stateName, stateInfo);
        if (dispatchName) {
          ctx.stateVariables.set(dispatchName, stateInfo);
        }
      }

      // useRef
      if (fnName === 'useRef') {
        const [refName] = extractDestructuredNames(node, sourceFile);
        const initialValue = node.arguments[0]?.getText(sourceFile);

        let refType = 'unknown';
        if (node.typeArguments && node.typeArguments.length > 0) {
          refType = getTypeString(node.typeArguments[0], sourceFile);
        } else if (node.arguments[0]) {
          refType = inferTypeFromValue(node.arguments[0], sourceFile);
        }

        const stateInfo: LocalStateInfo = {
          name: refName,
          type: refType,
          hook: 'useRef',
          initial_value: initialValue,
          used_in_jsx: false,
          passed_to_children: [],
        };

        states.push(stateInfo);
        ctx.stateVariables.set(refName, stateInfo);
      }

      // useContext
      if (fnName === 'useContext') {
        const contextArg = node.arguments[0]?.getText(sourceFile);
        const [valueName] = extractDestructuredNames(node, sourceFile);

        const contextInfo: ConsumedContext = {
          hook: 'useContext',
          context_name: contextArg,
          values_used: valueName !== 'unknown' ? [valueName] : [],
        };

        contexts.push(contextInfo);
        ctx.contextValues.set(valueName, contextInfo);
      }

      // Custom hooks starting with 'use'
      if (fnName.startsWith('use') && fnName[3]?.match(/[A-Z]/) &&
          !['useState', 'useReducer', 'useRef', 'useEffect', 'useLayoutEffect',
            'useMemo', 'useCallback', 'useContext', 'useImperativeHandle',
            'useDebugValue', 'useDeferredValue', 'useTransition', 'useId',
            'useSyncExternalStore', 'useInsertionEffect'].includes(fnName)) {
        // Custom context hook
        const [valueName] = extractDestructuredNames(node, sourceFile);
        const contextInfo: ConsumedContext = {
          hook: fnName,
          values_used: valueName !== 'unknown' ? [valueName] : [],
        };
        contexts.push(contextInfo);
        ctx.contextValues.set(valueName, contextInfo);
      }

      // useEffect / useLayoutEffect
      if (fnName === 'useEffect' || fnName === 'useLayoutEffect') {
        const callback = node.arguments[0];
        const depsArg = node.arguments[1];
        const deps = extractDependencyArray(depsArg, sourceFile);
        const hasCleanup = callback ? hasCleanupReturn(callback, sourceFile) : false;

        effects.push({
          type: fnName as 'useEffect' | 'useLayoutEffect',
          dependencies: deps,
          has_cleanup: hasCleanup,
        });
      }

      // useMemo / useCallback
      if (fnName === 'useMemo' || fnName === 'useCallback') {
        const depsArg = node.arguments[1];
        const deps = extractDependencyArray(depsArg, sourceFile);

        effects.push({
          type: fnName as 'useMemo' | 'useCallback',
          dependencies: deps,
          has_cleanup: false,
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(componentNode);
  return { states, effects, contexts };
}

// =============================================================================
// Props Analysis
// =============================================================================

/**
 * Extract props from component definition
 */
function extractReceivedProps(
  componentNode: ts.Node,
  ctx: AnalysisContext
): ReceivedProp[] {
  const props: ReceivedProp[] = [];
  const { sourceFile } = ctx;

  // Find the function parameters
  let params: ts.NodeArray<ts.ParameterDeclaration> | undefined;

  if (ts.isFunctionDeclaration(componentNode)) {
    params = componentNode.parameters;
  } else if (ts.isVariableStatement(componentNode)) {
    for (const decl of componentNode.declarationList.declarations) {
      if (decl.initializer) {
        if (ts.isArrowFunction(decl.initializer)) {
          params = decl.initializer.parameters;
        } else if (ts.isFunctionExpression(decl.initializer)) {
          params = decl.initializer.parameters;
        }
      }
    }
  }

  if (!params || params.length === 0) return props;

  const firstParam = params[0];

  // Destructured props: ({ prop1, prop2 = 'default' })
  if (ts.isObjectBindingPattern(firstParam.name)) {
    for (const element of firstParam.name.elements) {
      if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
        const propName = element.name.getText(sourceFile);
        const hasDefault = element.initializer !== undefined;
        const defaultValue = element.initializer?.getText(sourceFile);

        // Try to get type from prop type annotation
        let propType: string | undefined;
        if (firstParam.type && ts.isTypeLiteralNode(firstParam.type)) {
          for (const member of firstParam.type.members) {
            if (ts.isPropertySignature(member) && member.name?.getText(sourceFile) === propName) {
              propType = member.type ? getTypeString(member.type, sourceFile) : undefined;
            }
          }
        }

        props.push({
          name: propName,
          type: propType,
          required: !hasDefault && !element.dotDotDotToken,
          default_value: defaultValue,
        });

        ctx.propNames.add(propName);
      }
    }
  }

  // Also look for Props interface/type if referenced
  if (firstParam.type && ts.isTypeReferenceNode(firstParam.type)) {
    const typeName = firstParam.type.typeName.getText(sourceFile);
    extractPropsFromTypeDefinition(sourceFile, typeName, props, ctx);
  }

  return props;
}

/**
 * Extract props from interface or type definition
 */
function extractPropsFromTypeDefinition(
  sourceFile: ts.SourceFile,
  typeName: string,
  props: ReceivedProp[],
  ctx: AnalysisContext
): void {
  function visit(node: ts.Node): void {
    // Interface declaration
    if (ts.isInterfaceDeclaration(node) && node.name.getText(sourceFile) === typeName) {
      for (const member of node.members) {
        if (ts.isPropertySignature(member) && member.name) {
          const propName = member.name.getText(sourceFile);
          const isOptional = member.questionToken !== undefined;
          const propType = member.type ? getTypeString(member.type, sourceFile) : undefined;

          // Only add if not already present from destructuring
          if (!props.some(p => p.name === propName)) {
            props.push({
              name: propName,
              type: propType,
              required: !isOptional,
            });
          }

          ctx.propNames.add(propName);
        }
      }
    }

    // Type alias with object literal
    if (ts.isTypeAliasDeclaration(node) && node.name.getText(sourceFile) === typeName) {
      if (ts.isTypeLiteralNode(node.type)) {
        for (const member of node.type.members) {
          if (ts.isPropertySignature(member) && member.name) {
            const propName = member.name.getText(sourceFile);
            const isOptional = member.questionToken !== undefined;
            const propType = member.type ? getTypeString(member.type, sourceFile) : undefined;

            if (!props.some(p => p.name === propName)) {
              props.push({
                name: propName,
                type: propType,
                required: !isOptional,
              });
            }

            ctx.propNames.add(propName);
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

// =============================================================================
// JSX Analysis
// =============================================================================

/**
 * Analyze JSX to find:
 * 1. Which state/props are used in JSX
 * 2. Which props are passed to child components
 * 3. Inline callbacks that may cause instability
 */
function analyzeJsx(componentNode: ts.Node, ctx: AnalysisContext): void {
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

/**
 * Collect all identifiers used in an expression
 */
function collectUsedIdentifiers(node: ts.Node, sourceFile: ts.SourceFile, identifiers: Set<string>): void {
  if (ts.isIdentifier(node)) {
    identifiers.add(node.getText(sourceFile));
  }
  ts.forEachChild(node, child => collectUsedIdentifiers(child, sourceFile, identifiers));
}

// =============================================================================
// Context Provider Analysis
// =============================================================================

/**
 * Find context providers in the component
 */
function findProvidedContexts(componentNode: ts.Node, ctx: AnalysisContext): ProvidedContext[] {
  const provided: ProvidedContext[] = [];
  const { sourceFile } = ctx;

  function visit(node: ts.Node): void {
    // Look for <Context.Provider value={...}>
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile);

      if (tagName.endsWith('.Provider')) {
        const contextName = tagName.replace('.Provider', '');

        // Find the value prop
        for (const attr of node.attributes.properties) {
          if (ts.isJsxAttribute(attr) && attr.name?.getText(sourceFile) === 'value') {
            const valueSource = attr.initializer?.getText(sourceFile) ?? 'unknown';
            provided.push({
              context_name: contextName,
              value_source: valueSource.replace(/^\{|\}$/g, ''),
            });
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(componentNode);
  return provided;
}

// =============================================================================
// Issue Detection
// =============================================================================

/**
 * Detect common React issues in the component
 */
function detectIssues(
  componentNode: ts.Node,
  ctx: AnalysisContext,
  receivedProps: ReceivedProp[],
  passedDown: PassedDownProp[],
  effects: EffectInfo[]
): ComponentIssue[] {
  const issues: ComponentIssue[] = [];
  const { sourceFile, inlineCallbacks } = ctx;

  // 1. Prop drilling detection
  for (const passedProp of passedDown) {
    if (passedProp.original_source === 'prop') {
      const receivedProp = receivedProps.find(p => p.name === passedProp.prop_name);
      if (receivedProp) {
        issues.push({
          type: 'prop_drilling',
          severity: 'warning',
          location: `${passedProp.to_component}.${passedProp.prop_name}`,
          description: `Prop "${passedProp.prop_name}" is received and passed through unchanged to ${passedProp.to_component}`,
          suggestion: 'Consider using Context or a state management library to avoid prop drilling',
        });
      }
    }
  }

  // 2. Callback instability detection
  for (const callback of inlineCallbacks) {
    issues.push({
      type: 'callback_instability',
      severity: 'warning',
      location: `line ${callback.line}: ${callback.component}.${callback.propName}`,
      description: `Inline function passed to ${callback.component} as ${callback.propName} recreates on every render`,
      suggestion: 'Use useCallback to memoize the function, or extract to a stable reference',
    });
  }

  // 3. Missing memoization detection (large objects/arrays passed as props)
  for (const passedProp of passedDown) {
    if (passedProp.original_source === 'derived') {
      // Check if it's likely an object/array literal
      issues.push({
        type: 'missing_memo',
        severity: 'info',
        location: `${passedProp.to_component}.${passedProp.prop_name}`,
        description: `Derived value passed to ${passedProp.to_component} may recreate on every render`,
        suggestion: 'Consider using useMemo if this is an expensive computation',
      });
    }
  }

  // 4. Effect dependency issues
  for (const effect of effects) {
    if (effect.type === 'useEffect' || effect.type === 'useLayoutEffect') {
      // Missing dependency array
      if (effect.dependencies.length === 0) {
        // Check if it should have deps (not an empty deps array)
        const hasStateOrPropDeps = ctx.stateVariables.size > 0 || ctx.propNames.size > 0;
        if (hasStateOrPropDeps) {
          issues.push({
            type: 'effect_deps',
            severity: 'info',
            location: effect.type,
            description: `${effect.type} has no dependencies - verify this is intentional`,
            suggestion: 'Add dependencies if the effect uses props or state, or use [] for mount-only effects',
          });
        }
      }
    }
  }

  // 5. State initialization in render (useState with function call that's not lazy)
  function checkStateInRender(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const fnText = node.expression.getText(sourceFile);
      if (fnText === 'useState' || fnText === 'React.useState') {
        const initializer = node.arguments[0];
        if (initializer && ts.isCallExpression(initializer)) {
          // It's a function call, not a lazy initializer
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          issues.push({
            type: 'state_in_render',
            severity: 'error',
            location: `line ${line + 1}`,
            description: 'useState initializer calls a function on every render instead of using lazy initialization',
            suggestion: 'Use () => expensiveFunction() instead of expensiveFunction() for lazy initialization',
          });
        }
      }
    }
    ts.forEachChild(node, checkStateInRender);
  }

  checkStateInRender(componentNode);

  return issues;
}

// =============================================================================
// Component Detection
// =============================================================================

/**
 * Check if a node is a React component
 */
function isReactComponent(node: ts.Node, sourceFile: ts.SourceFile): boolean {
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
          if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
            return containsJsxReturn(decl.initializer);
          }
        }
      }
    }
  }

  return false;
}

/**
 * Check if a function body contains JSX return
 */
function containsJsxReturn(node: ts.Node): boolean {
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
 * Get component name from a node
 */
function getComponentName(node: ts.Node, sourceFile: ts.SourceFile): string | null {
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

// =============================================================================
// Main Handler
// =============================================================================

/**
 * Handles the trace_component_state MCP tool call.
 *
 * Traces React state and props through a component, analyzing:
 * - useState, useReducer, useRef hooks
 * - Props received and passed to children
 * - Context consumed and provided
 * - Effects and their dependencies
 * - Common issues (prop drilling, callback instability, etc.)
 *
 * @param args - The trace_component_state tool arguments
 * @returns MCP tool response with component state analysis
 */
export async function handleTraceComponentState(args: TraceComponentStateArgs): Promise<ToolResponse> {
  const projectRoot = process.cwd();
  const filePath = resolveFilePath(args.file, projectRoot);

  if (!fs.existsSync(filePath)) {
    return createErrorResponse(`File not found: ${args.file}`, { provided_path: args.file });
  }

  const ext = path.extname(filePath).toLowerCase();
  if (!['.tsx', '.jsx', '.ts', '.js'].includes(ext)) {
    return createErrorResponse(`File must be a React component file (.tsx, .jsx, .ts, .js)`, { file: args.file });
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      ext === '.tsx' ? ts.ScriptKind.TSX : ext === '.jsx' ? ts.ScriptKind.JSX : ts.ScriptKind.TS
    );

    // Find the first React component in the file
    let componentNode: ts.Node | null = null;
    let componentName: string | null = null;

    function findComponent(node: ts.Node): void {
      if (!componentNode && isReactComponent(node, sourceFile)) {
        componentNode = node;
        componentName = getComponentName(node, sourceFile);
      }
      if (!componentNode) {
        ts.forEachChild(node, findComponent);
      }
    }

    findComponent(sourceFile);

    if (!componentNode || !componentName) {
      return createErrorResponse(`No React component found in file`, { file: args.file });
    }

    // Create analysis context
    const ctx: AnalysisContext = {
      sourceFile,
      projectRoot,
      stateVariables: new Map(),
      propNames: new Set(),
      contextValues: new Map(),
      jsxUsedIdentifiers: new Set(),
      jsxPassedProps: [],
      inlineCallbacks: [],
    };

    // Run analysis
    const { states, effects, contexts } = extractHooks(componentNode, ctx);
    const receivedProps = extractReceivedProps(componentNode, ctx);
    analyzeJsx(componentNode, ctx);
    const providedContexts = findProvidedContexts(componentNode, ctx);

    // Mark which states are used in JSX
    for (const state of states) {
      if (ctx.jsxUsedIdentifiers.has(state.name) ||
          (state.setter && ctx.jsxUsedIdentifiers.has(state.setter))) {
        state.used_in_jsx = true;
      }

      // Find which children receive this state
      for (const passedProp of ctx.jsxPassedProps) {
        if (passedProp.original_source === 'state') {
          state.passed_to_children = state.passed_to_children || [];
          if (!state.passed_to_children.includes(passedProp.to_component)) {
            state.passed_to_children.push(passedProp.to_component);
          }
        }
      }
    }

    // Detect issues
    const issues = detectIssues(componentNode, ctx, receivedProps, ctx.jsxPassedProps, effects);

    const result: TraceComponentStateResult = {
      component: componentName,
      file: makeRelativePath(filePath, projectRoot),
      local_state: states,
      props: {
        received: receivedProps,
        passed_down: ctx.jsxPassedProps,
      },
      context: {
        consumed: contexts,
        provided: providedContexts,
      },
      effects,
      issues,
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during analysis';
    return createErrorResponse(message, { file: args.file });
  }
}
