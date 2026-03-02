/**
 * Types for Analyze Error Boundaries
 *
 * @module core/error-boundaries/types
 */

/**
 * Arguments for the analyze_error_boundaries tool
 */
export interface AnalyzeErrorBoundariesArgs {
  /** Root directory of the React/Next.js project */
  project_path: string;
  /** Optional entry file to start analysis from */
  entry?: string;
  /** Include detection of library error boundaries (react-error-boundary, etc.) (default: true) */
  include_library_boundaries?: boolean;
}

/**
 * Classification of error boundary detection source
 */
export type BoundaryKind =
  | 'class_component'        // Class component with getDerivedStateFromError / componentDidCatch
  | 'react_error_boundary'   // ErrorBoundary from react-error-boundary package
  | 'library_wrapper'        // Other library wrappers (Sentry, etc.)
  | 'nextjs_error_file';     // error.tsx / error.js in Next.js App Router segment

/**
 * Issue severity
 */
export type IssueSeverity = 'error' | 'warning' | 'info';

/**
 * Issue type identifiers
 */
export type IssueType =
  | 'unprotected_route'
  | 'missing_error_file'
  | 'missing_fallback'
  | 'overly_broad_boundary'
  | 'async_without_boundary'
  | 'missing_reset';

/**
 * A detected error boundary component
 */
export interface ErrorBoundaryInfo {
  /** Relative file path */
  file: string;
  /** Component name */
  name: string;
  /** How the boundary was detected */
  kind: BoundaryKind;
  /** Whether a fallback UI prop or render is present */
  hasFallback: boolean;
  /** Whether a reset / retry mechanism is present */
  hasReset: boolean;
  /** Line number where the boundary is defined (1-indexed) */
  line: number;
}

/**
 * A route segment in the Next.js App Router
 */
export interface RouteSegment {
  /** Relative path to the segment directory */
  segmentPath: string;
  /** Whether a layout.tsx / layout.js exists in this segment */
  hasLayout: boolean;
  /** Whether a page.tsx / page.js exists in this segment */
  hasPage: boolean;
  /** Whether an error.tsx / error.js exists in this segment */
  hasErrorFile: boolean;
  /** Whether the segment or a parent has an error boundary wrapping it */
  isProtected: boolean;
}

/**
 * Coverage result for a component subtree
 */
export interface CoverageResult {
  /** Relative file path of the component */
  file: string;
  /** Whether the component is within an error boundary's subtree */
  isProtected: boolean;
  /** The error boundary protecting this component, if any */
  protectedBy?: string;
}

/**
 * A detected coverage issue
 */
export interface ErrorBoundaryIssue {
  /** Issue category */
  type: IssueType;
  /** Severity level */
  severity: IssueSeverity;
  /** File or path where the issue was found */
  file: string;
  /** Human-readable issue description */
  message: string;
  /** Actionable fix suggestion */
  suggestion: string;
}

/**
 * Summary statistics
 */
export interface ErrorBoundarySummary {
  /** Total error boundaries detected */
  total_boundaries: number;
  /** Total route segments analyzed (Next.js only) */
  total_route_segments: number;
  /** Segments with error file coverage */
  protected_segments: number;
  /** Segments without any error boundary coverage */
  unprotected_segments: number;
  /** Total issues detected */
  total_issues: number;
  /** Issues broken down by severity */
  by_severity: Record<string, number>;
  /** Issues broken down by type */
  by_type: Record<string, number>;
  /** Whether the project appears to be a Next.js App Router project */
  is_nextjs_app_router: boolean;
}

/**
 * Complete result from analyze_error_boundaries
 */
export interface ErrorBoundaryResult {
  /** Scanned project path */
  project_path: string;
  /** All detected error boundary components */
  boundaries: ErrorBoundaryInfo[];
  /** Route segment coverage (Next.js App Router only) */
  route_segments: RouteSegment[];
  /** Coverage results per scanned file */
  coverage: CoverageResult[];
  /** Detected issues */
  issues: ErrorBoundaryIssue[];
  /** Summary statistics */
  summary: ErrorBoundarySummary;
}
