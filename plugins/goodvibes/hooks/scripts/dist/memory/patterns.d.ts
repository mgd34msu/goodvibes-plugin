/**
 * Patterns memory module - stores project-specific code patterns.
 */
import type { MemoryPattern } from '../types/memory.js';
/** Reads all established patterns from the memory file. */
export declare function readPatterns(cwd: string): MemoryPattern[];
/** Writes a new pattern to the patterns memory file. */
export declare function writePattern(cwd: string, pattern: MemoryPattern): Promise<void>;
