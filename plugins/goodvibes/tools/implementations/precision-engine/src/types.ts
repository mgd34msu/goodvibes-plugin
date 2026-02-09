/**
 * Shared types for precision-engine MCP server.
 */

/**
 * Output mode controls verbosity/token usage of responses.
 *
 * Universal modes (all tools):
 * - count_only: Minimal tokens, only counts/summaries
 * - minimal: Basic info without details
 * - standard: Normal output with key information
 * - verbose: Full details and metadata
 * - with_preview: Include file previews
 * - exit_codes: Exit code only (precision_exec)
 *
 * Tool-specific modes:
 * - files_only: File paths only (precision_grep, discover)
 * - locations: File + line/column locations (precision_grep, discover)
 * - matches: Match content with context (precision_grep)
 * - context: Full context around matches (precision_grep)
 * - paths_only: Just file paths (precision_glob)
 * - with_diff: Include diff output (precision_edit)
 * - signatures: Function signatures only (precision_symbols)
 * - names_only: Symbol names only (precision_symbols, discover)
 */
export type OutputMode =
  // Universal modes
  | 'count_only' | 'minimal' | 'standard' | 'verbose' | 'with_preview' | 'exit_codes'
  // precision_grep / discover
  | 'files_only' | 'locations' | 'matches' | 'context'
  // precision_glob
  | 'paths_only'
  // precision_edit
  | 'with_diff'
  // precision_symbols
  | 'signatures'
  // names only (precision_symbols, discover)
  | 'names_only';

/**
 * Validation step for post-write validation.
 */
export interface ValidationStep {
  type: 'typescript' | 'eslint' | 'prettier' | 'custom';
  command?: string;  // For custom validation
  fix?: boolean;     // Attempt to auto-fix
}

/**
 * Validation result from post-write validation.
 */
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
  fixed?: number;
}

/**
 * Standard result wrapper for all precision tools.
 */
export interface PrecisionResult<T = unknown> {
  /** Whether the operation succeeded. */
  success: boolean;
  /** Result data payload (only present when success=true). */
  data?: T;
  /** Error message (only present when success=false). */
  error?: string;
  /** Metadata about the operation (output mode, token estimate, execution time). */
  meta: {
    output_mode: OutputMode;
    token_estimate: number;
    execution_ms: number;
  };
}

/**
 * File specification for batch reads.
 */
export interface FileSpec {
  path: string;
  offset?: number;  // Start line (0-indexed)
  limit?: number;   // Max lines to read
}

/**
 * Grep match result.
 */
export interface GrepMatch {
  file: string;
  line: number;
  column: number;
  content: string;
  before?: string[];
  after?: string[];
}

/**
 * Symbol kinds for code analysis.
 */
export type SymbolKind =
  | 'class'
  | 'interface'
  | 'function'
  | 'method'
  | 'property'
  | 'variable'
  | 'type'
  | 'enum'
  | 'constructor'
  | 'namespace';

/**
 * Symbol information.
 */
export interface SymbolInfo {
  name: string;
  kind: SymbolKind;
  file: string;
  line: number;
  column: number;
  signature?: string;
  container?: string;
  exported?: boolean;
}

/**
 * Edit operation types.
 */
export type EditOperation = 'replace' | 'insert' | 'delete' | 'create';

/**
 * Edit specification for atomic_multi_edit.
 */
export interface EditSpec {
  file: string;
  operation: EditOperation;
  old_content?: string;
  new_content?: string;
  position?: {
    line: number;
    character: number;
  };
}

/**
 * Edit result.
 */
export interface EditResult {
  file: string;
  operation: EditOperation;
  status: 'applied' | 'not_found' | 'ambiguous' | 'conflict' | 'failed';
  line?: number;
  diff?: string;
  error?: string;
}

/**
 * File read result.
 */
export interface FileReadResult {
  path: string;
  exists: boolean;
  content?: string;
  lines?: string[];
  line_count?: number;
  size?: number;
  modified?: string;
  truncated?: boolean;
  error?: string;
}

/**
 * Glob result.
 */
export interface GlobResult {
  path: string;
  size?: number;
  modified?: string;
  preview?: string[];
}

/**
 * Document symbol with hierarchy.
 */
export interface DocumentSymbol {
  name: string;
  kind: SymbolKind;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  signature?: string;
  children?: DocumentSymbol[];
}
