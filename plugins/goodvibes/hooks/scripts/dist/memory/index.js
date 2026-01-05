/**
 * Memory module - aggregates all memory subsystems.
 * Provides backward compatibility with the old memory.ts API.
 */
// Path utilities
export { GOODVIBES_DIR, MEMORY_DIR, MEMORY_FILES, getGoodVibesDir, getMemoryDir, getMemoryFilePath, } from './paths.js';
// Directory management
export { fileExists, ensureMemoryDir, ensureSecurityGitignore, } from './directories.js';
// Re-export ensureGoodVibesDir from shared (canonical implementation)
export { ensureGoodVibesDir } from '../shared/index.js';
// CRUD modules
export { readDecisions, writeDecision } from './decisions.js';
export { readPatterns, writePattern } from './patterns.js';
export { readFailures, writeFailure } from './failures.js';
export { readPreferences, writePreference } from './preferences.js';
// Search and utilities
export { loadProjectMemory, loadMemory, hasMemory, getMemorySummary, searchMemory, formatMemoryContext, getCurrentDate, } from './search.js';
// Re-export security patterns for backward compatibility
export { SECURITY_GITIGNORE_PATTERNS } from '../shared/security-patterns.js';
// Backward compatibility wrappers
import { debug, logError } from '../shared/index.js';
import { ensureMemoryDir } from './directories.js';
import { writeDecision } from './decisions.js';
import { writePattern } from './patterns.js';
import { writeFailure } from './failures.js';
import { writePreference } from './preferences.js';
/** Append a new architectural decision (ensures directory exists). */
export async function appendDecision(cwd, decision) {
    try {
        await ensureMemoryDir(cwd);
        await writeDecision(cwd, decision);
        debug(`Appended decision: ${decision.title}`);
    }
    catch (error) {
        logError('appendDecision', error);
        throw error;
    }
}
/** Append a new code pattern (ensures directory exists). */
export async function appendPattern(cwd, pattern) {
    try {
        await ensureMemoryDir(cwd);
        await writePattern(cwd, pattern);
        debug(`Appended pattern: ${pattern.name}`);
    }
    catch (error) {
        logError('appendPattern', error);
        throw error;
    }
}
/** Append a failed approach (ensures directory exists). */
export async function appendFailure(cwd, failure) {
    try {
        await ensureMemoryDir(cwd);
        await writeFailure(cwd, failure);
        debug(`Appended failure: ${failure.approach}`);
    }
    catch (error) {
        logError('appendFailure', error);
        throw error;
    }
}
/** Append a user preference (ensures directory exists). */
export async function appendPreference(cwd, preference) {
    try {
        await ensureMemoryDir(cwd);
        await writePreference(cwd, preference);
        debug(`Appended preference: ${preference.key}`);
    }
    catch (error) {
        logError('appendPreference', error);
        throw error;
    }
}
