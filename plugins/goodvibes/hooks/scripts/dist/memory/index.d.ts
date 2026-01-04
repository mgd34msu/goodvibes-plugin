/**
 * Memory module - aggregates all memory subsystems.
 *
 * This module provides backward compatibility with the old memory.ts API
 * while delegating to the new modular implementation.
 */
import type { ProjectMemory } from '../types/memory.js';
import { SECURITY_GITIGNORE_PATTERNS } from '../shared/security-patterns.js';
export * from './decisions.js';
export * from './patterns.js';
export * from './failures.js';
export * from './preferences.js';
import type { MemoryDecision, MemoryPattern, MemoryFailure, MemoryPreference } from '../types/memory.js';
export type Decision = MemoryDecision;
export type Pattern = MemoryPattern;
export type Failure = MemoryFailure;
export type Preference = MemoryPreference;
export type { ProjectMemory };
export { SECURITY_GITIGNORE_PATTERNS };
declare const MEMORY_FILES: {
    readonly decisions: "decisions.md";
    readonly patterns: "patterns.md";
    readonly failures: "failures.md";
    readonly preferences: "preferences.md";
};
/**
 * Get the path to the .goodvibes directory.
 *
 * Constructs the absolute path to the .goodvibes configuration directory
 * within the specified project root.
 *
 * @param cwd - The current working directory (project root)
 * @returns The absolute path to the .goodvibes directory
 *
 * @example
 * const dir = getGoodVibesDir('/path/to/project');
 * // Returns: '/path/to/project/.goodvibes'
 */
export declare function getGoodVibesDir(cwd: string): string;
/**
 * Get the path to the memory directory.
 *
 * Constructs the absolute path to the memory storage directory
 * within the .goodvibes configuration directory.
 *
 * @param cwd - The current working directory (project root)
 * @returns The absolute path to the memory directory
 *
 * @example
 * const dir = getMemoryDir('/path/to/project');
 * // Returns: '/path/to/project/.goodvibes/memory'
 */
export declare function getMemoryDir(cwd: string): string;
/**
 * Get the path to a specific memory file.
 *
 * Constructs the absolute path to a specific memory file (decisions, patterns,
 * failures, or preferences) within the memory directory.
 *
 * @param cwd - The current working directory (project root)
 * @param type - The type of memory file ('decisions' | 'patterns' | 'failures' | 'preferences')
 * @returns The absolute path to the specified memory file
 *
 * @example
 * const path = getMemoryFilePath('/path/to/project', 'decisions');
 * // Returns: '/path/to/project/.goodvibes/memory/decisions.md'
 */
export declare function getMemoryFilePath(cwd: string, type: keyof typeof MEMORY_FILES): string;
/**
 * Ensure the .goodvibes directory exists (lazy creation).
 *
 * Creates the .goodvibes directory if it doesn't exist, and ensures
 * that comprehensive security patterns are added to .gitignore to
 * prevent sensitive data from being committed.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise that resolves when the directory is ensured
 * @throws Error if the directory cannot be created
 *
 * @example
 * await ensureGoodVibesDir('/path/to/project');
 */
export declare function ensureGoodVibesDir(cwd: string): Promise<void>;
/**
 * Ensure the memory directory exists (lazy creation).
 *
 * Creates the memory directory within .goodvibes if it doesn't exist.
 * Also ensures the parent .goodvibes directory exists.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise that resolves when the directory is ensured
 * @throws Error if the directory cannot be created
 *
 * @example
 * await ensureMemoryDir('/path/to/project');
 */
export declare function ensureMemoryDir(cwd: string): Promise<void>;
/**
 * Ensure .gitignore has comprehensive security patterns.
 *
 * Checks the project's .gitignore file and adds any missing security
 * patterns to prevent sensitive files from being committed. Only adds
 * patterns that are not already present.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise that resolves when the gitignore is ensured
 *
 * @example
 * await ensureSecurityGitignore('/path/to/project');
 */
export declare function ensureSecurityGitignore(cwd: string): Promise<void>;
/**
 * Load all memory files from the .goodvibes/memory directory.
 *
 * This is the backward-compatible API that delegates to loadProjectMemory.
 * Loads decisions, patterns, failures, and preferences from disk.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to the complete ProjectMemory object with all memory categories
 *
 * @example
 * const memory = await loadMemory('/path/to/project');
 * console.log(`Found ${memory.decisions.length} decisions`);
 */
export declare function loadMemory(cwd: string): Promise<ProjectMemory>;
/**
 * Loads all project memory (decisions, patterns, failures, preferences).
 *
 * Reads all memory files from disk and returns them as a unified ProjectMemory object.
 * Returns empty arrays for any memory types that don't have files yet.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to the complete ProjectMemory object with all memory categories
 *
 * @example
 * const memory = await loadProjectMemory('/path/to/project');
 * if (memory.failures.length > 0) {
 *   console.log('Avoid these approaches:', memory.failures);
 * }
 */
export declare function loadProjectMemory(cwd: string): Promise<ProjectMemory>;
/**
 * Append a new architectural decision to the decisions file.
 *
 * Ensures the memory directory exists and appends the decision to the
 * decisions.md file. Used to record architectural choices with rationale.
 *
 * @param cwd - The current working directory (project root)
 * @param decision - The decision object containing title, rationale, alternatives, etc.
 * @returns Promise that resolves when the decision is appended
 * @throws Error if the decision cannot be written
 *
 * @example
 * await appendDecision('/path/to/project', {
 *   title: 'Use PostgreSQL',
 *   date: '2024-01-04',
 *   rationale: 'Better suited for relational data',
 *   alternatives: ['MongoDB', 'SQLite']
 * });
 */
export declare function appendDecision(cwd: string, decision: Decision): Promise<void>;
/**
 * Append a new code pattern to the patterns file.
 *
 * Ensures the memory directory exists and appends the pattern to the
 * patterns.md file. Used to document established coding patterns in the project.
 *
 * @param cwd - The current working directory (project root)
 * @param pattern - The pattern object containing name, description, example, etc.
 * @returns Promise that resolves when the pattern is appended
 * @throws Error if the pattern cannot be written
 *
 * @example
 * await appendPattern('/path/to/project', {
 *   name: 'Error Handling',
 *   date: '2024-01-04',
 *   description: 'Use try-catch with specific error types',
 *   example: 'try { ... } catch (error: unknown) { ... }'
 * });
 */
export declare function appendPattern(cwd: string, pattern: Pattern): Promise<void>;
/**
 * Append a failed approach to the failures file.
 *
 * Ensures the memory directory exists and appends the failure to the
 * failures.md file. Used to document approaches that didn't work to avoid repeating them.
 *
 * @param cwd - The current working directory (project root)
 * @param failure - The failure object containing approach, reason, context, etc.
 * @returns Promise that resolves when the failure is appended
 * @throws Error if the failure cannot be written
 *
 * @example
 * await appendFailure('/path/to/project', {
 *   approach: 'Using global state for auth',
 *   date: '2024-01-04',
 *   reason: 'Caused race conditions in concurrent requests',
 *   suggestion: 'Use context-based auth instead'
 * });
 */
export declare function appendFailure(cwd: string, failure: Failure): Promise<void>;
/**
 * Append a user preference to the preferences file.
 *
 * Ensures the memory directory exists and appends the preference to the
 * preferences.md file. Used to store user-defined settings and preferences.
 *
 * @param cwd - The current working directory (project root)
 * @param preference - The preference object containing key, value, date, and optional notes
 * @returns Promise that resolves when the preference is appended
 * @throws Error if the preference cannot be written
 *
 * @example
 * await appendPreference('/path/to/project', {
 *   key: 'test-framework',
 *   value: 'vitest',
 *   date: '2024-01-04',
 *   notes: 'Faster than Jest for this project'
 * });
 */
export declare function appendPreference(cwd: string, preference: Preference): Promise<void>;
/**
 * Get current date in ISO format (YYYY-MM-DD).
 *
 * Returns the current date formatted as an ISO date string without the time component.
 *
 * @returns The current date in YYYY-MM-DD format
 *
 * @example
 * const date = getCurrentDate();
 * // Returns: '2024-01-04'
 */
export declare function getCurrentDate(): string;
/**
 * Check if memory exists for a project.
 *
 * Determines whether the memory directory exists for the given project,
 * indicating that memory has been initialized.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to true if the memory directory exists, false otherwise
 *
 * @example
 * if (await hasMemory('/path/to/project')) {
 *   const memory = await loadMemory('/path/to/project');
 * }
 */
export declare function hasMemory(cwd: string): Promise<boolean>;
/**
 * Get a summary of the project memory.
 *
 * Returns counts of each memory type without loading the full content.
 * Useful for quickly checking what memory exists for a project.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to an object containing hasMemory flag and counts for each memory type
 *
 * @example
 * const summary = await getMemorySummary('/path/to/project');
 * console.log(`Project has ${summary.decisionsCount} decisions`);
 */
export declare function getMemorySummary(cwd: string): Promise<{
    hasMemory: boolean;
    decisionsCount: number;
    patternsCount: number;
    failuresCount: number;
    preferencesCount: number;
}>;
/**
 * Search memory for relevant entries based on keywords.
 *
 * Searches all memory categories for entries that match any of the provided
 * keywords. Searches are case-insensitive and match against titles, descriptions,
 * rationale, and other text fields.
 *
 * @param cwd - The current working directory (project root)
 * @param keywords - Array of keywords to search for
 * @returns Promise resolving to filtered memory entries matching the search keywords
 *
 * @example
 * const results = await searchMemory('/path/to/project', ['auth', 'login']);
 * console.log(`Found ${results.decisions.length} relevant decisions`);
 */
export declare function searchMemory(cwd: string, keywords: string[]): Promise<{
    decisions: Decision[];
    patterns: Pattern[];
    failures: Failure[];
    preferences: Preference[];
}>;
/**
 * Formats project memory into a human-readable context string.
 *
 * Converts the structured memory data into a formatted text block suitable
 * for including in prompts or displaying to users. Limits output to recent
 * entries (5 decisions, 3 patterns, 3 failures) to avoid overwhelming context.
 *
 * @param memory - The ProjectMemory object to format
 * @returns A formatted string representation of the memory
 *
 * @example
 * const memory = await loadMemory('/path/to/project');
 * const context = formatMemoryContext(memory);
 * console.log(context);
 */
export declare function formatMemoryContext(memory: ProjectMemory): string;
