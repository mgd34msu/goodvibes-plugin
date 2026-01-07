/**
 * Memory wrapper functions - backward compatibility layer.
 *
 * These functions provide a convenience API that ensures the memory directory
 * exists before writing. They add error handling and debug logging on top of
 * the core CRUD operations.
 */
import { debug, logError } from '../shared/index.js';
import { ensureMemoryDir } from './directories.js';
import { writeDecision } from './decisions.js';
import { writePattern } from './patterns.js';
import { writeFailure } from './failures.js';
import { writePreference } from './preferences.js';
/**
 * Append a new architectural decision (ensures directory exists).
 *
 * @param cwd - Current working directory
 * @param decision - Decision to append
 * @throws Error if directory creation or write fails
 */
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
/**
 * Append a new code pattern (ensures directory exists).
 *
 * @param cwd - Current working directory
 * @param pattern - Pattern to append
 * @throws Error if directory creation or write fails
 */
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
/**
 * Append a failed approach (ensures directory exists).
 *
 * @param cwd - Current working directory
 * @param failure - Failure to append
 * @throws Error if directory creation or write fails
 */
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
/**
 * Append a user preference (ensures directory exists).
 *
 * @param cwd - Current working directory
 * @param preference - Preference to append
 * @throws Error if directory creation or write fails
 */
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
