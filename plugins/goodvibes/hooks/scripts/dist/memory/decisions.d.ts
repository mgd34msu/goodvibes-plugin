/**
 * Decisions memory module - stores architectural decisions with rationale.
 */
import type { MemoryDecision } from '../types/memory.js';
/**
 * Reads all project decisions from the memory file.
 *
 * Parses the decisions.md file and returns an array of structured decision objects.
 * Returns an empty array if the file doesn't exist or is empty.
 *
 * @param cwd - The current working directory (project root)
 * @returns Array of MemoryDecision objects parsed from the file
 *
 * @example
 * const decisions = readDecisions('/path/to/project');
 * for (const decision of decisions) {
 *   console.log(`${decision.title}: ${decision.rationale}`);
 * }
 */
export declare function readDecisions(cwd: string): MemoryDecision[];
/**
 * Appends a new decision to the decisions memory file.
 *
 * Creates the decisions.md file with a header if it doesn't exist,
 * then appends the decision in a structured markdown format.
 *
 * @param cwd - The current working directory (project root)
 * @param decision - The decision object to write
 *
 * @example
 * writeDecision('/path/to/project', {
 *   title: 'Use tRPC for API',
 *   date: '2024-01-04',
 *   rationale: 'End-to-end type safety with minimal boilerplate',
 *   alternatives: ['REST', 'GraphQL']
 * });
 */
export declare function writeDecision(cwd: string, decision: MemoryDecision): void;
