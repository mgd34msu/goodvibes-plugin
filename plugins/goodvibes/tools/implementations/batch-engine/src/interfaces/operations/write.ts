/**
 * WRITE Operations interfaces
 * @see SPEC-v2 Section 4.2
 */

import type { OperationBase } from '../operation.js';

export interface EditHint {
  near_line?: number;
  in_function?: string;
  in_class?: string;
  after?: string;
  before?: string;
}

export interface CreateOperation extends OperationBase {
  type: 'create';
  files: { path: string; content: string; template?: string; data?: Record<string, unknown>; }[];
  options?: { overwrite?: boolean; create_dirs?: boolean; template?: string; };
}

export interface EditOperation extends OperationBase {
  type: 'edit';
  targets: { file: string; edits: { old_content: string; new_content: string; hint?: EditHint; }[]; }[];
  options?: { match_mode?: 'exact' | 'fuzzy' | 'regex' | 'ast'; conflict_strategy?: 'fail' | 'skip' | 'merge' | 'overwrite'; };
}

export interface DeleteOperation extends OperationBase {
  type: 'delete';
  targets: string[];
  safety?: { require_empty?: boolean; require_untracked?: boolean; max_files?: number; };
}

export interface MoveOperation extends OperationBase {
  type: 'move';
  moves: { from: string; to: string; }[];
  options?: { update_imports?: boolean; create_dirs?: boolean; };
}

export interface CopyOperation extends OperationBase {
  type: 'copy';
  copies: { from: string; to: string; transform?: string; }[];
  options?: { overwrite?: boolean; transform?: string; };
}

export type WriteOperation = CreateOperation | EditOperation | DeleteOperation | MoveOperation | CopyOperation;
