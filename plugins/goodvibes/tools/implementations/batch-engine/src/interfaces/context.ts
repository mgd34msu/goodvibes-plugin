/**
 * Context Structure interfaces for Batch Engine
 * @see SPEC-v2 Section 6.1
 */

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

export interface Decision { id: string; what: string; why: string; category: string; confidence: number; files: string[]; symbols: string[]; status: 'active' | 'superseded'; timestamp: string; }
export interface Pattern { id: string; name: string; description: string; examples: string[]; when_to_use: string; usage_count: number; }
export interface Failure { id: string; error_type: string; error_message: string; resolution?: string; root_cause?: string; prevention?: string; timestamp: string; }
