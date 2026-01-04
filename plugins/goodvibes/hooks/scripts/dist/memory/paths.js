/**
 * Path utilities for the memory module.
 *
 * Provides constants and functions for resolving paths to the .goodvibes
 * directory and memory files.
 */
import * as path from 'path';
// ============================================================================
// Constants
// ============================================================================
/** The name of the .goodvibes configuration directory. */
export const GOODVIBES_DIR = '.goodvibes';
/** The name of the memory subdirectory. */
export const MEMORY_DIR = 'memory';
/** Mapping of memory types to their file names. */
export const MEMORY_FILES = {
    decisions: 'decisions.md',
    patterns: 'patterns.md',
    failures: 'failures.md',
    preferences: 'preferences.md',
};
// ============================================================================
// Path Utilities
// ============================================================================
/**
 * Get the path to the .goodvibes directory.
 *
 * Constructs the absolute path to the .goodvibes configuration directory
 * within the specified project root.
 *
 * @param cwd - The current working directory (project root)
 * @returns The absolute path to the .goodvibes directory
 *
 * @example
 * const dir = getGoodVibesDir('/path/to/project');
 * // Returns: '/path/to/project/.goodvibes'
 */
export function getGoodVibesDir(cwd) {
    return path.join(cwd, GOODVIBES_DIR);
}
/**
 * Get the path to the memory directory.
 *
 * Constructs the absolute path to the memory storage directory
 * within the .goodvibes configuration directory.
 *
 * @param cwd - The current working directory (project root)
 * @returns The absolute path to the memory directory
 *
 * @example
 * const dir = getMemoryDir('/path/to/project');
 * // Returns: '/path/to/project/.goodvibes/memory'
 */
export function getMemoryDir(cwd) {
    return path.join(cwd, GOODVIBES_DIR, MEMORY_DIR);
}
/**
 * Get the path to a specific memory file.
 *
 * Constructs the absolute path to a specific memory file (decisions, patterns,
 * failures, or preferences) within the memory directory.
 *
 * @param cwd - The current working directory (project root)
 * @param type - The type of memory file ('decisions' | 'patterns' | 'failures' | 'preferences')
 * @returns The absolute path to the specified memory file
 *
 * @example
 * const filePath = getMemoryFilePath('/path/to/project', 'decisions');
 * // Returns: '/path/to/project/.goodvibes/memory/decisions.md'
 */
export function getMemoryFilePath(cwd, type) {
    return path.join(getMemoryDir(cwd), MEMORY_FILES[type]);
}
