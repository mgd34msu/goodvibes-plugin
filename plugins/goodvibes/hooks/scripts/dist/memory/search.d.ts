/**
 * Search and summary functions for project memory.
 */
import type { MemoryDecision, MemoryPattern, MemoryFailure, MemoryPreference } from '../types/memory.js';
import type { ProjectMemory } from '../types/memory.js';
/**
 * Loads all project memory (decisions, patterns, failures, preferences).
 * Returns empty arrays for any memory types that don't have files yet.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to ProjectMemory with all memory types loaded
 *
 * @example
 * const memory = await loadProjectMemory('/path/to/project');
 * console.log(memory.decisions.length, 'decisions loaded');
 */
export declare function loadProjectMemory(cwd: string): Promise<ProjectMemory>;
/**
 * Alias for loadProjectMemory for backward compatibility.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to ProjectMemory with all memory types loaded
 * @see {@link loadProjectMemory}
 */
export declare function loadMemory(cwd: string): Promise<ProjectMemory>;
/**
 * Checks if memory exists for a project.
 * Determines whether the .goodvibes/memory directory exists.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to true if memory directory exists
 *
 * @example
 * if (await hasMemory(cwd)) {
 *   const memory = await loadMemory(cwd);
 * }
 */
export declare function hasMemory(cwd: string): Promise<boolean>;
/**
 * Gets a summary of the project memory with counts for each type.
 * Useful for quick status checks without loading full memory content.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to memory summary with counts
 *
 * @example
 * const summary = await getMemorySummary(cwd);
 * console.log(`${summary.decisionsCount} decisions, ${summary.failuresCount} failures`);
 */
export declare function getMemorySummary(cwd: string): Promise<{
    hasMemory: boolean;
    decisionsCount: number;
    patternsCount: number;
    failuresCount: number;
    preferencesCount: number;
}>;
/**
 * Searches memory for entries matching any of the provided keywords (case-insensitive).
 * Returns filtered subsets of each memory type containing only matching entries.
 *
 * @param cwd - The current working directory (project root)
 * @param keywords - Array of keywords to search for (case-insensitive)
 * @returns Promise resolving to filtered memory containing only matching entries
 *
 * @example
 * const results = await searchMemory(cwd, ['authentication', 'login']);
 * console.log(`Found ${results.decisions.length} related decisions`);
 */
export declare function searchMemory(cwd: string, keywords: string[]): Promise<{
    decisions: MemoryDecision[];
    patterns: MemoryPattern[];
    failures: MemoryFailure[];
    preferences: MemoryPreference[];
}>;
/**
 * Formats project memory into a human-readable context string.
 * Limits output to recent entries (5 decisions, 3 patterns, 3 failures).
 *
 * @param memory - The ProjectMemory object to format
 * @returns Formatted string suitable for context injection, or empty string if no memory
 *
 * @example
 * const memory = await loadMemory(cwd);
 * const contextStr = formatMemoryContext(memory);
 * // Returns: "Previous Decisions:\n- Decision 1 (rationale)..."
 */
export declare function formatMemoryContext(memory: ProjectMemory): string;
/**
 * Gets the current date in ISO format (YYYY-MM-DD).
 * Used for timestamping memory entries.
 *
 * @returns Current date string in YYYY-MM-DD format
 *
 * @example
 * const date = getCurrentDate();
 * // Returns: "2024-01-15"
 */
export declare function getCurrentDate(): string;
