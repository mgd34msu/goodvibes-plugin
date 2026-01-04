/**
 * Failures memory module - stores failed approaches to avoid repeating.
 */
import type { MemoryFailure } from '../types/memory.js';
/** Reads all known failures from the memory file. */
export declare function readFailures(cwd: string): MemoryFailure[];
/** Appends a new failure record to the failures memory file. */
export declare function writeFailure(cwd: string, failure: MemoryFailure): Promise<void>;
