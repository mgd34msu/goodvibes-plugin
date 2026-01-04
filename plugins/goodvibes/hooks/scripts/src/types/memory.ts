/**
 * Type definitions for project memory data.
 */

/** Represents an architectural decision record. */
export interface MemoryDecision {
  date: string;
  title: string;
  decision: string;
  alternatives?: string[];
  rationale: string;
  agent?: string;
}

/** Represents a categorized set of code patterns. */
export interface MemoryPattern {
  category: string;
  patterns: string[];
}

/** Represents a failed approach to avoid repeating. */
export interface MemoryFailure {
  date: string;
  what: string;
  why_failed: string;
  solution: string;
  agent?: string;
}

/** Represents a user preference setting. */
export interface MemoryPreference {
  key: string;
  value: string;
  note?: string;
}

/** Container for all project memory data. */
export interface ProjectMemory {
  decisions: MemoryDecision[];
  patterns: MemoryPattern[];
  failures: MemoryFailure[];
  preferences: MemoryPreference[];
}
