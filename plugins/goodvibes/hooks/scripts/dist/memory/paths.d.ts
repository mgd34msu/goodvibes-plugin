/**
 * Path utilities for the memory module.
 *
 * Provides constants and functions for resolving paths to the .goodvibes
 * directory and memory files.
 */
/** The name of the .goodvibes configuration directory. */
export declare const GOODVIBES_DIR = ".goodvibes";
/** The name of the memory subdirectory. */
export declare const MEMORY_DIR = "memory";
/** Mapping of memory types to their file names. */
export declare const MEMORY_FILES: {
    readonly decisions: "decisions.md";
    readonly patterns: "patterns.md";
    readonly failures: "failures.md";
    readonly preferences: "preferences.md";
};
/** Type representing the valid memory file types. */
export type MemoryFileType = keyof typeof MEMORY_FILES;
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
export declare function getGoodVibesDir(cwd: string): string;
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
export declare function getMemoryDir(cwd: string): string;
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
export declare function getMemoryFilePath(cwd: string, type: MemoryFileType): string;
