/**
 * Memory Loader
 *
 * Loads persisted context from .goodvibes/memory/ directory.
 * This includes decisions, patterns, failures, and preferences.
 */
/** Aggregated project memory including decisions, patterns, and preferences. */
export interface ProjectMemory {
    decisions: Decision[];
    patterns: Pattern[];
    failures: Failure[];
    preferences: Preferences;
    customContext: string[];
}
/** A recorded architectural or implementation decision. */
export interface Decision {
    date: string;
    description: string;
    rationale?: string;
    tags?: string[];
}
/** A code or design pattern used in the project. */
export interface Pattern {
    name: string;
    description: string;
    examples?: string[];
}
/** A recorded failure or error with optional resolution. */
export interface Failure {
    date: string;
    error: string;
    context?: string;
    resolution?: string;
}
/** Project-specific coding preferences and conventions. */
export interface Preferences {
    codeStyle?: Record<string, string>;
    conventions?: string[];
    avoidPatterns?: string[];
    preferredLibraries?: Record<string, string>;
}
/**
 * Load all project memory from the .goodvibes/memory directory.
 * Aggregates decisions, patterns, failures, preferences, and custom context.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to ProjectMemory with all persisted context
 *
 * @example
 * const memory = await loadMemory('/my-project');
 * if (memory.decisions.length > 0) {
 *   debug('Found project decisions:', memory.decisions);
 * }
 */
export declare function loadMemory(cwd: string): Promise<ProjectMemory>;
/**
 * Format project memory for display in context output.
 * Creates sections for decisions, patterns, failures, preferences, and custom context.
 *
 * @param memory - The ProjectMemory object to format
 * @returns Formatted string with memory sections, or null if no memory exists
 *
 * @example
 * const formatted = formatMemory(memory);
 * // Returns formatted sections with recent decisions, patterns, failures, and preferences
 */
export declare function formatMemory(memory: ProjectMemory): string | null;
