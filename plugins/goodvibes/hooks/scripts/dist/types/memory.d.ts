/**
 * Type definitions for project memory data.
 */
/** Represents an architectural decision record. */
export interface MemoryDecision {
    title: string;
    date: string;
    alternatives: string[];
    rationale: string;
    agent?: string;
    context?: string;
}
/** Represents a project-specific code pattern. */
export interface MemoryPattern {
    name: string;
    date: string;
    description: string;
    example?: string;
    files?: string[];
}
/** Represents a failed approach to avoid repeating. */
export interface MemoryFailure {
    approach: string;
    date: string;
    reason: string;
    context?: string;
    suggestion?: string;
}
/** Represents a user preference setting. */
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
