/**
 * Types for Analyze Client Boundary
 *
 * @module core/client-boundary/types
 */

/**
 * Arguments for the analyze_client_boundary tool
 */
export interface AnalyzeClientBoundaryArgs {
  /** Directory to scan (default: "app" or "src") */
  path?: string;
  /** Specific entry file to trace from */
  entry?: string;
}

/**
 * Classification of a component's rendering context
 */
export type Classification = 'server' | 'client' | 'client-inherited' | 'ambiguous';

/**
 * Issue severity
 */
export type IssueSeverity = 'error' | 'warning' | 'info';

/**
 * Issue type identifiers
 */
export type IssueType =
  | 'unnecessary_client'
  | 'missing_directive'
  | 'large_client_subtree'
  | 'server_only_in_client'
  | 'boundary_optimization';

/**
 * Classification result for a single component/file
 */
export interface ComponentClassification {
  /** Relative file path */
  file: string;
  /** Rendering context classification */
  classification: Classification;
  /** Human-readable explanation */
  reason: string;
  /** The directive found at the top of the file, if any */
  directive?: '"use client"' | '"use server"';
}

/**
 * A detected boundary issue
 */
export interface ClientBoundaryIssue {
  /** Issue category */
  type: IssueType;
  /** Severity level */
  severity: IssueSeverity;
  /** File where the issue was found */
  file: string;
  /** Human-readable issue description */
  message: string;
  /** Optional fix suggestion */
  suggestion?: string;
}

/**
 * Summary of boundary statistics
 */
export interface BoundarySummary {
  /** Total files analyzed */
  total: number;
  /** Files classified as server */
  server: number;
  /** Files with explicit "use client" directive */
  client: number;
  /** Files classified as client-inherited */
  clientInherited: number;
  /** Files that could not be classified */
  ambiguous: number;
  /** Optional informational note about the scan result */
  note?: string;
}

/**
 * A client boundary entry point with its subtree size
 */
export interface BoundaryEntry {
  /** The file that has "use client" directive */
  file: string;
  /** Number of files pulled into client bundle by this boundary */
  childCount: number;
}

/**
 * Complete result from analyze_client_boundary
 */
export interface ClientBoundaryResult {
  /** Path that was scanned */
  scanned_path: string;
  /** Classification for each component/file */
  components: ComponentClassification[];
  /** Detected issues */
  issues: ClientBoundaryIssue[];
  /** Summary statistics */
  summary: BoundarySummary;
  /** Client boundary entry points with subtree sizes */
  boundaries: BoundaryEntry[];
}

/**
 * Internal: directive info per file
 */
export interface FileDirectiveInfo {
  file: string;
  directive: '"use client"' | '"use server"' | null;
  hasClientAPIs: boolean;
  hasServerOnlyImports: boolean;
}

/**
 * Internal: import graph adjacency list
 * Maps file path -> array of imported file paths (resolved)
 */
export type ImportGraph = Map<string, string[]>;
