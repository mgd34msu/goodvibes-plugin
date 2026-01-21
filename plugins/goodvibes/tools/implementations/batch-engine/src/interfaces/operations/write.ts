/**
 * WRITE Operations interfaces
 * @see SPEC-v2 Section 4.2
 */

import type { OperationBase } from '../operation.js';

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
 * Target file with its edits
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

/**
 * Create operation - creates new files
 */
export interface CreateOperation extends OperationBase {
  type: 'create';
  files: CreateSpec[];
  options?: {
    overwrite?: boolean;
    create_dirs?: boolean;
    template?: 'handlebars' | 'ejs' | 'none';
  };
}

/**
 * Edit operation - modifies existing files
 */
export interface EditOperation extends OperationBase {
  type: 'edit';
  targets: EditTarget[];
  options?: {
    match_mode?: 'exact' | 'regex' | 'ast' | 'fuzzy';
    conflict_strategy?: 'fail' | 'merge' | 'force';
    create_if_missing?: boolean;
  };
}

/**
 * Delete operation - removes files or directories
 */
export interface DeleteOperation extends OperationBase {
  type: 'delete';
  targets: string[];
  safety?: {
    require_empty?: boolean;
    max_files?: number;
    confirm_patterns?: string[];
    blocked_paths?: string[];
  };
}

/**
 * Move operation - moves/renames files
 */
export interface MoveOperation extends OperationBase {
  type: 'move';
  moves: MoveSpec[];
  options?: {
    overwrite?: boolean;
    update_imports?: boolean;
  };
}

/**
 * Copy operation - copies files
 */
export interface CopyOperation extends OperationBase {
  type: 'copy';
  copies: CopySpec[];
  options?: {
    overwrite?: boolean;
    preserve_timestamps?: boolean;
  };
}

export type WriteOperation = CreateOperation | EditOperation | DeleteOperation | MoveOperation | CopyOperation;
