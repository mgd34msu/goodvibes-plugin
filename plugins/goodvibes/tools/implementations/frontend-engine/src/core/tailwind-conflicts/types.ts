/**
 * Tailwind Conflicts Core Types
 *
 * All type definitions for Tailwind CSS conflict analysis,
 * including conflict types, detected issues, and analysis results.
 *
 * @module core/tailwind-conflicts/types
 */

// =============================================================================
// Conflict Types
// =============================================================================

/**
 * Conflict type classification
 */
export type ConflictType = 'override' | 'redundant' | 'contradiction';

/**
 * A detected class conflict
 */
export interface Conflict {
  /** Element identifier (tag name with line) */
  element: string;
  /** Line number in source */
  line: number;
  /** Classes involved in the conflict */
  classes: string[];
  /** Type of conflict */
  conflict_type: ConflictType;
  /** Human-readable explanation */
  explanation: string;
  /** Suggested fix */
  fix: string;
}

/**
 * A redundant class detection
 */
export interface RedundantClass {
  /** Element identifier */
  element: string;
  /** The redundant class */
  class: string;
  /** Reason why it's redundant */
  reason: string;
}

/**
 * A specificity/cascade issue
 */
export interface SpecificityIssue {
  /** Element identifier */
  element: string;
  /** Description of the issue */
  issue: string;
  /** What's overriding the expected behavior */
  overriding_source?: string;
  /** Suggested fix */
  fix: string;
}

/**
 * A suggested improvement
 */
export interface Suggestion {
  /** Element identifier */
  element: string;
  /** Current class string */
  current: string;
  /** Suggested replacement */
  suggested: string;
  /** Reason for the suggestion */
  reason: string;
}

/**
 * Internal element representation
 */
export interface ElementInfo {
  /** Element identifier */
  element: string;
  /** Line number */
  line: number;
  /** All CSS classes */
  classes: string[];
  /** Raw className string */
  rawClassName: string;
}

// =============================================================================
// Tool Arguments
// =============================================================================

/**
 * Arguments for the analyze_tailwind_conflicts tool
 */
export interface AnalyzeTailwindConflictsArgs {
  /** File path to analyze (relative to project root or absolute) */
  file: string;
  /** Check arbitrary values like [100px] (default true) */
  include_arbitrary?: boolean;
}
