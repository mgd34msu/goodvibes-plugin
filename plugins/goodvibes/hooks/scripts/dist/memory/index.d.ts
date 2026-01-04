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
 * @throws Error if the directory cannot be created
 *
 * @example
 * ensureGoodVibesDir('/path/to/project');
 */
export declare function ensureGoodVibesDir(cwd: string): void;
/**
 * Ensure the memory directory exists (lazy creation).
 *
 * Creates the memory directory within .goodvibes if it doesn't exist.
 * Also ensures the parent .goodvibes directory exists.
 *
 * @param cwd - The current working directory (project root)
 * @throws Error if the directory cannot be created
 *
 * @example
 * ensureMemoryDir('/path/to/project');
 */
export declare function ensureMemoryDir(cwd: string): void;
/**
 * Ensure .gitignore has comprehensive security patterns.
 *
 * Checks the project's .gitignore file and adds any missing security
 * patterns to prevent sensitive files from being committed. Only adds
 * patterns that are not already present.
 *
 * @param cwd - The current working directory (project root)
 *
 * @example
 * ensureSecurityGitignore('/path/to/project');
 */
export declare function ensureSecurityGitignore(cwd: string): void;
/**
 * Load all memory files from the .goodvibes/memory directory.
 *
 * This is the backward-compatible API that delegates to loadProjectMemory.
 * Loads decisions, patterns, failures, and preferences from disk.
 *
 * @param cwd - The current working directory (project root)
 * @returns The complete ProjectMemory object with all memory categories
 *
 * @example
 * const memory = loadMemory('/path/to/project');
 * console.log(`Found ${memory.decisions.length} decisions`);
 */
export declare function loadMemory(cwd: string): ProjectMemory;
/**
 * Loads all project memory (decisions, patterns, failures, preferences).
 *
 * Reads all memory files from disk and returns them as a unified ProjectMemory object.
 * Returns empty arrays for any memory types that don't have files yet.
 *
 * @param cwd - The current working directory (project root)
 * @returns The complete ProjectMemory object with all memory categories
 *
 * @example
 * const memory = loadProjectMemory('/path/to/project');
 * if (memory.failures.length > 0) {
 *   console.log('Avoid these approaches:', memory.failures);
 * }
 */
export declare function loadProjectMemory(cwd: string): ProjectMemory;
/**
 * Append a new architectural decision to the decisions file.
 *
 * Ensures the memory directory exists and appends the decision to the
 * decisions.md file. Used to record architectural choices with rationale.
 *
 * @param cwd - The current working directory (project root)
 * @param decision - The decision object containing title, rationale, alternatives, etc.
 * @throws Error if the decision cannot be written
 *
 * @example
 * appendDecision('/path/to/project', {
 *   title: 'Use PostgreSQL',
 *   date: '2024-01-04',
 *   rationale: 'Better suited for relational data',
 *   alternatives: ['MongoDB', 'SQLite']
 * });
 */
export declare function appendDecision(cwd: string, decision: Decision): void;
/**
 * Append a new code pattern to the patterns file.
 *
 * Ensures the memory directory exists and appends the pattern to the
 * patterns.md file. Used to document established coding patterns in the project.
 *
 * @param cwd - The current working directory (project root)
 * @param pattern - The pattern object containing name, description, example, etc.
 * @throws Error if the pattern cannot be written
 *
 * @example
 * appendPattern('/path/to/project', {
 *   name: 'Error Handling',
 *   date: '2024-01-04',
 *   description: 'Use try-catch with specific error types',
 *   example: 'try { ... } catch (error: unknown) { ... }'
 * });
 */
export declare function appendPattern(cwd: string, pattern: Pattern): void;
/**
 * Append a failed approach to the failures file.
 *
 * Ensures the memory directory exists and appends the failure to the
 * failures.md file. Used to document approaches that didn't work to avoid repeating them.
 *
 * @param cwd - The current working directory (project root)
 * @param failure - The failure object containing approach, reason, context, etc.
 * @throws Error if the failure cannot be written
 *
 * @example
 * appendFailure('/path/to/project', {
 *   approach: 'Using global state for auth',
 *   date: '2024-01-04',
 *   reason: 'Caused race conditions in concurrent requests',
 *   suggestion: 'Use context-based auth instead'
 * });
 */
export declare function appendFailure(cwd: string, failure: Failure): void;
/**
 * Append a user preference to the preferences file.
 *
 * Ensures the memory directory exists and appends the preference to the
 * preferences.md file. Used to store user-defined settings and preferences.
 *
 * @param cwd - The current working directory (project root)
 * @param preference - The preference object containing key, value, date, and optional notes
 * @throws Error if the preference cannot be written
 *
 * @example
 * appendPreference('/path/to/project', {
 *   key: 'test-framework',
 *   value: 'vitest',
 *   date: '2024-01-04',
 *   notes: 'Faster than Jest for this project'
 * });
 */
export declare function appendPreference(cwd: string, preference: Preference): void;
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
 * @returns True if the memory directory exists, false otherwise
 *
 * @example
 * if (hasMemory('/path/to/project')) {
 *   const memory = loadMemory('/path/to/project');
 * }
 */
export declare function hasMemory(cwd: string): boolean;
/**
 * Get a summary of the project memory.
 *
 * Returns counts of each memory type without loading the full content.
 * Useful for quickly checking what memory exists for a project.
 *
 * @param cwd - The current working directory (project root)
 * @returns An object containing hasMemory flag and counts for each memory type
 *
 * @example
 * const summary = getMemorySummary('/path/to/project');
 * console.log(`Project has ${summary.decisionsCount} decisions`);
 */
export declare function getMemorySummary(cwd: string): {
    hasMemory: boolean;
    decisionsCount: number;
    patternsCount: number;
    failuresCount: number;
    preferencesCount: number;
};
/**
 * Search memory for relevant entries based on keywords.
 *
 * Searches all memory categories for entries that match any of the provided
 * keywords. Searches are case-insensitive and match against titles, descriptions,
 * rationale, and other text fields.
 *
 * @param cwd - The current working directory (project root)
 * @param keywords - Array of keywords to search for
 * @returns Filtered memory entries matching the search keywords
 *
 * @example
 * const results = searchMemory('/path/to/project', ['auth', 'login']);
 * console.log(`Found ${results.decisions.length} relevant decisions`);
 */
export declare function searchMemory(cwd: string, keywords: string[]): {
    decisions: Decision[];
    patterns: Pattern[];
    failures: Failure[];
    preferences: Preference[];
};
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
 * const memory = loadMemory('/path/to/project');
 * const context = formatMemoryContext(memory);
 * console.log(context);
 */
export declare function formatMemoryContext(memory: ProjectMemory): string;
