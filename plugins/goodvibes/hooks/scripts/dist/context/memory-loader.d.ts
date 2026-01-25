/**
 * Memory Loader
 *
 * Loads persisted context from .goodvibes/memory/ directory.
 * Uses the core Memory class at runtime via dynamic import to avoid tsconfig issues.
 * This provides a unified interface to memory across the system.
 */
import type { Decision, Pattern, Failure } from '../types/memory.js';
export type { Decision, Pattern, Failure };
/** Aggregated project memory including decisions, patterns, and preferences. */
export interface ProjectMemory {
    decisions: Decision[];
    patterns: Pattern[];
    failures: Failure[];
    preferences: Preferences;
    customContext: string[];
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
 * Uses the core Memory class for decisions, patterns, and failures via dynamic import.
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
