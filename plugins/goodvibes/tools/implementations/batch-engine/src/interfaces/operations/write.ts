/**
 * WRITE Operations interfaces
 * @see SPEC-v2 Section 4.2
 */

import type { OperationBase } from '../operation.js';

// ============================================================================
// Specification Types
// ============================================================================

/**
 * Specification for creating a file
 */
export interface CreateSpec {
  path: string;
  content: string;
  encoding?: string;
}

/**
 * Individual edit operation within a file
 */
export interface Edit {
  find: string;
  replace: string;
  occurrence?: 'first' | 'last' | 'all' | number;
  near_line?: number;
  in_function?: string;
  in_class?: string;
}

/**
 * Specification for editing a file (file path + edits)
 */
export interface EditSpec {
  file: string;
  edits: Edit[];
}

/**
 * @deprecated Use EditSpec instead
 */
export interface EditTarget {
  file: string;
  edits: Edit[];
}

/**
 * Specification for copying a file
 */
export interface CopySpec {
  from: string;
  to: string;
  transform?: string;
}

/**
 * Specification for moving a file
 */
export interface MoveSpec {
  from: string;
  to: string;
}

// ============================================================================
// Option Types
// ============================================================================

/**
 * Options for create operations
 */
export interface CreateOptions {
  overwrite?: boolean;
  create_dirs?: boolean;
  template?: 'handlebars' | 'ejs' | 'none';
}

/**
 * Options for edit operations
 */
export interface EditOptions {
  match_mode?: 'exact' | 'regex' | 'ast' | 'fuzzy';
  conflict_strategy?: 'fail' | 'merge' | 'force';
  create_if_missing?: boolean;
}

/**
 * Options for delete operations
 */
export interface DeleteOptions {
  require_empty?: boolean;
  max_files?: number;
  confirm_patterns?: string[];
  blocked_paths?: string[];
}

/**
 * Options for move operations
 */
export interface MoveOptions {
  overwrite?: boolean;
  update_imports?: boolean;
}

/**
 * Options for copy operations
 */
export interface CopyOptions {
  overwrite?: boolean;
  preserve_timestamps?: boolean;
}

/**
 * Options for atomic operations
 */
export interface AtomicOptions {
  rollback_on_failure?: boolean;
  continue_on_error?: boolean;
  dry_run?: boolean;
}

// ============================================================================
// WriteOperation Discriminated Union (SPEC-v2 Section 4.2)
// ============================================================================

/**
 * WriteOperation is a discriminated union of all write operation types.
 * Each variant has a `type` discriminant and operation-specific properties.
 * @see SPEC-v2 Section 4.2
 */
export type WriteOperation =
  | { type: 'create'; id: string; files: CreateSpec[]; options?: CreateOptions }
  | { type: 'edit'; id: string; edits: EditSpec[]; options?: EditOptions }
  | { type: 'delete'; id: string; files: string[]; options?: DeleteOptions }
  | { type: 'move'; id: string; moves: MoveSpec[]; options?: MoveOptions }
  | { type: 'copy'; id: string; copies: CopySpec[]; options?: CopyOptions }
  | { type: 'atomic'; id: string; operations: WriteOperation[]; options?: AtomicOptions };

// ============================================================================
// Extended Operation Interfaces (with OperationBase properties)
// ============================================================================

/**
 * Create operation - creates new files
 * Extended interface including all OperationBase properties
 */
export interface CreateOperation extends OperationBase {
  type: 'create';
  files: CreateSpec[];
  options?: CreateOptions;
}

/**
 * Edit operation - modifies existing files
 * Extended interface including all OperationBase properties
 */
export interface EditOperation extends OperationBase {
  type: 'edit';
  edits: EditSpec[];
  /** @deprecated Use edits instead */
  targets?: EditTarget[];
  options?: EditOptions;
}

/**
 * Delete operation - removes files or directories
 * Extended interface including all OperationBase properties
 */
export interface DeleteOperation extends OperationBase {
  type: 'delete';
  files: string[];
  /** @deprecated Use files instead */
  targets?: string[];
  options?: DeleteOptions;
  /** @deprecated Use options instead */
  safety?: DeleteOptions;
}

/**
 * Move operation - moves/renames files
 * Extended interface including all OperationBase properties
 */
export interface MoveOperation extends OperationBase {
  type: 'move';
  moves: MoveSpec[];
  options?: MoveOptions;
}

/**
 * Copy operation - copies files
 * Extended interface including all OperationBase properties
 */
export interface CopyOperation extends OperationBase {
  type: 'copy';
  copies: CopySpec[];
  options?: CopyOptions;
}

/**
 * Atomic operation - groups multiple operations for transactional execution
 * Extended interface including all OperationBase properties
 */
export interface AtomicOperation extends OperationBase {
  type: 'atomic';
  operations: WriteOperation[];
  options?: AtomicOptions;
}

/**
 * Union of all extended write operation interfaces
 * Use this when you need the full OperationBase properties (depends_on, when, etc.)
 */
export type ExtendedWriteOperation =
  | CreateOperation
  | EditOperation
  | DeleteOperation
  | MoveOperation
  | CopyOperation
  | AtomicOperation;
