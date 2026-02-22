/**
 * Issue Detector for Hook Dependencies
 *
 * Detects anti-patterns in React hook dependency arrays:
 * - Stale closures
 * - Missing/unnecessary dependencies
 * - Unstable dependencies
 * - Effect as derived state
 * - Missing cleanup
 *
 * @module handlers/frontend/hook-dependencies/issue-detector
 */

import type { HookInfo, HookIssue, ComponentScope, DependencyInfo } from './types.js';

/**
 * setState/dispatch keyword patterns that, when seen in body, indicate
 * the effect is setting state based on deps (derived-state anti-pattern).
 */
const SET_STATE_PATTERN = /\bset[A-Z]\w*\s*\(/;

/**
 * Detect stale closure: effect uses a state/prop variable but dep array is []
 *
 * Heuristic: if deps is explicitly empty AND bodyRefs includes a known state var,
 * that state var is captured in a stale closure.
 */
export function detectStaleClosure(
  hook: HookInfo,
  scope: ComponentScope
): HookIssue[] {
  // Only applies to effects (not useMemo/useCallback where empty deps means run-once by design)
  if (hook.name !== 'useEffect' && hook.name !== 'useLayoutEffect' && hook.name !== 'useInsertionEffect') {
    return [];
  }

  if (!hook.hasEmptyDeps) return [];

  const staleRefs: string[] = [];

  for (const ref of hook.bodyRefs) {
    if (scope.stateVars.has(ref) || scope.setterVars.has(ref) || scope.dispatchVars.has(ref)) {
      // Setters and dispatch are stable, only flag actual state values
      if (scope.stateVars.has(ref)) {
        staleRefs.push(ref);
      }
    }
  }

  if (staleRefs.length === 0) return [];

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

/**
 * Detect missing dependencies: identifiers referenced in body but not in dep array
 * and not provably stable.
 */
export function detectMissingDeps(
  hook: HookInfo,
  scope: ComponentScope,
  analyzedDeps: DependencyInfo[]
): HookIssue[] {
  // Only applies to hooks with an explicit dep array (even empty)
  // If no dep array at all, different issue
  if (hook.hasNoDeps) return [];

  const depNames = new Set(hook.rawDeps.map(d => d.trim()));
  // Also track base names for member access deps (e.g., "obj.prop" registers "obj")
  const depBases = new Set(
    hook.rawDeps.map(d => d.trim().split('.')[0])
  );

  const missing: string[] = [];

  for (const ref of hook.bodyRefs) {
    // Skip if already in dep array
    if (depNames.has(ref) || depBases.has(ref)) continue;

    // Skip if stable (setters, dispatch, refs objects, imports, module-scope)
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

    // Skip common globals and React hooks themselves
    if (
      ref === 'React' ||
      ref === 'console' ||
      ref === 'window' ||
      ref === 'document' ||
      ref === 'navigator' ||
      ref === 'location' ||
      ref === 'performance' ||
      ref === 'localStorage' ||
      ref === 'sessionStorage' ||
      ref === 'fetch' ||
      ref === 'AbortController' ||
      ref === 'URL' ||
      ref === 'URLSearchParams'
    ) {
      continue;
    }

    // Skip hook names themselves (useEffect etc. referenced by name)
    if (/^use[A-Z]/.test(ref)) continue;

    // This ref is potentially missing
    if (
      scope.stateVars.has(ref) ||
      scope.useMemoVars.has(ref)
    ) {
      // State or memoized values that are referenced but not in deps
      missing.push(ref);
    }
  }

  if (missing.length === 0) return [];

  return [{
    hookName: hook.name,
    hookLine: hook.line,
    type: 'missing_deps',
    severity: 'warning',
    message: `${hook.name} references ${missing.map(m => `"${m}"`).join(', ')} in its body but these are not in the dependency array.`,
    suggestion: `Add [${missing.join(', ')}] to the dependency array to prevent stale closure bugs.`,
    details: missing,
  }];
}

/**
 * Detect unnecessary dependencies: dep array has identifiers not referenced in body.
 */
export function detectUnnecessaryDeps(
  hook: HookInfo
): HookIssue[] {
  if (hook.hasNoDeps || hook.hasEmptyDeps) return [];

  const bodyRefSet = new Set(hook.bodyRefs);
  const unnecessary: string[] = [];

  for (const dep of hook.rawDeps) {
    const base = dep.trim().split('.')[0];
    // Check if the base name appears anywhere in the body
    if (!bodyRefSet.has(base)) {
      unnecessary.push(dep.trim());
    }
  }

  if (unnecessary.length === 0) return [];

  return [{
    hookName: hook.name,
    hookLine: hook.line,
    type: 'unnecessary_deps',
    severity: 'info',
    message: `${hook.name} includes ${unnecessary.map(u => `"${u}"`).join(', ')} in the dependency array but these do not appear to be referenced in the callback body.`,
    suggestion: `Remove [${unnecessary.join(', ')}] from the dependency array to avoid unnecessary re-runs.`,
    details: unnecessary,
  }];
}

/**
 * Detect unstable dependencies: dep array contains values with 'unstable' stability.
 */
export function detectUnstableDeps(
  hook: HookInfo,
  analyzedDeps: DependencyInfo[]
): HookIssue[] {
  const unstable = analyzedDeps.filter(d => d.stability === 'unstable');
  if (unstable.length === 0) return [];

  return [{
    hookName: hook.name,
    hookLine: hook.line,
    type: 'unstable_deps',
    severity: 'warning',
    message: `${hook.name} dependency array includes unstable reference(s): ${unstable.map(d => `"${d.name}"`).join(', ')}. These create a new reference on every render, causing the ${hook.name} to run on every render.`,
    suggestion: `Memoize unstable values with useMemo/useCallback before including them as dependencies, or restructure to avoid depending on new-every-render values.`,
    details: unstable.map(d => `${d.name}: ${d.reason}`),
  }];
}

/**
 * Detect derived state anti-pattern:
 * Effect that only calls setState based on deps — should use useMemo or direct computation.
 *
 * Heuristic: useEffect body only calls setX(...) and references a dep.
 */
export function detectDerivedState(
  hook: HookInfo
): HookIssue[] {
  if (hook.name !== 'useEffect') return [];
  if (hook.hasCleanup || hook.hasSubscriptions) return [];

  // Body should contain a setState call
  if (!SET_STATE_PATTERN.test(hook.body)) return [];

  // Body should be simple: primarily just a setState call with dep-based computation
  // Heuristic: short body, only setState pattern, no async operations, no side effects
  const bodyWithoutWhitespace = hook.body.replace(/\s+/g, ' ').trim();

  // Skip complex effects (async, conditional, multiple statements)
  if (
    bodyWithoutWhitespace.includes('async') ||
    bodyWithoutWhitespace.includes('await') ||
    bodyWithoutWhitespace.includes('fetch') ||
    bodyWithoutWhitespace.includes('if (') ||
    bodyWithoutWhitespace.includes('if(') ||
    bodyWithoutWhitespace.includes('for (') ||
    bodyWithoutWhitespace.includes('while (')
  ) {
    return [];
  }

  // Count top-level statements in body — if it's just one setState call, flag it
  const setterCallCount = (hook.body.match(SET_STATE_PATTERN) || []).length;
  if (setterCallCount !== 1) return [];

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

/**
 * Detect missing cleanup: effect with subscriptions/timers but no cleanup return.
 */
export function detectMissingCleanup(
  hook: HookInfo
): HookIssue[] {
  // Only for effects, not memo/callback
  if (hook.name !== 'useEffect' && hook.name !== 'useLayoutEffect') return [];
  if (hook.hasCleanup) return [];
  if (!hook.hasSubscriptions) return [];

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

/**
 * Run all issue detectors on a hook and return all found issues.
 */
export function detectAllIssues(
  hook: HookInfo,
  scope: ComponentScope
): HookIssue[] {
  const issues: HookIssue[] = [];

  issues.push(...detectStaleClosure(hook, scope));
  issues.push(...detectMissingDeps(hook, scope, hook.deps));
  issues.push(...detectUnnecessaryDeps(hook));
  issues.push(...detectUnstableDeps(hook, hook.deps));
  issues.push(...detectDerivedState(hook));
  issues.push(...detectMissingCleanup(hook));

  return issues;
}
