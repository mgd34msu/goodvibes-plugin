/**
 * discover Tool interfaces for Batch Engine
 * @see SPEC-v2 Section 13.2
 */

// =============================================================================
// SECTION 13.2: Discovery Query Types
// =============================================================================

/**
 * Discovery query type discriminator
 */
export type DiscoveryQueryType = 'grep' | 'glob' | 'symbols';

/**
 * Output modes for discovery - controls verbosity and token usage
 * - count_only: Just counts (minimal tokens)
 * - files_only: List of file paths
 * - locations: File paths with line/column info
 * - minimal: Compact representation
 */
export type DiscoveryOutputMode = 'count_only' | 'files_only' | 'locations' | 'minimal';

// =============================================================================
// SECTION 13.2: Discovery Query Interfaces
// =============================================================================

/**
 * Base discovery query - all queries extend this
 */
export interface DiscoveryQuery {
  /** Unique identifier for this query (used to key results) */
  id: string;
  /** Query type discriminator */
  type: DiscoveryQueryType;
  /** Output mode override for this specific query */
  output_mode?: DiscoveryOutputMode;
}

/**
 * Grep query for text pattern search
 * Uses precision_grep internally
 */
export interface GrepQuery extends DiscoveryQuery {
  type: 'grep';
  /** Regex pattern to search for */
  pattern: string;
  /** Paths to search (default: project root) */
  paths?: string[];
  /** Glob patterns to include in search */
  include?: string[];
  /** Glob patterns to exclude from search */
  exclude?: string[];
  /** Lines of context to include around matches */
  context?: number;
  /** Case-sensitive search (default: true) */
  case_sensitive?: boolean;
  /** Maximum matches to return */
  max_matches?: number;
}

/**
 * Glob query for file finding
 * Uses precision_glob internally
 */
export interface GlobQuery extends DiscoveryQuery {
  type: 'glob';
  /** Glob patterns to match files against */
  patterns: string[];
  /** Base paths to search from */
  paths?: string[];
  /** Include hidden files/directories */
  include_hidden?: boolean;
  /** Respect .gitignore rules (default: true) */
  gitignore?: boolean;
  /** Maximum files to return */
  max_files?: number;
}

/**
 * Symbol query for code symbol search
 * Uses precision_symbols internally
 */
export interface SymbolQuery extends DiscoveryQuery {
  type: 'symbols';
  /** Symbol name pattern to search for */
  query?: string;
  /** Symbol kinds to find (function, class, interface, etc.) */
  kinds?: string[];
  /** Specific files to search within */
  files?: string[];
  /** Only return exported symbols */
  exported_only?: boolean;
}

/**
 * Union type for all discovery query types
 */
export type AnyDiscoveryQuery = GrepQuery | GlobQuery | SymbolQuery;

// =============================================================================
// SECTION 13.2: Discovery Result Interfaces
// =============================================================================

/**
 * Single grep match with location and optional context
 */
export interface GrepMatch {
  /** File path containing the match */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based, optional) */
  column?: number;
  /** Matched line content (when output mode includes content) */
  content?: string;
  /** Lines before the match (when context requested) */
  context_before?: string[];
  /** Lines after the match (when context requested) */
  context_after?: string[];
}

/**
 * Result from a grep query
 */
export interface GrepResult {
  /** ID matching the query that produced this result */
  query_id: string;
  /** Result type discriminator */
  type: 'grep';
  /** Total number of matches found */
  total_matches: number;
  /** Number of files with matches */
  files_matched: number;
  /** Match details (may be empty if count_only mode) */
  matches: GrepMatch[];
  /** True if results were truncated due to limits */
  truncated: boolean;
  /** Tokens used for this result */
  tokens_used: number;
}

/**
 * File info from glob query
 */
export interface GlobFile {
  /** File path */
  path: string;
  /** File size in bytes (optional) */
  size?: number;
  /** Last modified timestamp ISO string (optional) */
  modified?: string;
}

/**
 * Result from a glob query
 */
export interface GlobResult {
  /** ID matching the query that produced this result */
  query_id: string;
  /** Result type discriminator */
  type: 'glob';
  /** Total number of files found */
  total_files: number;
  /** File details (may be empty if count_only mode) */
  files: GlobFile[];
  /** True if results were truncated due to limits */
  truncated: boolean;
  /** Tokens used for this result */
  tokens_used: number;
}

/**
 * Symbol info from symbol query
 */
export interface SymbolInfo {
  /** Symbol name */
  name: string;
  /** Symbol kind (function, class, interface, etc.) */
  kind: string;
  /** File containing the symbol */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based, optional) */
  column?: number;
  /** Whether the symbol is exported (optional) */
  exported?: boolean;
  /** Symbol signature/type (optional) */
  signature?: string;
}

/**
 * Result from a symbol query
 */
export interface SymbolResult {
  /** ID matching the query that produced this result */
  query_id: string;
  /** Result type discriminator */
  type: 'symbols';
  /** Total number of symbols found */
  total_symbols: number;
  /** Symbol details (may be empty if count_only mode) */
  symbols: SymbolInfo[];
  /** True if results were truncated due to limits */
  truncated: boolean;
  /** Tokens used for this result */
  tokens_used: number;
}

/**
 * Union type for all discovery result types
 */
export type AnyDiscoveryResult = GrepResult | GlobResult | SymbolResult;

// =============================================================================
// SECTION 13.2: Tool Input/Output Interfaces
// =============================================================================

/**
 * Input for the discover tool
 */
export interface DiscoverInput {
  /** Queries to execute (all run in parallel by default) */
  queries: AnyDiscoveryQuery[];
  /** Run queries in parallel (default: true) */
  parallel?: boolean;
  /** Timeout in milliseconds for the entire discovery operation */
  timeout_ms?: number;
}

/**
 * Output from the discover tool
 */
export interface DiscoverOutput {
  /** Results keyed by query id */
  results: Record<string, AnyDiscoveryResult>;
  /** Total duration for all queries in milliseconds */
  total_duration_ms: number;
  /** Total tokens used across all queries */
  total_tokens_used: number;
  /** Number of queries that completed successfully */
  queries_succeeded: number;
  /** Number of queries that failed */
  queries_failed: number;
  /** Error messages keyed by query id (only present if queries_failed > 0) */
  errors?: Record<string, string>;
}

// =============================================================================
// SECTION 13.2: Tool Definition Interface
// =============================================================================

/**
 * discover tool definition
 * Lightweight discovery tool for finding files, symbols, and patterns.
 * Use before batch operations to identify targets.
 * Optimized for minimal token usage.
 */
export interface DiscoverTool {
  /** Tool name */
  name: 'discover';
  /** Execute discovery queries */
  execute(input: DiscoverInput): Promise<DiscoverOutput>;
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard for GrepQuery
 */
export function isGrepQuery(query: AnyDiscoveryQuery): query is GrepQuery {
  return query.type === 'grep';
}

/**
 * Type guard for GlobQuery
 */
export function isGlobQuery(query: AnyDiscoveryQuery): query is GlobQuery {
  return query.type === 'glob';
}

/**
 * Type guard for SymbolQuery
 */
export function isSymbolQuery(query: AnyDiscoveryQuery): query is SymbolQuery {
  return query.type === 'symbols';
}

/**
 * Type guard for GrepResult
 */
export function isGrepResult(result: AnyDiscoveryResult): result is GrepResult {
  return result.type === 'grep';
}

/**
 * Type guard for GlobResult
 */
export function isGlobResult(result: AnyDiscoveryResult): result is GlobResult {
  return result.type === 'glob';
}

/**
 * Type guard for SymbolResult
 */
export function isSymbolResult(result: AnyDiscoveryResult): result is SymbolResult {
  return result.type === 'symbols';
}
