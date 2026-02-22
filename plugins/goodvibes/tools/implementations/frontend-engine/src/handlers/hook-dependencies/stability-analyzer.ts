/**
 * Stability Analyzer for Hook Dependencies
 *
 * Classifies each dependency in a hook's dependency array as
 * stable, unstable, or unknown based on how it was created.
 *
 * @module handlers/frontend/hook-dependencies/stability-analyzer
 */

import ts from 'typescript';
import type { DependencyInfo, DependencyStability, ComponentScope } from './types.js';

/** Unstable array/object methods that return new references */
const UNSTABLE_ARRAY_METHODS = new Set([
  'map',
  'filter',
  'reduce',
  'reduceRight',
  'sort',
  'flatMap',
  'flat',
  'slice',
  'concat',
  'entries',
  'values',
  'keys',
]);

/** Unstable Object static methods */
const UNSTABLE_OBJECT_METHODS = new Set(['keys', 'values', 'entries', 'assign', 'fromEntries']);

/**
 * Classify the stability of a single dependency expression.
 *
 * Checks the dep name against scope patterns:
 * - Setters/dispatch/refs/imports/module-scope = stable
 * - State objects, inline functions in component = unstable
 * - Custom hook returns, props = unknown
 */
export function classifyDependency(
  depText: string,
  scope: ComponentScope,
  sourceFile: ts.SourceFile
): { stability: DependencyStability; reason: string } {
  // Normalize: strip member access for simple checks (e.g., "ref.current" -> base is "ref")
  const base = depText.split('.')[0];

  // --- STABLE CHECKS ---

  // setState functions from useState
  if (scope.setterVars.has(base)) {
    return {
      stability: 'stable',
      reason: `setState function from useState — guaranteed stable by React`,
    };
  }

  // dispatch from useReducer
  if (scope.dispatchVars.has(base)) {
    return {
      stability: 'stable',
      reason: `dispatch from useReducer — guaranteed stable by React`,
    };
  }

  // useRef return value (the object itself, not .current)
  if (scope.refVars.has(base) && !depText.includes('.current')) {
    return {
      stability: 'stable',
      reason: `useRef() object — stable reference (note: .current is mutable but not tracked)`,
    };
  }

  // useCallback-wrapped functions
  if (scope.useCallbackVars.has(base)) {
    return {
      stability: 'stable',
      reason: `useCallback-wrapped function — stable across renders (when its own deps are stable)`,
    };
  }

  // useMemo result
  if (scope.useMemoVars.has(base)) {
    return {
      stability: 'stable',
      reason: `useMemo result — stable reference (memoized)`,
    };
  }

  // useId result
  if (scope.useIdVars.has(base)) {
    return {
      stability: 'stable',
      reason: `useId() result — stable string reference`,
    };
  }

  // Imported identifiers (functions, constants from other modules)
  if (scope.importedIdentifiers.has(base)) {
    return {
      stability: 'stable',
      reason: `Imported identifier — module-level reference, stable across renders`,
    };
  }

  // Module-scope declarations
  if (scope.moduleScopeIdentifiers.has(base)) {
    return {
      stability: 'stable',
      reason: `Module-scope declaration — defined outside component, stable`,
    };
  }

  // Primitive literals in dep arrays (unusual but stable)
  if (/^(true|false|null|undefined|\d+|'[^']*'|"[^"]*")$/.test(depText.trim())) {
    return {
      stability: 'stable',
      reason: `Primitive literal — always the same value`,
    };
  }

  // --- UNSTABLE CHECKS ---

  // Inline object literal
  if (depText.trim().startsWith('{')) {
    return {
      stability: 'unstable',
      reason: `Inline object literal — creates new reference every render`,
    };
  }

  // Inline array literal
  if (depText.trim().startsWith('[')) {
    return {
      stability: 'unstable',
      reason: `Inline array literal — creates new reference every render`,
    };
  }

  // Inline arrow function or function expression
  if (depText.includes('=>') || depText.trimStart().startsWith('function')) {
    return {
      stability: 'unstable',
      reason: `Inline function expression — creates new reference every render; wrap in useCallback`,
    };
  }

  // Array method chaining (e.g., items.map(...), list.filter(...))
  const arrayMethodMatch = depText.match(/\.([a-z]+)\s*\(/);
  if (arrayMethodMatch && UNSTABLE_ARRAY_METHODS.has(arrayMethodMatch[1])) {
    return {
      stability: 'unstable',
      reason: `${arrayMethodMatch[1]}() call returns a new array reference every render`,
    };
  }

  // Object.keys/values/entries
  const objectMethodMatch = depText.match(/^Object\.([a-z]+)\s*\(/);
  if (objectMethodMatch && UNSTABLE_OBJECT_METHODS.has(objectMethodMatch[1])) {
    return {
      stability: 'unstable',
      reason: `Object.${objectMethodMatch[1]}() returns a new array reference every render`,
    };
  }

  // Spread expression (would create new object/array)
  if (depText.includes('...')) {
    return {
      stability: 'unstable',
      reason: `Spread expression creates a new object/array reference every render`,
    };
  }

  // State variables (primitives are stable value-wise, but objects are unstable)
  if (scope.stateVars.has(base)) {
    // If it's the ref.current pattern
    if (depText.includes('.current')) {
      return {
        stability: 'unknown',
        reason: `ref.current value — .current is mutable and not tracked by React's dep system`,
      };
    }
    return {
      stability: 'unknown',
      reason: `State variable — stable for primitives, unstable for object/array state (new ref on each setState)`,
    };
  }

  // --- UNKNOWN ---

  // Props (unknown without knowing if parent memoizes)
  // If a dep has a member access on an unknown base, treat as unknown
  if (depText.includes('.')) {
    return {
      stability: 'unknown',
      reason: `Member access expression — stability depends on the source object's stability`,
    };
  }

  return {
    stability: 'unknown',
    reason: `Cannot determine statically — may be a prop, context value, or custom hook return`,
  };
}

/**
 * Analyze all dependencies for a hook and return classified DependencyInfo[].
 */
export function analyzeDependencies(
  rawDeps: string[],
  scope: ComponentScope,
  sourceFile: ts.SourceFile
): DependencyInfo[] {
  return rawDeps.map(dep => {
    const { stability, reason } = classifyDependency(dep, scope, sourceFile);
    return {
      name: dep,
      stability,
      reason,
    };
  });
}
