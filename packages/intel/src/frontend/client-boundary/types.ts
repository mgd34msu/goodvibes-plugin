/**
 * Types for client_boundary — Lane 4.
 * Ported from frontend-engine `core/client-boundary/types.ts`; a `resolved_path`
 * echo is added to per-file entries (issue 1 fix #3), filled at the tool level.
 *
 * @module frontend/client-boundary/types
 */

export type Classification = 'server' | 'client' | 'client-inherited' | 'ambiguous';
export type IssueSeverity = 'error' | 'warning' | 'info';
export type IssueType =
  | 'unnecessary_client'
  | 'missing_directive'
  | 'large_client_subtree'
  | 'server_only_in_client'
  | 'boundary_optimization';

/** Classification result for a single component/file. */
export interface ComponentClassification {
  file: string;
  /** Absolute resolved path (issue 1 fix #3), filled at the tool level. */
  resolved_path?: string;
  classification: Classification;
  reason: string;
  directive?: '"use client"' | '"use server"';
}

/** A detected boundary issue. */
export interface ClientBoundaryIssue {
  type: IssueType;
  severity: IssueSeverity;
  file: string;
  message: string;
  suggestion?: string;
}

/** Summary of boundary statistics. */
export interface BoundarySummary {
  total: number;
  server: number;
  client: number;
  clientInherited: number;
  ambiguous: number;
  note?: string;
}

/** A client boundary entry point with its subtree size. */
export interface BoundaryEntry {
  file: string;
  resolved_path?: string;
  childCount: number;
}

/** Complete result from client_boundary. */
export interface ClientBoundaryResult {
  scanned_path: string;
  resolved_path: string;
  components: ComponentClassification[];
  issues: ClientBoundaryIssue[];
  summary: BoundarySummary;
  boundaries: BoundaryEntry[];
}

/** Internal: directive info per file. */
export interface FileDirectiveInfo {
  file: string;
  directive: '"use client"' | '"use server"' | null;
  hasClientAPIs: boolean;
  hasServerOnlyImports: boolean;
}

/** Internal: import graph adjacency list (relative file → resolved relative imports). */
export type ImportGraph = Map<string, string[]>;
