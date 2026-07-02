/**
 * Stability analyzer for hook dependencies — Lane 4.
 * Ported verbatim from frontend-engine `core/hooks/stability-analyzer.ts`.
 *
 * @module frontend/hooks/stability-analyzer
 */

import ts from 'typescript';
import type { DependencyInfo, DependencyStability, ComponentScope } from './types.js';

const UNSTABLE_ARRAY_METHODS = new Set([
  'map', 'filter', 'reduce', 'reduceRight', 'sort', 'flatMap', 'flat',
  'slice', 'concat', 'entries', 'values', 'keys',
]);

const UNSTABLE_OBJECT_METHODS = new Set(['keys', 'values', 'entries', 'assign', 'fromEntries']);

/** Classify the stability of a single dependency expression. */
export function classifyDependency(
  depText: string,
  scope: ComponentScope,
  _sourceFile: ts.SourceFile,
): { stability: DependencyStability; reason: string } {
  const base = depText.split('.')[0];

  if (scope.setterVars.has(base)) {
    return { stability: 'stable', reason: 'setState function from useState — guaranteed stable by React' };
  }
  if (scope.dispatchVars.has(base)) {
    return { stability: 'stable', reason: 'dispatch from useReducer — guaranteed stable by React' };
  }
  if (scope.refVars.has(base) && !depText.includes('.current')) {
    return { stability: 'stable', reason: 'useRef() object — stable reference (note: .current is mutable but not tracked)' };
  }
  if (scope.useCallbackVars.has(base)) {
    return { stability: 'stable', reason: 'useCallback-wrapped function — stable across renders (when its own deps are stable)' };
  }
  if (scope.useMemoVars.has(base)) {
    return { stability: 'stable', reason: 'useMemo result — stable reference (memoized)' };
  }
  if (scope.useIdVars.has(base)) {
    return { stability: 'stable', reason: 'useId() result — stable string reference' };
  }
  if (scope.importedIdentifiers.has(base)) {
    return { stability: 'stable', reason: 'Imported identifier — module-level reference, stable across renders' };
  }
  if (scope.moduleScopeIdentifiers.has(base)) {
    return { stability: 'stable', reason: 'Module-scope declaration — defined outside component, stable' };
  }
  if (/^(true|false|null|undefined|\d+|'[^']*'|"[^"]*")$/.test(depText.trim())) {
    return { stability: 'stable', reason: 'Primitive literal — always the same value' };
  }

  if (depText.trim().startsWith('{')) {
    return { stability: 'unstable', reason: 'Inline object literal — creates new reference every render' };
  }
  if (depText.trim().startsWith('[')) {
    return { stability: 'unstable', reason: 'Inline array literal — creates new reference every render' };
  }
  if (depText.includes('=>') || depText.trimStart().startsWith('function')) {
    return { stability: 'unstable', reason: 'Inline function expression — creates new reference every render; wrap in useCallback' };
  }

  const arrayMethodMatch = depText.match(/\.([a-z]+)\s*\(/);
  if (arrayMethodMatch && UNSTABLE_ARRAY_METHODS.has(arrayMethodMatch[1])) {
    return { stability: 'unstable', reason: `${arrayMethodMatch[1]}() call returns a new array reference every render` };
  }

  const objectMethodMatch = depText.match(/^Object\.([a-z]+)\s*\(/);
  if (objectMethodMatch && UNSTABLE_OBJECT_METHODS.has(objectMethodMatch[1])) {
    return { stability: 'unstable', reason: `Object.${objectMethodMatch[1]}() returns a new array reference every render` };
  }

  if (depText.includes('...')) {
    return { stability: 'unstable', reason: 'Spread expression creates a new object/array reference every render' };
  }

  if (scope.stateVars.has(base)) {
    if (depText.includes('.current')) {
      return { stability: 'unknown', reason: "ref.current value — .current is mutable and not tracked by React's dep system" };
    }
    return { stability: 'unknown', reason: 'State variable — stable for primitives, unstable for object/array state (new ref on each setState)' };
  }

  if (depText.includes('.')) {
    return { stability: 'unknown', reason: "Member access expression — stability depends on the source object's stability" };
  }

  return { stability: 'unknown', reason: 'Cannot determine statically — may be a prop, context value, or custom hook return' };
}

/** Analyze all dependencies for a hook and return classified DependencyInfo[]. */
export function analyzeDependencies(
  rawDeps: string[],
  scope: ComponentScope,
  sourceFile: ts.SourceFile,
): DependencyInfo[] {
  return rawDeps.map((dep) => {
    const { stability, reason } = classifyDependency(dep, scope, sourceFile);
    return { name: dep, stability, reason };
  });
}
