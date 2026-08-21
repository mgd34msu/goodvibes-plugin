/**
 * Types for hook_dependencies, Lane 4.
 * Ported from frontend-engine `core/hooks/types.ts` (v1 quarry); the
 * `ToolResponse` re-export is dropped (v2 uses `core/envelope`).
 *
 * @module frontend/hooks/types
 */

/** Arguments for the hook_dependencies tool. */
export interface AuditHookDependenciesArgs {
  /** File path to analyze (relative to base_path or absolute). */
  file: string;
  /** Analyze a specific hook by variable name or line number. */
  hook?: string;
  /** Include stability classification for all deps (default: true). */
  include_stable_analysis?: boolean;
}

/** Stability classification for a dependency. */
export type DependencyStability = 'stable' | 'unstable' | 'unknown';

/** Information about a single dependency in a hook's dep array. */
export interface DependencyInfo {
  /** The dependency expression text. */
  name: string;
  /** Stability classification. */
  stability: DependencyStability;
  /** Human-readable reason for the stability classification. */
  reason: string;
  /** Source line (1-indexed) where the dependency is defined/created. */
  line?: number;
}

/** Information about a hook with a dependency array. */
export interface HookInfo {
  /** Hook function name (e.g., "useEffect", "useMemo"). */
  name: string;
  /** Source line (1-indexed) of the hook call. */
  line: number;
  /** Variable name the hook result is assigned to (if any). */
  variableName?: string;
  /** Analyzed dependencies from the dep array. */
  deps: DependencyInfo[];
  /** Raw dep array entries. */
  rawDeps: string[];
  /** Whether the dep array is explicitly empty []. */
  hasEmptyDeps: boolean;
  /** Whether the dep array is omitted entirely. */
  hasNoDeps: boolean;
  /** Text of the callback body (used by issue detection; not serialized). */
  body: string;
  /** Identifiers referenced inside the hook body. */
  bodyRefs: string[];
  /** Whether the effect callback returns a cleanup function. */
  hasCleanup: boolean;
  /** Whether the body contains subscription/timer patterns. */
  hasSubscriptions: boolean;
}

/** An issue detected in a hook. */
export interface HookIssue {
  hookName: string;
  hookLine: number;
  type:
    | 'stale_closure'
    | 'missing_deps'
    | 'unnecessary_deps'
    | 'unstable_deps'
    | 'derived_state'
    | 'missing_cleanup';
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestion: string;
  details?: string[];
}

/** Scope information about the component/function containing the hook. */
export interface ComponentScope {
  stateVars: Set<string>;
  setterVars: Set<string>;
  dispatchVars: Set<string>;
  refVars: Set<string>;
  importedIdentifiers: Set<string>;
  moduleScopeIdentifiers: Set<string>;
  useCallbackVars: Set<string>;
  useMemoVars: Set<string>;
  useIdVars: Set<string>;
}

/** Full audit result for a file. */
export interface AuditResult {
  file: string;
  /** Absolute resolved path echoed for every response (issue 1 fix #3). */
  resolved_path: string;
  component: string;
  hooks: HookInfo[];
  issues: HookIssue[];
  summary: {
    total_hooks: number;
    total_issues: number;
    by_severity: Record<string, number>;
    by_type: Record<string, number>;
  };
}
