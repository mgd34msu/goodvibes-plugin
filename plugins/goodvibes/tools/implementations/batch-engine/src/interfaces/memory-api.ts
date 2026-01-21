/**
 * Memory API interfaces for Batch Engine
 * @see SPEC-v2 Section 8.4
 */

import type { Memory, Decision, Pattern, Failure, Preference, DecisionCategory } from './memory.js';
import type { BatchContext } from './context.js';

export interface DecisionFilter {
  category?: DecisionCategory | DecisionCategory[];
  status?: 'active' | 'superseded' | 'reverted';
  confidence?: 'high' | 'medium' | 'low';
  files?: string[];
  symbols?: string[];
  since?: string;
  batch_id?: string;
}

export interface PatternFilter {
  name?: string;
  min_usage?: number;
  discovered_in?: string;
  since?: string;
}

export interface FailureFilter {
  error_type?: string;
  resolved?: boolean;
  files?: string[];
  since?: string;
  operation?: string;
}

export type MemoryEntryKind = 'decision' | 'pattern' | 'failure' | 'preference';

export interface MemoryEntry {
  kind: MemoryEntryKind;
  entry: Decision | Pattern | Failure | Preference;
}

export interface MemoryAPI {
  // Decisions
  recordDecision(decision: Omit<Decision, 'id' | 'timestamp'>): Decision;
  getDecisions(filter?: DecisionFilter): Decision[];
  supersedDecision(id: string, new_decision_id: string): void;

  // Patterns
  recordPattern(pattern: Omit<Pattern, 'id' | 'timestamp' | 'usage_count'>): Pattern;
  getPatterns(filter?: PatternFilter): Pattern[];
  incrementPatternUsage(id: string): void;

  // Failures
  recordFailure(failure: Omit<Failure, 'id' | 'timestamp'>): Failure;
  getFailures(filter?: FailureFilter): Failure[];
  resolveFailure(id: string, resolution: string): void;

  // Preferences
  setPreference(key: string, value: unknown, scope?: 'global' | 'project' | 'session'): void;
  getPreference(key: string): unknown;

  // Search
  search(keywords: string[], kinds?: MemoryEntryKind[]): MemoryEntry[];
  getRelevant(context: BatchContext): Memory;

  // Maintenance
  compact(): void;
  export(): string;
  import(data: string): void;
}

export interface MemoryManager extends MemoryAPI {
  // Extended functionality
  getMemory(): Memory;
  reset(): void;

  // Events
  onMemoryChange(callback: (memory: Memory) => void): () => void;
}
