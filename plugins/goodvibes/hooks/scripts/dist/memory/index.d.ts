/**
 * Memory module - aggregates all memory subsystems.
 * Provides backward compatibility with the old memory.ts API.
 */
export { GOODVIBES_DIR, MEMORY_DIR, MEMORY_FILES, getGoodVibesDir, getMemoryDir, getMemoryFilePath, } from './paths.js';
/** Memory file type enumeration for different memory categories */
export type { MemoryFileType } from './paths.js';
export { fileExists, ensureMemoryDir, ensureSecurityGitignore, } from './directories.js';
export { ensureGoodVibesDir } from '../shared/index.js';
export { readDecisions, writeDecision } from './decisions.js';
export { readPatterns, writePattern } from './patterns.js';
export { readFailures, writeFailure } from './failures.js';
export { readPreferences, writePreference } from './preferences.js';
export { loadProjectMemory, loadMemory, hasMemory, getMemorySummary, searchMemory, formatMemoryContext, getCurrentDate, } from './search.js';
import type { MemoryDecision, MemoryPattern, MemoryFailure, MemoryPreference, ProjectMemory } from '../types/memory.js';
/** Aggregated project memory containing all memory types */
export type { ProjectMemory };
/** Architectural decision record type alias */
export type Decision = MemoryDecision;
/** Code pattern record type alias */
export type Pattern = MemoryPattern;
/** Failed approach record type alias */
export type Failure = MemoryFailure;
/** User preference record type alias */
export type Preference = MemoryPreference;
export { SECURITY_GITIGNORE_PATTERNS } from '../shared/security-patterns.js';
export { appendDecision, appendPattern, appendFailure, appendPreference, } from './wrappers.js';
