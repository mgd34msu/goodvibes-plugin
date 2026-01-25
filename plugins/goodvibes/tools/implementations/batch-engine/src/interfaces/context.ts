/**
 * Context Structure interfaces for Batch Engine
 * @see SPEC-v2 Section 6.1
 *
 * CONSOLIDATED: Now imports Decision, Pattern, Failure from memory.ts
 * which extends core types from plugins/goodvibes/src/core/memory.ts
 */

import type { Decision, Pattern, Failure } from './memory.js';

// Re-export for backwards compatibility
export type { Decision, Pattern, Failure };

export interface Context {
  session: SessionContext;
  batch: BatchContext;
  operation: OperationContext;
  agent: AgentContext;
}

export interface SessionContext {
  id: string;
  started_at: string;
  mode: 'vibecoding' | 'justvibes';
  project_root: string;
  project_name: string;
  stack: { languages: string[]; frameworks: string[]; libraries: string[]; tools: string[]; };
  git: { branch: string; commit: string; dirty: boolean; remote?: string; };
  health: { typecheck: 'pass' | 'fail' | 'unknown'; lint: 'pass' | 'fail' | 'unknown'; test: 'pass' | 'fail' | 'unknown'; build: 'pass' | 'fail' | 'unknown'; };
  preferences: Record<string, unknown>;
}

export interface BatchContext {
  decisions: Decision[];
  patterns: Pattern[];
  failures: Failure[];
  affected_files: string[];
  affected_symbols: string[];
  resolved_dependencies: Map<string, unknown>;
  risk: { level: 'low' | 'medium' | 'high' | 'critical'; factors: string[]; };
}

export interface OperationContext {
  id: string;
  type: string;
  injected: Record<string, unknown>;
  prior_results: Map<string, import('./result.js').OperationResult>;
}

export interface AgentContext {
  task: string;
  scope: string[];
  constraints: string[];
  relevant_decisions: Decision[];
  relevant_patterns: Pattern[];
  past_failures: Failure[];
  prior_results: Record<string, unknown>;
  budget: { tokens_remaining: number; turns_remaining: number; };
}
