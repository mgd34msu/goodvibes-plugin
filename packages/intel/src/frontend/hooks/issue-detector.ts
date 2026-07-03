/**
 * Issue detector for hook dependencies — Lane 4.
 * Ported verbatim from frontend-engine `core/hooks/issue-detector.ts`.
 *
 * @module frontend/hooks/issue-detector
 */

import type { HookInfo, HookIssue, ComponentScope, DependencyInfo } from './types.js';
import { GLOBAL_IDENTIFIERS } from './extractor.js';

const SET_STATE_PATTERN = /\bset[A-Z]\w*\s*\(/;

/** Detect stale closure: effect uses a state var but dep array is []. */
export function detectStaleClosure(hook: HookInfo, scope: ComponentScope): HookIssue[] {
  if (hook.name !== 'useEffect' && hook.name !== 'useLayoutEffect') {return [];}
  if (!hook.hasEmptyDeps) {return [];}

  const staleRefs: string[] = [];
  for (const ref of hook.bodyRefs) {
    if (scope.stateVars.has(ref)) {staleRefs.push(ref);}
  }
  if (staleRefs.length === 0) {return [];}

  return [{
    hookName: hook.name,
    hookLine: hook.line,
    type: 'stale_closure',
    severity: 'error',
    message: `${hook.name} has empty dep array [] but uses state variable(s) inside its body. These will be stale closures capturing only the initial values.`,
    suggestion: `Add [${staleRefs.join(', ')}] to the dependency array, or restructure to avoid reading state inside the effect.`,
    details: staleRefs,
  }];
}

/** Detect missing dependencies: identifiers referenced in body but not in deps and not provably stable. */
export function detectMissingDeps(
  hook: HookInfo,
  scope: ComponentScope,
  _analyzedDeps: DependencyInfo[],
): HookIssue[] {
  if (hook.hasNoDeps) {return [];}

  const depNames = new Set(hook.rawDeps.map((d) => d.trim()));
  const depBases = new Set(hook.rawDeps.map((d) => d.trim().split('.')[0]));

  const missing: string[] = [];
  for (const ref of hook.bodyRefs) {
    if (depNames.has(ref) || depBases.has(ref)) {continue;}
    if (
      scope.setterVars.has(ref) ||
      scope.dispatchVars.has(ref) ||
      scope.refVars.has(ref) ||
      scope.importedIdentifiers.has(ref) ||
      scope.moduleScopeIdentifiers.has(ref) ||
      scope.useCallbackVars.has(ref) ||
      scope.useIdVars.has(ref)
    ) {
      continue;
    }
    if (GLOBAL_IDENTIFIERS.has(ref)) {continue;}
    if (/^use[A-Z]/.test(ref)) {continue;}
    missing.push(ref);
  }

  if (missing.length === 0) {return [];}

  return [{
    hookName: hook.name,
    hookLine: hook.line,
    type: 'missing_deps',
    severity: 'warning',
    message: `${hook.name} references ${missing.map((m) => `"${m}"`).join(', ')} in its body but these are not in the dependency array.`,
    suggestion: `Add [${missing.join(', ')}] to the dependency array to prevent stale closure bugs.`,
    details: missing,
  }];
}

/** Detect unnecessary dependencies: deps not referenced in body. */
export function detectUnnecessaryDeps(hook: HookInfo): HookIssue[] {
  if (hook.hasNoDeps || hook.hasEmptyDeps) {return [];}

  const bodyRefSet = new Set(hook.bodyRefs);
  const unnecessary: string[] = [];
  for (const dep of hook.rawDeps) {
    const base = dep.trim().split('.')[0];
    if (!bodyRefSet.has(base)) {unnecessary.push(dep.trim());}
  }
  if (unnecessary.length === 0) {return [];}

  return [{
    hookName: hook.name,
    hookLine: hook.line,
    type: 'unnecessary_deps',
    severity: 'info',
    message: `${hook.name} includes ${unnecessary.map((u) => `"${u}"`).join(', ')} in the dependency array but these do not appear to be referenced in the callback body.`,
    suggestion: `Remove [${unnecessary.join(', ')}] from the dependency array to avoid unnecessary re-runs.`,
    details: unnecessary,
  }];
}

/** Detect unstable dependencies: deps classified 'unstable'. */
export function detectUnstableDeps(hook: HookInfo, analyzedDeps: DependencyInfo[]): HookIssue[] {
  const unstable = analyzedDeps.filter((d) => d.stability === 'unstable');
  if (unstable.length === 0) {return [];}

  return [{
    hookName: hook.name,
    hookLine: hook.line,
    type: 'unstable_deps',
    severity: 'warning',
    message: `${hook.name} dependency array includes unstable reference(s): ${unstable.map((d) => `"${d.name}"`).join(', ')}. These create a new reference on every render, causing the ${hook.name} to run on every render.`,
    suggestion: `Memoize unstable values with useMemo/useCallback before including them as dependencies, or restructure to avoid depending on new-every-render values.`,
    details: unstable.map((d) => `${d.name}: ${d.reason}`),
  }];
}

/** Detect derived-state anti-pattern: useEffect that only calls setState based on deps. */
export function detectDerivedState(hook: HookInfo): HookIssue[] {
  if (hook.name !== 'useEffect') {return [];}
  if (hook.hasCleanup || hook.hasSubscriptions) {return [];}
  if (!SET_STATE_PATTERN.test(hook.body)) {return [];}

  const bodyWithoutWhitespace = hook.body.replace(/\s+/g, ' ').trim();
  if (
    bodyWithoutWhitespace.includes('async') ||
    bodyWithoutWhitespace.includes('await') ||
    bodyWithoutWhitespace.includes('fetch') ||
    bodyWithoutWhitespace.includes('if (') ||
    bodyWithoutWhitespace.includes('if(') ||
    bodyWithoutWhitespace.includes('for (') ||
    bodyWithoutWhitespace.includes('while (') ||
    (bodyWithoutWhitespace.includes('?') && bodyWithoutWhitespace.includes(':'))
  ) {
    return [];
  }

  const setterCallCount = (hook.body.match(SET_STATE_PATTERN) || []).length;
  if (setterCallCount !== 1) {return [];}

  return [{
    hookName: hook.name,
    hookLine: hook.line,
    type: 'derived_state',
    severity: 'warning',
    message: `${hook.name} appears to compute derived state: it only calls a setter based on dependencies. This is an effect-as-derived-state anti-pattern that causes an extra render cycle.`,
    suggestion: `Replace this useEffect with a useMemo to compute the derived value directly, or compute it inline during render. Example: const derived = useMemo(() => compute(dep), [dep])`,
    details: [],
  }];
}

/** Detect missing cleanup: effect with subscriptions/timers but no cleanup return. */
export function detectMissingCleanup(hook: HookInfo): HookIssue[] {
  if (hook.name !== 'useEffect' && hook.name !== 'useLayoutEffect') {return [];}
  if (hook.hasCleanup) {return [];}
  if (!hook.hasSubscriptions) {return [];}

  return [{
    hookName: hook.name,
    hookLine: hook.line,
    type: 'missing_cleanup',
    severity: 'warning',
    message: `${hook.name} appears to set up subscriptions or timers but does not return a cleanup function. This can cause memory leaks when the component unmounts.`,
    suggestion: `Return a cleanup function from the effect: \`return () => { cleanup(); };\` Remove event listeners, clear timers, or unsubscribe on cleanup.`,
    details: [],
  }];
}

/** Run all issue detectors on a hook. */
export function detectAllIssues(hook: HookInfo, scope: ComponentScope): HookIssue[] {
  const issues: HookIssue[] = [];
  issues.push(...detectStaleClosure(hook, scope));
  issues.push(...detectMissingDeps(hook, scope, hook.deps));
  issues.push(...detectUnnecessaryDeps(hook));
  issues.push(...detectUnstableDeps(hook, hook.deps));
  issues.push(...detectDerivedState(hook));
  issues.push(...detectMissingCleanup(hook));
  return issues;
}
