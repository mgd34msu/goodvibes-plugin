/**
 * Types for Audit Hook Dependencies
 *
 * @module core/hooks/types
 */

import type { ToolResponse } from '../../shared/response.js';
export type { ToolResponse };

/**
 * Arguments for the audit_hook_dependencies tool
 */
export interface AuditHookDependenciesArgs {
  /** File path to analyze (relative to project root or absolute) */
  file: string;
  /** Analyze a specific hook by variable name or line number (e.g., "myEffect" or "42") */
  hook?: string;
  /** Include stability classification for all deps (default: true) */
  include_stable_analysis?: boolean;
}

/**
 * Stability classification for a dependency
 */
export type DependencyStability = 'stable' | 'unstable' | 'unknown';

/**
 * Information about a single dependency in a hook's dep array
 */
export interface DependencyInfo {
  /** The dependency expression text */
  name: string;
  /** Stability classification */
  stability: DependencyStability;
  /** Human-readable reason for the stability classification */
  reason: string;
  /** Source line (1-indexed) where the dependency is defined/created */
  line?: number;
}

/**
 * Information about a hook with a dependency array
 */
export interface HookInfo {
  /** Hook function name (e.g., "useEffect", "useMemo") */
  name: string;
  /** Source line (1-indexed) of the hook call */
  line: number;
  /** Variable name the hook result is assigned to (if any) */
  variableName?: string;
  /** Analyzed dependencies from the dep array */
  deps: DependencyInfo[];
  /** Raw dep array entries (string of identifier/expression) */
  rawDeps: string[];
  /** Whether the dep array is explicitly empty [] (vs omitted) */
  hasEmptyDeps: boolean;
  /** Whether the dep array is omitted entirely */
  hasNoDeps: boolean;
  /**
   * Text of the callback body.
   * @internal — used by issue detection only, not serialized in final output
   */
  body: string;
  /** Identifiers referenced inside the hook body */
  bodyRefs: string[];
  /** Whether the effect callback returns a cleanup function */
  hasCleanup: boolean;
  /** Whether the body contains subscription/timer patterns */
  hasSubscriptions: boolean;
}

/**
 * An issue detected in a hook
 */
export interface HookIssue {
  /** Hook name (e.g., "useEffect") */
  hookName: string;
  /** Source line of the hook call */
  hookLine: number;
  /** Issue type identifier */
  type:
    | 'stale_closure'
    | 'missing_deps'
    | 'unnecessary_deps'
    | 'unstable_deps'
    | 'derived_state'
    | 'missing_cleanup';
  /** Severity level */
  severity: 'error' | 'warning' | 'info';
  /** Human-readable issue description */
  message: string;
  /** Actionable suggestion to fix the issue */
  suggestion: string;
  /** Specific values involved (e.g., the missing dep names) */
  details?: string[];
}

/**
 * Scope information about the component/function containing the hook
 */
export interface ComponentScope {
  /** State variable names (from useState/useReducer) */
  stateVars: Set<string>;
  /** Setter function names (from useState/useReducer) */
  setterVars: Set<string>;
  /** Dispatch function names (from useReducer) */
  dispatchVars: Set<string>;
  /** Ref variable names (from useRef) */
  refVars: Set<string>;
  /** Identifiers imported at the top of the file */
  importedIdentifiers: Set<string>;
  /** Identifiers defined at module scope (outside all functions) */
  moduleScopeIdentifiers: Set<string>;
  /** useCallback-wrapped function names */
  useCallbackVars: Set<string>;
  /** useMemo result variable names */
  useMemoVars: Set<string>;
  /** useId result variable names */
  useIdVars: Set<string>;
}

/**
 * Full audit result for a file
 */
export interface AuditResult {
  /** Analyzed file path (relative) */
  file: string;
  /** Component name (if detected) */
  component: string;
  /** All analyzed hooks */
  hooks: HookInfo[];
  /** All detected issues */
  issues: HookIssue[];
  /** Summary statistics */
  summary: {
    total_hooks: number;
    total_issues: number;
    by_severity: Record<string, number>;
    by_type: Record<string, number>;
  };
}
