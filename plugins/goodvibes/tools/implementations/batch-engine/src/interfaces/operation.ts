/**
 * Operation Base interfaces for Batch Engine
 * @see SPEC-v2 Section 3.2
 */

export type OperationType = 
  | 'read' | 'search' | 'glob' | 'symbol' | 'url' | 'analyze'
  | 'create' | 'edit' | 'delete' | 'move' | 'copy'
  | 'command' | 'agent' | 'script'
  | 'lsp' | 'validate' | 'diagnose'
  | 'state';

export interface Condition {
  expression: string;
}

export interface Expectation {
  expression: string;
  message?: string;
}

export interface OperationBase {
  id: string;
  type: OperationType;
  depends_on?: string[];
  when?: Condition;
  skip_if?: Condition;
  expect?: Expectation[];
  inject?: Record<string, string>;
}

export type Operation = OperationBase & Record<string, unknown>;
