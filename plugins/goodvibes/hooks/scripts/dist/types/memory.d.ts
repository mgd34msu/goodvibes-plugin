/**
 * Type definitions for project memory data.
 *
 * IMPORTANT: These types represent the MARKDOWN format for memory files.
 * The canonical memory system is in src/core/memory.ts with JSON format.
 *
 * Core types (JSON format):
 * - Decision: {id, date, category, what, why, scope, confidence, status}
 * - Pattern: {id, name, description, when_to_use, example_files, keywords}
 * - Failure: {id, date, error, context, root_cause, resolution, prevention, keywords}
 *
 * These hooks types are for markdown I/O only. They map to core types via:
 * - MemoryDecision.title -> Decision.what
 * - MemoryDecision.rationale -> Decision.why
 * - MemoryPattern -> Pattern (similar schema)
 * - MemoryFailure.approach -> Failure.error
 * - MemoryFailure.reason -> Failure.root_cause
 */
/**
 * Core Decision type (from src/core/memory.ts)
 * Defined here for type safety without cross-module imports.
 */
export interface Decision {
    id: string;
    date: string;
    category: "library" | "architecture" | "pattern" | "convention";
    what: string;
    why: string;
    scope: string[];
    confidence: "high" | "medium" | "low";
    status: "active" | "superseded" | "reverted";
}
/**
 * Core Pattern type (from src/core/memory.ts)
 * Defined here for type safety without cross-module imports.
 */
export interface Pattern {
    id: string;
    name: string;
    description: string;
    when_to_use: string;
    example_files: string[];
    keywords: string[];
}
/**
 * Core Failure type (from src/core/memory.ts)
 * Defined here for type safety without cross-module imports.
 */
export interface Failure {
    id: string;
    date: string;
    error: string;
    context: string;
    root_cause: string;
    resolution: string;
    prevention: string;
    keywords: string[];
}
/**
 * Markdown-specific decision format (for backward compatibility with markdown parser).
 * Maps to core Decision type.
 */
export interface MemoryDecision {
    title: string;
    date: string;
    alternatives: string[];
    rationale: string;
    agent?: string;
    context?: string;
}
/**
 * Markdown-specific pattern format (for backward compatibility with markdown parser).
 * Maps to core Pattern type.
 */
export interface MemoryPattern {
    name: string;
    date: string;
    description: string;
    example?: string;
    files?: string[];
}
/**
 * Markdown-specific failure format (for backward compatibility with markdown parser).
 * Maps to core Failure type.
 */
export interface MemoryFailure {
    approach: string;
    date: string;
    reason: string;
    context?: string;
    suggestion?: string;
}
/**
 * User preference setting (not currently in core).
 * @deprecated - Preferences should be migrated to core memory system
 */
export interface MemoryPreference {
    key: string;
    value: string;
    date: string;
    notes?: string;
}
/** Container for all project memory data. */
export interface ProjectMemory {
    decisions: MemoryDecision[];
    patterns: MemoryPattern[];
    failures: MemoryFailure[];
    preferences: MemoryPreference[];
}
