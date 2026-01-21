/**
 * Memory Structure interfaces for Batch Engine
 * @see SPEC-v2 Section 8.1
 */

export interface Memory {
  decisions: Decision[];
  patterns: Pattern[];
  failures: Failure[];
  preferences: Preference[];
}

export interface Decision {
  id: string;
  timestamp: string;
  what: string;
  why: string;
  category: DecisionCategory;
  confidence: 'high' | 'medium' | 'low';
  files?: string[];
  symbols?: string[];
  status: 'active' | 'superseded' | 'reverted';
  superseded_by?: string;
  batch_id?: string;
  agent_id?: string;
}

export type DecisionCategory =
  | 'architecture' | 'library' | 'pattern' | 'convention'
  | 'performance' | 'security' | 'testing' | 'deployment';

export interface Pattern {
  id: string;
  timestamp: string;
  name: string;
  description: string;
  examples: {
    file: string;
    lines: [number, number];
    code?: string;
  }[];
  when_to_use: string;
  when_not_to_use?: string;
  discovered_in?: string;
  usage_count: number;
}

export interface Failure {
  id: string;
  timestamp: string;
  error_type: string;
  error_message: string;
  stack_trace?: string;
  operation?: string;
  files?: string[];
  resolved: boolean;
  resolution?: string;
  resolution_batch?: string;
  root_cause?: string;
  prevention?: string;
}

export interface Preference {
  id: string;
  timestamp: string;
  key: string;
  value: unknown;
  source: 'user' | 'inferred' | 'default';
  scope: 'global' | 'project' | 'session';
}
