/**
 * EXEC, QUERY, STATE Operations interfaces
 * @see SPEC-v2 Sections 4.3-4.5
 */

import type { OperationBase } from '../operation.js';

// =============================================================================
// SECTION 4.3: EXEC Operations
// =============================================================================

/**
 * Capture options for command output
 */
export interface CaptureSpec {
  stdout?: boolean;
  stderr?: boolean;
  exit_code?: boolean;
}

/**
 * Command specification - uses `cmd` not `command`
 */
export interface CommandSpec {
  cmd: string;
  timeout_ms?: number;
  capture?: CaptureSpec;
  expect?: {
    exit_code?: number;
    stdout_contains?: string;
    stderr_empty?: boolean;
  };
}

/**
 * Command operation options
 */
export interface CommandOptions {
  shell?: string;
  working_dir?: string;
  env?: Record<string, string>;
  safe_mode?: boolean;
}

/**
 * Command execution operation
 */
export interface CommandOperation extends OperationBase {
  type: 'command';
  commands: CommandSpec[];
  options?: CommandOptions;
}

/**
 * Chain specification for agent chaining
 */
export interface ChainSpec {
  agent: string;
  task: string;
  condition?: string;
}

/**
 * Budget constraints for agent execution
 */
export interface AgentBudget {
  max_tokens?: number;
  max_turns?: number;
  timeout_ms?: number;
}

/**
 * Injection options for agent context
 */
export interface AgentInject {
  context?: string[];
  files?: string[];
  memory?: string[];
}

/**
 * Agent specification - uses `id`, `agent` (not `name`)
 */
export interface AgentSpec {
  id: string;
  agent: string;
  task: string;
  budget?: AgentBudget;
  model?: string;
  inject?: AgentInject;
  chain_on_complete?: ChainSpec;
}

/**
 * Agent spawning operation
 */
export interface AgentOperation extends OperationBase {
  type: 'agent';
  agents: AgentSpec[];
}

/**
 * Script specification - args is string[] not unknown[]
 */
export interface ScriptSpec {
  language: 'javascript' | 'typescript' | 'python' | 'shell';
  code: string;
  args?: string[];
}

/**
 * Script execution operation
 */
export interface ScriptOperation extends OperationBase {
  type: 'script';
  scripts: ScriptSpec[];
}

// =============================================================================
// SECTION 4.4: QUERY Operations
// =============================================================================

/**
 * All supported LSP operation types
 */
export type LspOperationType =
  | 'definition'
  | 'references'
  | 'implementations'
  | 'hover'
  | 'signature'
  | 'completion'
  | 'diagnostics'
  | 'code_actions'
  | 'rename'
  | 'call_hierarchy'
  | 'type_hierarchy';

/**
 * Position in a file - object with line and character
 */
export interface Position {
  line: number;
  character: number;
}

/**
 * LSP query specification
 */
export interface LspQuery {
  operation: LspOperationType;
  file: string;
  position: Position;
  options?: Record<string, unknown>;
}

/**
 * LSP query operation
 */
export interface LspOperation extends OperationBase {
  type: 'lsp';
  queries: LspQuery[];
}

/**
 * All supported validation types
 */
export type ValidationType =
  | 'typecheck'
  | 'lint'
  | 'test'
  | 'build'
  | 'env'
  | 'api_contract'
  | 'secrets'
  | 'permissions';

/**
 * Validation specification
 */
export interface ValidationSpec {
  kind: ValidationType;
  options?: Record<string, unknown>;
}

/**
 * Validation operation - validations is ValidationSpec[]
 */
export interface ValidateOperation extends OperationBase {
  type: 'validate';
  validations: ValidationSpec[];
  options?: {
    fix?: boolean;
    paths?: string[];
  };
}

/**
 * All supported diagnosis kinds
 */
export type DiagnosisKind =
  | 'error_stack'
  | 'type_error'
  | 'runtime_error'
  | 'performance'
  | 'memory_leak'
  | 'bundle_size';

/**
 * Diagnosis specification
 */
export interface DiagnosisSpec {
  kind: DiagnosisKind;
  input: string;
  context?: Record<string, unknown>;
}

/**
 * Diagnose operation
 */
export interface DiagnoseOperation extends OperationBase {
  type: 'diagnose';
  diagnoses: DiagnosisSpec[];
}

// =============================================================================
// SECTION 4.5: STATE Operations
// =============================================================================

/**
 * Entry for set operation
 */
export interface SetEntry {
  key: string;
  value: unknown;
}

/**
 * Track entry kinds
 */
export type TrackEntryKind = 'decision' | 'pattern' | 'failure' | 'task' | 'metric';

/**
 * Entry for track operation
 */
export interface TrackEntry {
  kind: TrackEntryKind;
  data: Record<string, unknown>;
}

/**
 * Filters for memory query operation
 */
export interface MemoryQueryFilters {
  kinds?: TrackEntryKind[];
  since?: string;
  keywords?: string[];
  limit?: number;
}

/**
 * Get operation - retrieve state by keys
 */
export interface GetOperation extends OperationBase {
  type: 'get';
  keys: string[];
}

/**
 * Set operation - store state entries
 */
export interface SetOperation extends OperationBase {
  type: 'set';
  entries: SetEntry[];
  options?: {
    merge?: boolean;
    persist?: boolean;
  };
}

/**
 * Track operation - record decisions, patterns, failures, tasks, metrics
 */
export interface TrackOperation extends OperationBase {
  type: 'track';
  entries: TrackEntry[];
}

/**
 * Memory query operation - search tracked entries
 */
export interface MemoryQueryOperation extends OperationBase {
  type: 'query';
  filters?: MemoryQueryFilters;
}

// =============================================================================
// Union Types
// =============================================================================

export type ExecOperation = CommandOperation | AgentOperation | ScriptOperation;
export type QueryOperation = LspOperation | ValidateOperation | DiagnoseOperation;
export type StateOperation = GetOperation | SetOperation | TrackOperation | MemoryQueryOperation;
