/**
 * Directory management for the memory module.
 *
 * Handles lazy creation of the .goodvibes and memory directories,
 * as well as security-hardened .gitignore management.
 */
import { fileExists } from '../shared/file-utils.js';
import { ensureGoodVibesDir } from '../shared/index.js';
export { fileExists };
export { ensureGoodVibesDir };
/**
 * Ensure the memory directory exists (lazy creation).
 *
 * Creates the memory directory within .goodvibes if it doesn't exist.
 * Also ensures the parent .goodvibes directory exists.
 *
 * @param cwd - The current working directory (project root)
 * @returns A promise that resolves when the memory directory exists
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
 * @returns A promise that resolves when the gitignore is updated
 *
 * @example
 * await ensureSecurityGitignore('/path/to/project');
 */
export declare function ensureSecurityGitignore(cwd: string): Promise<void>;
