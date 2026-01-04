/**
 * Directory management for the memory module.
 *
 * Handles lazy creation of the .goodvibes and memory directories,
 * as well as security-hardened .gitignore management.
 */
/**
 * Checks if a file or directory exists asynchronously.
 *
 * @param filePath - The path to check
 * @returns Promise resolving to true if path exists, false otherwise
 */
export declare function fileExists(filePath: string): Promise<boolean>;
/**
 * Ensure the .goodvibes directory exists (lazy creation).
 *
 * Creates the .goodvibes directory if it doesn't exist, and ensures
 * that comprehensive security patterns are added to .gitignore to
 * prevent sensitive data from being committed.
 *
 * @param cwd - The current working directory (project root)
 * @throws Error if the directory cannot be created
 *
 * @example
 * await ensureGoodVibesDir('/path/to/project');
 */
export declare function ensureGoodVibesDir(cwd: string): Promise<void>;
/**
 * Ensure the memory directory exists (lazy creation).
 *
 * Creates the memory directory within .goodvibes if it doesn't exist.
 * Also ensures the parent .goodvibes directory exists.
 *
 * @param cwd - The current working directory (project root)
 * @throws Error if the directory cannot be created
 *
 * @example
 * await ensureMemoryDir('/path/to/project');
 */
export declare function ensureMemoryDir(cwd: string): Promise<void>;
/**
 * Ensure .gitignore has comprehensive security patterns.
 *
 * Checks the project's .gitignore file and adds any missing security
 * patterns to prevent sensitive files from being committed. Only adds
 * patterns that are not already present.
 *
 * @param cwd - The current working directory (project root)
 *
 * @example
 * await ensureSecurityGitignore('/path/to/project');
 */
export declare function ensureSecurityGitignore(cwd: string): Promise<void>;
