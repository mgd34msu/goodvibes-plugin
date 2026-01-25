/**
 * Memory Structure interfaces for Batch Engine
 * @see SPEC-v2 Section 8.1
 *
 * CONSOLIDATED: Now imports core types from plugins/goodvibes/src/core/memory.ts
 * Batch-engine types are compatible but use different field names for legacy reasons.
 *
 * Core types are imported for reference and provide mapping utilities.
 */

import type {
  Decision as CoreDecision,
  Pattern as CorePattern,
  Failure as CoreFailure,
} from '../../../../../src/core/memory.js';

// Re-export core types for use elsewhere
export type { CoreDecision, CorePattern, CoreFailure };

/**
 * Batch-engine Decision (compatible with CoreDecision)
 * Uses 'timestamp' instead of 'date', 'files' instead of 'scope'
 */
export interface Decision {
  id: string;
  /** ISO timestamp when made (core uses 'date') */
  timestamp: string;
  what: string;
  why: string;
  category: DecisionCategory;
  confidence: 'high' | 'medium' | 'low';
  /** Files affected (core uses 'scope') */
  files?: string[];
  /** Optional symbols affected (batch-engine specific) */
  symbols?: string[];
  status: 'active' | 'superseded' | 'reverted';
  /** Reference to superseding decision (batch-engine specific) */
  superseded_by?: string;
  /** Batch that created this decision (batch-engine specific) */
  batch_id?: string;
  /** Agent that created this decision (batch-engine specific) */
  agent_id?: string;
}

/**
 * Batch-engine Pattern (compatible with CorePattern)
 * Uses structured examples instead of simple example_files array
 */
export interface Pattern {
  id: string;
  /** ISO timestamp when discovered */
  timestamp: string;
  name: string;
  description: string;
  /** Structured examples with line ranges (core uses simple example_files string[]) */
  examples: {
    file: string;
    lines: [number, number];
    code?: string;
  }[];
  when_to_use: string;
  /** When NOT to use this pattern (batch-engine specific) */
  when_not_to_use?: string;
  /** Batch where pattern was discovered (batch-engine specific) */
  discovered_in?: string;
  /** Usage count for analytics (batch-engine specific) */
  usage_count: number;
}

/**
 * Batch-engine Failure (compatible with CoreFailure)
 * Splits core 'error' into error_type and error_message
 */
export interface Failure {
  id: string;
  /** ISO timestamp when occurred */
  timestamp: string;
  /** Error type classification (core has single 'error' field) */
  error_type: string;
  /** Error message details (core has single 'error' field) */
  error_message: string;
  /** Stack trace if available (batch-engine specific) */
  stack_trace?: string;
  /** Operation that failed (core uses 'context') */
  operation?: string;
  /** Files involved in failure (batch-engine specific) */
  files?: string[];
  /** Whether failure has been resolved (batch-engine specific) */
  resolved: boolean;
  /** How it was resolved (core has this too) */
  resolution?: string;
  /** Batch that resolved this failure (batch-engine specific) */
  resolution_batch?: string;
  /** Root cause analysis (core has this too) */
  root_cause?: string;
  /** How to prevent in future (core has this too) */
  prevention?: string;
}

/**
 * Preference for user/project/session settings (batch-engine specific)
 */
export interface Preference {
  id: string;
  timestamp: string;
  key: string;
  value: unknown;
  source: 'user' | 'inferred' | 'default';
  scope: 'global' | 'project' | 'session';
}

/**
 * Memory structure containing all memory types
 */
export interface Memory {
  decisions: Decision[];
  patterns: Pattern[];
  failures: Failure[];
  preferences: Preference[];
}

/**
 * Decision category (kept from batch-engine, subset of core categories)
 */
export type DecisionCategory =
  | 'architecture' | 'library' | 'pattern' | 'convention'
  | 'performance' | 'security' | 'testing' | 'deployment';

// ============================================================================
// Type Conversion Utilities
// ============================================================================

/**
 * Convert batch-engine Decision to core Decision format
 */
export function toCoreDecision(decision: Decision): CoreDecision {
  // Map batch-engine category to core category (core only supports a subset)
  const coreCategory: CoreDecision['category'] =
    ['architecture', 'library', 'pattern', 'convention'].includes(decision.category)
      ? (decision.category as CoreDecision['category'])
      : 'architecture'; // fallback for extended categories

  return {
    id: decision.id,
    date: decision.timestamp, // timestamp -> date
    category: coreCategory,
    what: decision.what,
    why: decision.why,
    scope: decision.files || [], // files -> scope
    confidence: decision.confidence,
    status: decision.status,
  };
}

/**
 * Convert core Decision to batch-engine Decision format
 */
export function fromCoreDecision(coreDecision: CoreDecision): Decision {
  return {
    id: coreDecision.id,
    timestamp: coreDecision.date, // date -> timestamp
    what: coreDecision.what,
    why: coreDecision.why,
    category: coreDecision.category,
    confidence: coreDecision.confidence,
    files: coreDecision.scope, // scope -> files
    status: coreDecision.status,
  };
}

/**
 * Convert batch-engine Pattern to core Pattern format
 */
export function toCorePattern(pattern: Pattern): CorePattern {
  return {
    id: pattern.id,
    name: pattern.name,
    description: pattern.description,
    when_to_use: pattern.when_to_use,
    example_files: pattern.examples.map(e => e.file), // structured -> simple
    keywords: [], // batch-engine doesn't have keywords, provide empty array
  };
}

/**
 * Convert core Pattern to batch-engine Pattern format
 */
export function fromCorePattern(corePattern: CorePattern): Pattern {
  return {
    id: corePattern.id,
    timestamp: new Date().toISOString(), // core doesn't have timestamp
    name: corePattern.name,
    description: corePattern.description,
    examples: corePattern.example_files.map(file => ({
      file,
      lines: [0, 0] as [number, number], // core doesn't have line info
    })),
    when_to_use: corePattern.when_to_use,
    usage_count: 0, // core doesn't track usage
  };
}

/**
 * Convert batch-engine Failure to core Failure format
 */
export function toCoreFailure(failure: Failure): CoreFailure {
  return {
    id: failure.id,
    date: failure.timestamp, // timestamp -> date
    error: `${failure.error_type}: ${failure.error_message}`, // combine type and message
    context: failure.operation || '', // operation -> context
    root_cause: failure.root_cause || '',
    resolution: failure.resolution || '',
    prevention: failure.prevention || '',
    keywords: [], // batch-engine doesn't have keywords, provide empty array
  };
}

/**
 * Convert core Failure to batch-engine Failure format
 */
export function fromCoreFailure(coreFailure: CoreFailure): Failure {
  // Try to split error into type and message
  const errorParts = coreFailure.error.split(':');
  const error_type = errorParts.length > 1 ? (errorParts[0]?.trim() || 'Error') : 'Error';
  const error_message = errorParts.length > 1 ? errorParts.slice(1).join(':').trim() : coreFailure.error;

  return {
    id: coreFailure.id,
    timestamp: coreFailure.date, // date -> timestamp
    error_type,
    error_message,
    operation: coreFailure.context, // context -> operation
    resolved: !!(coreFailure.resolution && coreFailure.resolution.length > 0), // has resolution = resolved
    resolution: coreFailure.resolution || undefined,
    root_cause: coreFailure.root_cause || undefined,
    prevention: coreFailure.prevention || undefined,
  };
}
