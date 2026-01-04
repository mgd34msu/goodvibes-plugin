/**
 * Memory module - aggregates all memory subsystems.
 *
 * This module provides backward compatibility with the old memory.ts API
 * while delegating to the new modular implementation.
 */
import * as fs from 'fs';
import * as path from 'path';
import { debug, logError } from '../shared.js';
import { readDecisions, writeDecision } from './decisions.js';
import { readPatterns, writePattern } from './patterns.js';
import { readFailures, writeFailure } from './failures.js';
import { readPreferences, writePreference } from './preferences.js';
import { SECURITY_GITIGNORE_PATTERNS } from '../shared/security-patterns.js';
// Re-export all types from the individual modules
export * from './decisions.js';
export * from './patterns.js';
export * from './failures.js';
export * from './preferences.js';
// Re-export SECURITY_GITIGNORE_PATTERNS for backward compatibility
export { SECURITY_GITIGNORE_PATTERNS };
// ============================================================================
// Constants
// ============================================================================
const GOODVIBES_DIR = '.goodvibes';
const MEMORY_DIR = 'memory';
const MEMORY_FILES = {
    decisions: 'decisions.md',
    patterns: 'patterns.md',
    failures: 'failures.md',
    preferences: 'preferences.md',
};
// ============================================================================
// Path Utilities
// ============================================================================
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
export function getGoodVibesDir(cwd) {
    return path.join(cwd, GOODVIBES_DIR);
}
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
export function getMemoryDir(cwd) {
    return path.join(cwd, GOODVIBES_DIR, MEMORY_DIR);
}
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
export function getMemoryFilePath(cwd, type) {
    return path.join(getMemoryDir(cwd), MEMORY_FILES[type]);
}
// ============================================================================
// Directory Management (Lazy Creation)
// ============================================================================
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
export function ensureGoodVibesDir(cwd) {
    const goodVibesDir = getGoodVibesDir(cwd);
    try {
        if (!fs.existsSync(goodVibesDir)) {
            fs.mkdirSync(goodVibesDir, { recursive: true });
            debug(`Created .goodvibes directory at ${goodVibesDir}`);
        }
    }
    catch (error) {
        logError('ensureGoodVibesDir:mkdir', error);
        throw new Error(`Failed to create .goodvibes directory: ${error}`);
    }
    // Ensure security-hardened .gitignore
    ensureSecurityGitignore(cwd);
}
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
export function ensureMemoryDir(cwd) {
    ensureGoodVibesDir(cwd);
    const memoryDir = getMemoryDir(cwd);
    try {
        if (!fs.existsSync(memoryDir)) {
            fs.mkdirSync(memoryDir, { recursive: true });
            debug(`Created memory directory at ${memoryDir}`);
        }
    }
    catch (error) {
        logError('ensureMemoryDir:mkdir', error);
        throw new Error(`Failed to create memory directory: ${error}`);
    }
}
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
export function ensureSecurityGitignore(cwd) {
    const gitignorePath = path.join(cwd, '.gitignore');
    try {
        let existingContent = '';
        if (fs.existsSync(gitignorePath)) {
            existingContent = fs.readFileSync(gitignorePath, 'utf-8');
        }
        // Parse security patterns into individual lines
        const securityLines = SECURITY_GITIGNORE_PATTERNS.split('\n')
            .map((line) => line.trim())
            .filter((line) => line && !line.startsWith('#'));
        // Parse existing patterns
        const existingPatterns = new Set(existingContent
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line && !line.startsWith('#')));
        // Find patterns that need to be added
        const patternsToAdd = securityLines.filter((pattern) => !existingPatterns.has(pattern));
        if (patternsToAdd.length === 0) {
            debug('.gitignore already has all security patterns');
            return;
        }
        // Build only the missing patterns to append
        const separator = existingContent.endsWith('\n') ? '' : '\n';
        const newPatternsBlock = '\n# GoodVibes Security Patterns\n' + patternsToAdd.join('\n') + '\n';
        // Write the updated .gitignore
        fs.writeFileSync(gitignorePath, existingContent + separator + newPatternsBlock);
        debug(`Added ${patternsToAdd.length} security patterns to .gitignore`);
    }
    catch (error) {
        logError('ensureSecurityGitignore', error);
        // Don't throw - gitignore is non-critical
    }
}
// ============================================================================
// Backward Compatibility API - Delegates to New Modular Implementation
// ============================================================================
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
export function loadMemory(cwd) {
    return loadProjectMemory(cwd);
}
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
export function loadProjectMemory(cwd) {
    return {
        decisions: readDecisions(cwd),
        patterns: readPatterns(cwd),
        failures: readFailures(cwd),
        preferences: readPreferences(cwd),
    };
}
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
export function appendDecision(cwd, decision) {
    try {
        ensureMemoryDir(cwd);
        writeDecision(cwd, decision);
        debug(`Appended decision: ${decision.title}`);
    }
    catch (error) {
        logError('appendDecision', error);
        throw error;
    }
}
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
export function appendPattern(cwd, pattern) {
    try {
        ensureMemoryDir(cwd);
        writePattern(cwd, pattern);
        debug(`Appended pattern: ${pattern.name}`);
    }
    catch (error) {
        logError('appendPattern', error);
        throw error;
    }
}
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
export function appendFailure(cwd, failure) {
    try {
        ensureMemoryDir(cwd);
        writeFailure(cwd, failure);
        debug(`Appended failure: ${failure.approach}`);
    }
    catch (error) {
        logError('appendFailure', error);
        throw error;
    }
}
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
export function appendPreference(cwd, preference) {
    try {
        ensureMemoryDir(cwd);
        writePreference(cwd, preference);
        debug(`Appended preference: ${preference.key}`);
    }
    catch (error) {
        logError('appendPreference', error);
        throw error;
    }
}
// ============================================================================
// Utility Functions
// ============================================================================
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
export function getCurrentDate() {
    return new Date().toISOString().split('T')[0] ?? '';
}
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
export function hasMemory(cwd) {
    return fs.existsSync(getMemoryDir(cwd));
}
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
export function getMemorySummary(cwd) {
    if (!hasMemory(cwd)) {
        return {
            hasMemory: false,
            decisionsCount: 0,
            patternsCount: 0,
            failuresCount: 0,
            preferencesCount: 0,
        };
    }
    const memory = loadMemory(cwd);
    return {
        hasMemory: true,
        decisionsCount: memory.decisions.length,
        patternsCount: memory.patterns.length,
        failuresCount: memory.failures.length,
        preferencesCount: memory.preferences.length,
    };
}
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
export function searchMemory(cwd, keywords) {
    const memory = loadMemory(cwd);
    const lowerKeywords = keywords.map((k) => k.toLowerCase());
    const matchesKeywords = (text) => {
        const lowerText = text.toLowerCase();
        return lowerKeywords.some((keyword) => lowerText.includes(keyword));
    };
    return {
        decisions: memory.decisions.filter((d) => matchesKeywords(d.title) ||
            matchesKeywords(d.rationale) ||
            (d.context && matchesKeywords(d.context)) ||
            (d.alternatives && d.alternatives.some(matchesKeywords))),
        patterns: memory.patterns.filter((p) => matchesKeywords(p.name) ||
            matchesKeywords(p.description) ||
            (p.example && matchesKeywords(p.example)) ||
            (p.files && p.files.some(matchesKeywords))),
        failures: memory.failures.filter((f) => matchesKeywords(f.approach) ||
            matchesKeywords(f.reason) ||
            (f.context && matchesKeywords(f.context)) ||
            (f.suggestion && matchesKeywords(f.suggestion))),
        preferences: memory.preferences.filter((p) => matchesKeywords(p.key) ||
            matchesKeywords(p.value) ||
            (p.notes && matchesKeywords(p.notes))),
    };
}
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
export function formatMemoryContext(memory) {
    const parts = [];
    if (memory.decisions.length > 0) {
        parts.push('Previous Decisions:');
        for (const d of memory.decisions.slice(-5)) {
            parts.push(`- ${d.title} (${d.rationale})`);
        }
    }
    if (memory.patterns.length > 0) {
        parts.push('\nEstablished Patterns:');
        for (const p of memory.patterns.slice(-3)) {
            const desc = p.description.length > 60 ? p.description.substring(0, 60) + '...' : p.description;
            parts.push(`- ${p.name}: ${desc}`);
        }
    }
    if (memory.failures.length > 0) {
        parts.push('\nKnown Failures (avoid):');
        for (const f of memory.failures.slice(-3)) {
            parts.push(`- ${f.approach}: ${f.reason}`);
        }
    }
    return parts.join('\n');
}
