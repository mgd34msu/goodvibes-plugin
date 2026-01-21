/**
 * batch_state Tool interfaces for Batch Engine
 * @see SPEC-v2 Section 13.6
 */

import type { GoodVibesState } from '../state.js';
import type { Memory, Decision, Pattern, Failure } from '../memory.js';

// === Type Aliases ===

export type StateOperation = 'get' | 'set' | 'query' | 'export' | 'import' | 'clear';

// === State Input ===

export interface BatchStateInput {
  operation: StateOperation;

  // For get
  get?: {
    keys: string[];                   // Dot notation paths (e.g., 'session.mode')
  };

  // For set
  set?: {
    values: Record<string, unknown>;  // Key-value pairs to set
    merge?: boolean;                  // Merge with existing (default: true)
  };

  // For query (memory queries)
  query?: {
    type: 'decisions' | 'patterns' | 'failures' | 'all';
    filters?: {
      category?: string;
      files?: string[];
      since?: string;
      limit?: number;
      status?: string;
    };
  };

  // For export
  export?: {
    format: 'json' | 'markdown';
    include?: ('state' | 'memory' | 'telemetry')[];
    output_path?: string;             // If not provided, returns in result
  };

  // For import
  import?: {
    format: 'json';
    source: string | object;          // Path or inline data
    merge?: boolean;
  };

  // For clear
  clear?: {
    targets: ('state' | 'memory' | 'telemetry' | 'checkpoints')[];
    confirm?: boolean;                // Require confirmation
  };
}

// === State Output ===

export interface BatchStateOutput {
  operation: StateOperation;
  success: boolean;

  // For get
  values?: Record<string, unknown>;

  // For query
  decisions?: Decision[];
  patterns?: Pattern[];
  failures?: Failure[];

  // For export
  exported?: string | object;
  exported_path?: string;

  // For import
  imported_count?: number;

  // For clear
  cleared?: string[];

  error?: string;
}

// === State Key Helpers ===

export type StateKey =
  | 'session'
  | 'session.id'
  | 'session.mode'
  | 'session.health'
  | 'session.git'
  | 'agents'
  | 'agents.active'
  | 'agents.completed'
  | 'checkpoints'
  | 'locks';

// === Memory Query Helpers ===

export interface MemoryQuery {
  type: 'decisions' | 'patterns' | 'failures';
  category?: string;
  files?: string[];
  symbols?: string[];
  since?: string;
  limit?: number;
}

// === Batch State Tool Interface ===

export interface BatchStateTool {
  name: 'batch_state';
  execute(input: BatchStateInput): Promise<BatchStateOutput>;

  // Convenience methods
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
  getDecisions(filters?: MemoryQuery): Promise<Decision[]>;
  getPatterns(filters?: MemoryQuery): Promise<Pattern[]>;
  getFailures(filters?: MemoryQuery): Promise<Failure[]>;
  exportState(format: 'json' | 'markdown'): Promise<string>;
  clearAll(): Promise<void>;
}

// === State Snapshot for Export ===

export interface StateSnapshot {
  version: number;
  exported_at: string;
  state: GoodVibesState;
  memory: Memory;
}

// === Import Options ===

export interface ImportOptions {
  merge: boolean;
  overwrite_conflicts: boolean;
  validate: boolean;
}

export const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
  merge: true,
  overwrite_conflicts: false,
  validate: true
};
