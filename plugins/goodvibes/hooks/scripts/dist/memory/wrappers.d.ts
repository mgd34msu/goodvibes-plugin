/**
 * Memory wrapper functions - backward compatibility layer.
 *
 * These functions provide a convenience API that ensures the memory directory
 * exists before writing. They add error handling and debug logging on top of
 * the core CRUD operations.
 */
import type { MemoryDecision, MemoryPattern, MemoryFailure, MemoryPreference } from '../types/memory.js';
/**
 * Append a new architectural decision (ensures directory exists).
 *
 * @param cwd - Current working directory
 * @param decision - Decision to append
 * @throws Error if directory creation or write fails
 */
export declare function appendDecision(cwd: string, decision: MemoryDecision): Promise<void>;
/**
 * Append a new code pattern (ensures directory exists).
 *
 * @param cwd - Current working directory
 * @param pattern - Pattern to append
 * @throws Error if directory creation or write fails
 */
export declare function appendPattern(cwd: string, pattern: MemoryPattern): Promise<void>;
/**
 * Append a failed approach (ensures directory exists).
 *
 * @param cwd - Current working directory
 * @param failure - Failure to append
 * @throws Error if directory creation or write fails
 */
export declare function appendFailure(cwd: string, failure: MemoryFailure): Promise<void>;
/**
 * Append a user preference (ensures directory exists).
 *
 * @param cwd - Current working directory
 * @param preference - Preference to append
 * @throws Error if directory creation or write fails
 */
export declare function appendPreference(cwd: string, preference: MemoryPreference): Promise<void>;
