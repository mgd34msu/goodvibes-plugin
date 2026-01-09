/**
 * Patterns memory module - stores project-specific code patterns.
 */
import type { MemoryPattern } from '../types/memory.js';
/**
 * Reads all established patterns from the memory file.
 *
 * Parses the patterns.md file and returns an array of structured pattern objects.
 * Returns an empty array if the file doesn't exist or is empty.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to array of MemoryPattern objects parsed from the file
 *
 * @example
 * const patterns = await readPatterns('/path/to/project');
 * for (const pattern of patterns) {
 *   debug(`${pattern.name}: ${pattern.description}`);
 * }
 */
export declare function readPatterns(cwd: string): Promise<MemoryPattern[]>;
/**
 * Writes a new pattern to the patterns memory file.
 *
 * Creates the patterns.md file with a header if it doesn't exist,
 * then appends the pattern in a structured markdown format with optional
 * code examples and file references.
 *
 * @param cwd - The current working directory (project root)
 * @param pattern - The pattern object to write
 *
 * @example
 * await writePattern('/path/to/project', {
 *   name: 'Repository Pattern',
 *   date: '2024-01-04',
 *   description: 'Use repository classes for data access abstraction',
 *   example: 'class UserRepository { async findById(id) { ... } }',
 *   files: ['src/repositories/user.ts']
 * });
 */
export declare function writePattern(cwd: string, pattern: MemoryPattern): Promise<void>;
