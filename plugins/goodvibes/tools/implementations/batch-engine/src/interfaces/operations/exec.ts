/**
 * EXEC, QUERY, STATE Operations interfaces
 * @see SPEC-v2 Sections 4.3-4.5
 */

import type { OperationBase } from '../operation.js';

// EXEC Operations
export interface CommandOperation extends OperationBase {
  type: 'command';
  commands: { command: string; timeout_ms?: number; expect?: { exit_code?: number; stdout_contains?: string; stderr_empty?: boolean; }; }[];
  options?: { shell?: string; env?: Record<string, string>; cwd?: string; safe_mode?: boolean; };
}

export interface AgentOperation extends OperationBase {
  type: 'agent';
  agents: { name: string; task: string; budget?: { max_tokens?: number; max_turns?: number; max_duration_ms?: number; }; model?: string; inject?: string[]; chain_to?: string; }[];
}

export interface ScriptOperation extends OperationBase {
  type: 'script';
  scripts: { language: 'javascript' | 'typescript' | 'python' | 'shell'; code: string; args?: unknown[]; }[];
}

// QUERY Operations
export interface LspOperation extends OperationBase {
  type: 'lsp';
  queries: { operation: 'definition' | 'references' | 'hover' | 'implementations' | 'call_hierarchy'; file: string; line: number; character: number; }[];
}

export interface ValidateOperation extends OperationBase {
  type: 'validate';
  validations: ('typecheck' | 'lint' | 'test' | 'build' | 'format')[];
  options?: { fix?: boolean; paths?: string[]; };
}

export interface DiagnoseOperation extends OperationBase {
  type: 'diagnose';
  diagnoses: { kind: 'error_stack' | 'type_error' | 'runtime_error' | 'performance'; input: string; context?: Record<string, unknown>; }[];
}

// STATE Operations
export interface StateOperation extends OperationBase {
  type: 'state';
  action: 'get' | 'set' | 'track' | 'query';
  key?: string;
  value?: unknown;
  query?: { type: 'decisions' | 'patterns' | 'failures'; filter?: Record<string, unknown>; };
}

export type ExecOperation = CommandOperation | AgentOperation | ScriptOperation;
export type QueryOperation = LspOperation | ValidateOperation | DiagnoseOperation;
