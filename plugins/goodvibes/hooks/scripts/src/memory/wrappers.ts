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
import type {
  MemoryDecision,
  MemoryPattern,
  MemoryFailure,
  MemoryPreference,
} from '../types/memory.js';

/**
 * Append a new architectural decision (ensures directory exists).
 *
 * @param cwd - Current working directory
 * @param decision - Decision to append
 * @throws Error if directory creation or write fails
 */
export async function appendDecision(
  cwd: string,
  decision: MemoryDecision
): Promise<void> {
  try {
    await ensureMemoryDir(cwd);
    await writeDecision(cwd, decision);
    debug(`Appended decision: ${decision.title}`);
  } catch (error: unknown) {
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
export async function appendPattern(
  cwd: string,
  pattern: MemoryPattern
): Promise<void> {
  try {
    await ensureMemoryDir(cwd);
    await writePattern(cwd, pattern);
    debug(`Appended pattern: ${pattern.name}`);
  } catch (error: unknown) {
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
export async function appendFailure(
  cwd: string,
  failure: MemoryFailure
): Promise<void> {
  try {
    await ensureMemoryDir(cwd);
    await writeFailure(cwd, failure);
    debug(`Appended failure: ${failure.approach}`);
  } catch (error: unknown) {
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
export async function appendPreference(
  cwd: string,
  preference: MemoryPreference
): Promise<void> {
  try {
    await ensureMemoryDir(cwd);
    await writePreference(cwd, preference);
    debug(`Appended preference: ${preference.key}`);
  } catch (error: unknown) {
    logError('appendPreference', error);
    throw error;
  }
}
