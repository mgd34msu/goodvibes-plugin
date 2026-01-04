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
 * Get the path to the .goodvibes directory
 */
export declare function getGoodVibesDir(cwd: string): string;
/**
 * Get the path to the memory directory
 */
export declare function getMemoryDir(cwd: string): string;
/**
 * Get the path to a specific memory file
 */
export declare function getMemoryFilePath(cwd: string, type: keyof typeof MEMORY_FILES): string;
/**
 * Ensure the .goodvibes directory exists (lazy creation)
 * Also ensures .gitignore has comprehensive security patterns
 */
export declare function ensureGoodVibesDir(cwd: string): void;
/**
 * Ensure the memory directory exists (lazy creation)
 */
export declare function ensureMemoryDir(cwd: string): void;
/**
 * Ensure .gitignore has comprehensive security patterns
 * Only adds patterns not already present
 */
export declare function ensureSecurityGitignore(cwd: string): void;
/**
 * Load all memory files from the .goodvibes/memory directory
 * This is the old API name, delegates to loadProjectMemory
 */
export declare function loadMemory(cwd: string): ProjectMemory;
/**
 * Loads all project memory (decisions, patterns, failures, preferences).
 */
export declare function loadProjectMemory(cwd: string): ProjectMemory;
/**
 * Append a new architectural decision to the decisions file
 */
export declare function appendDecision(cwd: string, decision: Decision): void;
/**
 * Append a new code pattern to the patterns file
 */
export declare function appendPattern(cwd: string, pattern: Pattern): void;
/**
 * Append a failed approach to the failures file
 */
export declare function appendFailure(cwd: string, failure: Failure): void;
/**
 * Append a user preference to the preferences file
 */
export declare function appendPreference(cwd: string, preference: Preference): void;
/**
 * Get current date in ISO format (YYYY-MM-DD)
 */
export declare function getCurrentDate(): string;
/**
 * Check if memory exists for a project
 */
export declare function hasMemory(cwd: string): boolean;
/**
 * Get a summary of the project memory
 */
export declare function getMemorySummary(cwd: string): {
    hasMemory: boolean;
    decisionsCount: number;
    patternsCount: number;
    failuresCount: number;
    preferencesCount: number;
};
/**
 * Search memory for relevant entries based on keywords
 */
export declare function searchMemory(cwd: string, keywords: string[]): {
    decisions: Decision[];
    patterns: Pattern[];
    failures: Failure[];
    preferences: Preference[];
};
/** Formats project memory into a human-readable context string. */
export declare function formatMemoryContext(memory: ProjectMemory): string;
