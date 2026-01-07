/**
 * Search and summary functions for project memory.
 */
import type { MemoryDecision, MemoryPattern, MemoryFailure, MemoryPreference } from '../types/memory.js';
import type { ProjectMemory } from '../types/memory.js';
/**
 * Loads all project memory (decisions, patterns, failures, preferences).
 * Returns empty arrays for any memory types that don't have files yet.
 */
export declare function loadProjectMemory(cwd: string): Promise<ProjectMemory>;
/** Alias for loadProjectMemory for backward compatibility. */
export declare function loadMemory(cwd: string): Promise<ProjectMemory>;
/** Check if memory exists for a project. */
export declare function hasMemory(cwd: string): Promise<boolean>;
/** Get a summary of the project memory with counts for each type. */
export declare function getMemorySummary(cwd: string): Promise<{
    hasMemory: boolean;
    decisionsCount: number;
    patternsCount: number;
    failuresCount: number;
    preferencesCount: number;
}>;
/** Search memory for entries matching any of the provided keywords (case-insensitive). */
export declare function searchMemory(cwd: string, keywords: string[]): Promise<{
    decisions: MemoryDecision[];
    patterns: MemoryPattern[];
    failures: MemoryFailure[];
    preferences: MemoryPreference[];
}>;
/**
 * Formats project memory into a human-readable context string.
 * Limits output to recent entries (5 decisions, 3 patterns, 3 failures).
 */
export declare function formatMemoryContext(memory: ProjectMemory): string;
/** Get current date in ISO format (YYYY-MM-DD). */
export declare function getCurrentDate(): string;
