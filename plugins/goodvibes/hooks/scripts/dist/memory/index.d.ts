/**
 * Memory module - aggregates all memory subsystems.
 */
export * from './decisions.js';
export * from './patterns.js';
export * from './failures.js';
export * from './preferences.js';
import type { ProjectMemory } from '../types/memory.js';
/** Loads all project memory (decisions, patterns, failures, preferences). */
export declare function loadProjectMemory(cwd: string): ProjectMemory;
/** Formats project memory into a human-readable context string. */
export declare function formatMemoryContext(memory: ProjectMemory): string;
