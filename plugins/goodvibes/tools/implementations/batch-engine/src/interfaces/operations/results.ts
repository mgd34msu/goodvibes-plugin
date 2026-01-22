/**
 * Operation-specific result types
 * @see SPEC-v2 Section 4 (Results for each operation type)
 */

import type { OperationResult } from '../result.js';
import type { SymbolKind } from './read.js';

// =============================================================================
// SECTION 4.1: READ Operation Results
// =============================================================================

/**
 * File read result - contains file content and metadata
 */
export interface FileReadResult extends OperationResult {
  type: 'files';
  data: {
    files: Array<{
      path: string;
      content?: string;
      outline?: Array<{
        name: string;
        kind: SymbolKind;
        line: number;
      }>;
      symbols?: Array<{
        name: string;
        kind: SymbolKind;
        signature?: string;
      }>;
      ast?: Record<string, unknown>;
      lines?: Array<{
        number: number;
        content: string;
      }>;
      encoding?: string;
      size_bytes?: number;
    }>;
  };
}

/**
 * Search result - contains matches across files
 */
export interface SearchResult extends OperationResult {
  type: 'search';
  data: {
    matches: Array<{
      file: string;
      line: number;
      column: number;
      match: string;
      context_before?: string[];
      context_after?: string[];
      relevance_score?: number;
    }>;
    total_matches: number;
    files_matched: number;
  };
}

/**
 * Glob result - contains file paths matching patterns
 */
export interface GlobResult extends OperationResult {
  type: 'glob';
  data: {
    files: Array<{
      path: string;
      size_bytes?: number;
      modified_at?: string;
      preview?: string[];
      stats?: {
        lines?: number;
        chars?: number;
      };
    }>;
    total_files: number;
    total_size_bytes?: number;
  };
}

/**
 * Symbol result - contains symbol search results
 */
export interface SymbolResult extends OperationResult {
  type: 'symbols';
  data: {
    symbols: Array<{
      name: string;
      kind: SymbolKind;
      file: string;
      line?: number;
      column?: number;
      signature?: string;
    }>;
    total_symbols: number;
  };
}

/**
 * URL fetch result - contains fetched URL content
 */
export interface UrlResult extends OperationResult {
  type: 'url';
  data: {
    urls: Array<{
      url: string;
      content: string;
      title?: string;
      metadata?: Record<string, unknown>;
      cached?: boolean;
    }>;
  };
}

/**
 * Analysis result - contains analysis findings
 */
export interface AnalyzeResult extends OperationResult {
  type: 'analyze';
  data: {
    kind: string;
    findings: Record<string, unknown>;
    summary?: string;
    recommendations?: string[];
  };
}

// =============================================================================
// SECTION 4.2: WRITE Operation Results
// =============================================================================

/**
 * Create result - tracks file creation
 */
export interface CreateResult extends OperationResult {
  type: 'create';
  data: {
    files: Array<{
      path: string;
      created: boolean;
      size_bytes?: number;
      error?: string;
    }>;
    total_created: number;
  };
}

/**
 * Edit result - tracks file edits
 */
export interface EditResult extends OperationResult {
  type: 'edit';
  data: {
    edits: Array<{
      file: string;
      edits_applied: number;
      edits_failed: number;
      changes?: Array<{
        find: string;
        replace: string;
        line?: number;
        applied: boolean;
      }>;
      error?: string;
    }>;
    total_edits_applied: number;
    total_edits_failed: number;
  };
}

/**
 * Delete result - tracks file deletion
 */
export interface DeleteResult extends OperationResult {
  type: 'delete';
  data: {
    files: Array<{
      path: string;
      deleted: boolean;
      error?: string;
    }>;
    total_deleted: number;
  };
}

/**
 * Move result - tracks file moves
 */
export interface MoveResult extends OperationResult {
  type: 'move';
  data: {
    moves: Array<{
      from: string;
      to: string;
      moved: boolean;
      imports_updated?: number;
      error?: string;
    }>;
    total_moved: number;
  };
}

/**
 * Copy result - tracks file copies
 */
export interface CopyResult extends OperationResult {
  type: 'copy';
  data: {
    copies: Array<{
      from: string;
      to: string;
      copied: boolean;
      size_bytes?: number;
      error?: string;
    }>;
    total_copied: number;
  };
}

/**
 * Atomic result - tracks atomic transaction
 */
export interface AtomicResult extends OperationResult {
  type: 'atomic';
  data: {
    operations_total: number;
    operations_succeeded: number;
    operations_failed: number;
    rolled_back: boolean;
    results: OperationResult[];
  };
}

// =============================================================================
// SECTION 4.3: EXEC Operation Results
// =============================================================================

/**
 * Command execution result
 */
export interface CommandResult extends OperationResult {
  type: 'command';
  data: {
    commands: Array<{
      cmd: string;
      exit_code: number;
      stdout: string;
      stderr: string;
      duration_ms: number;
      success: boolean;
      error?: string;
    }>;
    total_succeeded: number;
    total_failed: number;
  };
}

/**
 * Agent execution result
 */
export interface AgentResult extends OperationResult {
  type: 'agent';
  data: {
    agents: Array<{
      id: string;
      agent: string;
      status: 'completed' | 'failed' | 'timeout';
      output?: string;
      tokens_used: number;
      duration_ms: number;
      error?: string;
      chained_to?: string;
    }>;
    total_completed: number;
    total_failed: number;
  };
}

/**
 * Script execution result
 */
export interface ScriptResult extends OperationResult {
  type: 'script';
  data: {
    scripts: Array<{
      language: string;
      exit_code: number;
      stdout: string;
      stderr: string;
      duration_ms: number;
      success: boolean;
      error?: string;
    }>;
    total_succeeded: number;
    total_failed: number;
  };
}

// =============================================================================
// SECTION 4.4: QUERY Operation Results
// =============================================================================

/**
 * LSP query result
 */
export interface LspResult extends OperationResult {
  type: 'lsp';
  data: {
    queries: Array<{
      operation: string;
      file: string;
      line: number;
      results: Record<string, unknown>;
      error?: string;
    }>;
    total_succeeded: number;
    total_failed: number;
  };
}

/**
 * Validation result
 */
export interface ValidateResult extends OperationResult {
  type: 'validate';
  data: {
    validations: Array<{
      kind: string;
      passed: boolean;
      errors?: string[];
      warnings?: string[];
      fixed?: number;
    }>;
    total_passed: number;
    total_failed: number;
  };
}

/**
 * Diagnosis result
 */
export interface DiagnoseResult extends OperationResult {
  type: 'diagnose';
  data: {
    diagnoses: Array<{
      kind: string;
      subject: string;
      findings: Record<string, unknown>;
      recommendations?: string[];
      severity?: 'info' | 'warning' | 'error' | 'critical';
    }>;
  };
}

// =============================================================================
// SECTION 4.5: STATE Operation Results
// =============================================================================

/**
 * Get state result
 */
export interface GetResult extends OperationResult {
  type: 'get';
  data: {
    entries: Array<{
      key: string;
      value: unknown;
      found: boolean;
    }>;
  };
}

/**
 * Set state result
 */
export interface SetResult extends OperationResult {
  type: 'set';
  data: {
    entries: Array<{
      key: string;
      set: boolean;
      merged?: boolean;
      error?: string;
    }>;
    total_set: number;
  };
}

/**
 * Delete state result
 */
export interface DeleteStateResult extends OperationResult {
  type: 'delete_state';
  data: {
    keys: Array<{
      key: string;
      deleted: boolean;
      error?: string;
    }>;
    total_deleted: number;
  };
}

/**
 * List state result
 */
export interface ListResult extends OperationResult {
  type: 'list';
  data: {
    keys: string[];
    total_keys: number;
  };
}

/**
 * Track entry result
 */
export interface TrackResult extends OperationResult {
  type: 'track';
  data: {
    entries: Array<{
      kind: string;
      tracked: boolean;
      id?: string;
      error?: string;
    }>;
    total_tracked: number;
  };
}

/**
 * Memory query result
 */
export interface MemoryQueryResult extends OperationResult {
  type: 'query';
  data: {
    entries: Array<{
      kind: string;
      timestamp: string;
      data: Record<string, unknown>;
    }>;
    total_entries: number;
  };
}

// =============================================================================
// Type Guards
// =============================================================================

export function isFileReadResult(result: OperationResult): result is FileReadResult {
  return result.type === 'files';
}

export function isSearchResult(result: OperationResult): result is SearchResult {
  return result.type === 'search';
}

export function isGlobResult(result: OperationResult): result is GlobResult {
  return result.type === 'glob';
}

export function isSymbolResult(result: OperationResult): result is SymbolResult {
  return result.type === 'symbols';
}

export function isUrlResult(result: OperationResult): result is UrlResult {
  return result.type === 'url';
}

export function isAnalyzeResult(result: OperationResult): result is AnalyzeResult {
  return result.type === 'analyze';
}

export function isCreateResult(result: OperationResult): result is CreateResult {
  return result.type === 'create';
}

export function isEditResult(result: OperationResult): result is EditResult {
  return result.type === 'edit';
}

export function isDeleteResult(result: OperationResult): result is DeleteResult {
  return result.type === 'delete';
}

export function isMoveResult(result: OperationResult): result is MoveResult {
  return result.type === 'move';
}

export function isCopyResult(result: OperationResult): result is CopyResult {
  return result.type === 'copy';
}

export function isAtomicResult(result: OperationResult): result is AtomicResult {
  return result.type === 'atomic';
}

export function isCommandResult(result: OperationResult): result is CommandResult {
  return result.type === 'command';
}

export function isAgentResult(result: OperationResult): result is AgentResult {
  return result.type === 'agent';
}

export function isScriptResult(result: OperationResult): result is ScriptResult {
  return result.type === 'script';
}

export function isLspResult(result: OperationResult): result is LspResult {
  return result.type === 'lsp';
}

export function isValidateResult(result: OperationResult): result is ValidateResult {
  return result.type === 'validate';
}

export function isDiagnoseResult(result: OperationResult): result is DiagnoseResult {
  return result.type === 'diagnose';
}

export function isGetResult(result: OperationResult): result is GetResult {
  return result.type === 'get';
}

export function isSetResult(result: OperationResult): result is SetResult {
  return result.type === 'set';
}

export function isDeleteStateResult(result: OperationResult): result is DeleteStateResult {
  return result.type === 'delete_state';
}

export function isListResult(result: OperationResult): result is ListResult {
  return result.type === 'list';
}

export function isTrackResult(result: OperationResult): result is TrackResult {
  return result.type === 'track';
}

export function isMemoryQueryResult(result: OperationResult): result is MemoryQueryResult {
  return result.type === 'query';
}
