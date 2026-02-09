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
  /** Type of validation to perform. */
  type: 'typescript' | 'eslint' | 'prettier' | 'custom';
  /** Custom command to run (only for type: custom). */
  command?: string;
  /** Whether to attempt auto-fixing validation errors. */
  fix?: boolean;
}

/**
 * Validation result from post-write validation.
 */
export interface ValidationResult {
  /** Whether all validations passed. */
  valid: boolean;
  /** Array of error messages from failed validations. */
  errors?: string[];
  /** Array of warning messages from validations. */
  warnings?: string[];
  /** Number of issues that were auto-fixed. */
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
  /** Absolute or relative file path to read. */
  path: string;
  /** Start line number (0-indexed) for reading a subset of the file. */
  offset?: number;
  /** Maximum number of lines to read from the file. */
  limit?: number;
}

/**
 * Grep match result.
 */
export interface GrepMatch {
  /** Absolute file path where the match was found. */
  file: string;
  /** 1-based line number of the match within the file. */
  line: number;
  /** 1-based column number where the match starts. */
  column: number;
  /** The matched line content. */
  content: string;
  /** Lines before the match (context lines). */
  before?: string[];
  /** Lines after the match (context lines). */
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
  /** Name of the symbol. */
  name: string;
  /** Kind/type of the symbol (class, function, etc.). */
  kind: SymbolKind;
  /** Absolute file path where the symbol is defined. */
  file: string;
  /** 1-based line number where the symbol is defined. */
  line: number;
  /** 1-based column number where the symbol starts. */
  column: number;
  /** Full signature of the symbol (for functions/methods). */
  signature?: string;
  /** Name of the containing symbol (class name for methods, etc.). */
  container?: string;
  /** Whether the symbol is exported from its module. */
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
  /** Absolute or relative file path to edit. */
  file: string;
  /** Type of edit operation to perform. */
  operation: EditOperation;
  /** Original content to find and replace (for replace operations). */
  old_content?: string;
  /** New content to insert or use as replacement. */
  new_content?: string;
  /** Position in the file for insert operations. */
  position?: {
    /** Line number (1-based) for the insert position. */
    line: number;
    /** Character position (0-based) within the line. */
    character: number;
  };
}

/**
 * Edit result.
 */
export interface EditResult {
  /** Absolute file path that was edited. */
  file: string;
  /** Type of edit operation performed. */
  operation: EditOperation;
  /** Status of the edit operation. */
  status: 'applied' | 'not_found' | 'ambiguous' | 'conflict' | 'failed';
  /** Line number where the edit was applied. */
  line?: number;
  /** Unified diff showing the changes made. */
  diff?: string;
  /** Error message if the edit failed. */
  error?: string;
}

/**
 * File read result.
 */
export interface FileReadResult {
  /** Absolute file path that was read. */
  path: string;
  /** Whether the file exists on the filesystem. */
  exists: boolean;
  /** Full content of the file (when extract mode is content). */
  content?: string;
  /** Array of lines from the file (when extract mode is lines). */
  lines?: string[];
  /** Total number of lines in the file. */
  line_count?: number;
  /** File size in bytes. */
  size?: number;
  /** Last modified timestamp (ISO 8601 format). */
  modified?: string;
  /** Whether the content was truncated due to size limits. */
  truncated?: boolean;
  /** Error message if the file could not be read. */
  error?: string;
}

/**
 * Glob result.
 */
export interface GlobResult {
  /** Absolute or relative file path. */
  path: string;
  /** File size in bytes. */
  size?: number;
  /** Last modified timestamp (ISO 8601 format). */
  modified?: string;
  /** Preview of first few lines (when with_preview mode is used). */
  preview?: string[];
}

/**
 * Document symbol with hierarchy.
 */
export interface DocumentSymbol {
  /** Name of the symbol. */
  name: string;
  /** Kind/type of the symbol (class, function, etc.). */
  kind: SymbolKind;
  /** 1-based line number where the symbol starts. */
  line: number;
  /** 1-based column number where the symbol starts. */
  column: number;
  /** 1-based line number where the symbol ends. */
  endLine?: number;
  /** 1-based column number where the symbol ends. */
  endColumn?: number;
  /** Full signature of the symbol (for functions/methods). */
  signature?: string;
  /** Nested child symbols (methods in a class, etc.). */
  children?: DocumentSymbol[];
}
