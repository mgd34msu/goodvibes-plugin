/**
 * Memory module - aggregates all memory subsystems.
 * Provides backward compatibility with the old memory.ts API.
 */
export { GOODVIBES_DIR, MEMORY_DIR, MEMORY_FILES, getGoodVibesDir, getMemoryDir, getMemoryFilePath, } from './paths.js';
export type { MemoryFileType } from './paths.js';
export { fileExists, ensureGoodVibesDir, ensureMemoryDir, ensureSecurityGitignore, } from './directories.js';
export { readDecisions, writeDecision } from './decisions.js';
export { readPatterns, writePattern } from './patterns.js';
export { readFailures, writeFailure } from './failures.js';
export { readPreferences, writePreference } from './preferences.js';
export { loadProjectMemory, loadMemory, hasMemory, getMemorySummary, searchMemory, formatMemoryContext, getCurrentDate, } from './search.js';
import type { MemoryDecision, MemoryPattern, MemoryFailure, MemoryPreference, ProjectMemory } from '../types/memory.js';
export type { ProjectMemory };
export type Decision = MemoryDecision;
export type Pattern = MemoryPattern;
export type Failure = MemoryFailure;
export type Preference = MemoryPreference;
export { SECURITY_GITIGNORE_PATTERNS } from '../shared/security-patterns.js';
/** Append a new architectural decision (ensures directory exists). */
export declare function appendDecision(cwd: string, decision: Decision): Promise<void>;
/** Append a new code pattern (ensures directory exists). */
export declare function appendPattern(cwd: string, pattern: Pattern): Promise<void>;
/** Append a failed approach (ensures directory exists). */
export declare function appendFailure(cwd: string, failure: Failure): Promise<void>;
/** Append a user preference (ensures directory exists). */
export declare function appendPreference(cwd: string, preference: Preference): Promise<void>;
