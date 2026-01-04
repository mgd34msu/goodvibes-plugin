/**
 * Failures memory module - stores failed approaches to avoid repeating.
 */
import type { MemoryFailure } from '../types/memory.js';
/**
 * Reads all known failures from the memory file.
 *
 * Parses the failures.md file and returns an array of structured failure objects.
 * Returns an empty array if the file doesn't exist or is empty.
 *
 * @param cwd - The current working directory (project root)
 * @returns Array of MemoryFailure objects parsed from the file
 *
 * @example
 * const failures = readFailures('/path/to/project');
 * for (const failure of failures) {
 *   console.log(`Avoid: ${failure.approach} - ${failure.reason}`);
 * }
 */
export declare function readFailures(cwd: string): MemoryFailure[];
/**
 * Appends a new failure record to the failures memory file.
 *
 * Creates the failures.md file with a header if it doesn't exist,
 * then appends the failure in a structured markdown format. Used to
 * document approaches that didn't work to prevent repeating mistakes.
 *
 * @param cwd - The current working directory (project root)
 * @param failure - The failure object to write
 *
 * @example
 * writeFailure('/path/to/project', {
 *   approach: 'Direct DOM manipulation in React',
 *   date: '2024-01-04',
 *   reason: 'Conflicts with React virtual DOM, causes bugs',
 *   context: 'Tried to optimize performance',
 *   suggestion: 'Use refs or state management instead'
 * });
 */
export declare function writeFailure(cwd: string, failure: MemoryFailure): void;
