/**
 * Hook Analyzer for React Components
 *
 * Extracts and analyzes React hooks (useState, useReducer, useRef, useContext, etc.).
 *
 * @module handlers/frontend/component-state/hook-analyzer
 */

import ts from 'typescript';
import type { LocalStateInfo, EffectInfo, ConsumedContext, AnalysisContext } from './types.js';
import {
  getTypeString,
  inferTypeFromValue,
  extractDestructuredNames,
  extractDependencyArray,
  hasCleanupReturn,
} from './utils.js';

/**
 * Extract all hook usages from a component
 */
/**
 * Check if a given AST node is imported or defined at the file level as a hook-like function.
 * Used to reduce false positives when detecting custom hooks.
 */
function isKnownHookOrImported(fnName: string, sourceFile: ts.SourceFile): boolean {
  // Walk top-level statements to find imports or function declarations named fnName
  for (const statement of sourceFile.statements) {
    // import { useFoo } from '...' or import useFoo from '...'
    if (ts.isImportDeclaration(statement) && statement.importClause) {
      const clause = statement.importClause;
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const specifier of clause.namedBindings.elements) {
          if (specifier.name.getText(sourceFile) === fnName) return true;
        }
      }
      if (clause.name && clause.name.getText(sourceFile) === fnName) return true;
    }
    // function useFoo() { ... } or const useFoo = () => { ... }
    if (ts.isFunctionDeclaration(statement) && statement.name?.getText(sourceFile) === fnName) return true;
    if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.getText(sourceFile) === fnName) return true;
      }
    }
  }
  return false;
}

export function extractHooks(
  componentNode: ts.Node,
  ctx: AnalysisContext
): { states: LocalStateInfo[]; effects: EffectInfo[]; contexts: ConsumedContext[] } {
  const states: LocalStateInfo[] = [];
  const effects: EffectInfo[] = [];
  const contexts: ConsumedContext[] = [];
  const { sourceFile } = ctx;

  // Track nesting depth inside callbacks/inner functions to enforce Rules of Hooks
  // (hooks must be called at the top level of the component, not inside nested functions)
  let nestedFunctionDepth = 0;

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
      // Guards:
      // 1. Must not be inside a nested function (Rules of Hooks: no hooks in callbacks/conditions)
      // 2. Must be imported or defined at file scope (reduces false positives from non-hook functions)
      if (fnName.startsWith('use') && fnName.length > 3 && fnName[3].match(/[A-Z]/) &&
          !['useState', 'useReducer', 'useRef', 'useEffect', 'useLayoutEffect',
            'useMemo', 'useCallback', 'useContext', 'useImperativeHandle',
            'useDebugValue', 'useDeferredValue', 'useTransition', 'useId',
            'useSyncExternalStore', 'useInsertionEffect'].includes(fnName) &&
          nestedFunctionDepth === 0 &&
          isKnownHookOrImported(fnName, sourceFile)) {
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

    // Track nested function scopes (arrow functions, function expressions, function declarations
    // that are NOT the component itself) to enforce Rules of Hooks
    const isNestedFunctionBoundary =
      node !== componentNode &&
      (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node));

    if (isNestedFunctionBoundary) {
      nestedFunctionDepth++;
      ts.forEachChild(node, visit);
      nestedFunctionDepth--;
    } else {
      ts.forEachChild(node, visit);
    }
  }

  visit(componentNode);
  return { states, effects, contexts };
}
