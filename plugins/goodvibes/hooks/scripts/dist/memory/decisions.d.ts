/**
 * Decisions memory module - stores architectural decisions with rationale.
 */
import type { MemoryDecision } from '../types/memory.js';
/** Reads all project decisions from the memory file. */
export declare function readDecisions(cwd: string): MemoryDecision[];
/** Appends a new decision to the decisions memory file. */
export declare function writeDecision(cwd: string, decision: MemoryDecision): Promise<void>;
