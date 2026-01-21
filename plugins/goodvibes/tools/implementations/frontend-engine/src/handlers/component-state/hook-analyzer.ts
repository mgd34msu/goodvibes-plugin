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
export function extractHooks(
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
