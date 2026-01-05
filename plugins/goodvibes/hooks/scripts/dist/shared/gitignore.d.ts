/**
 * Gitignore Management
 *
 * Ensures .gitignore contains security-critical entries to prevent
 * accidental commits of sensitive files.
 *
 * Note: This module intentionally does NOT import from file-utils.ts
 * to avoid circular dependencies (file-utils imports ensureSecureGitignore).
 */
/** Security-critical gitignore entries grouped by category. */
export declare const SECURITY_GITIGNORE_ENTRIES: Record<string, string[]>;
/**
 * Ensures the .gitignore file contains security-critical entries.
 *
 * Reads the existing .gitignore (if present) and appends any missing
 * security patterns from SECURITY_GITIGNORE_ENTRIES. Patterns are
 * organized by category with section headers for clarity.
 *
 * This function is idempotent - running it multiple times will not
 * add duplicate entries.
 *
 * @param cwd - The current working directory (project root) containing .gitignore
 * @returns A promise that resolves when the gitignore has been updated
 *
 * @example
 * // Ensure security entries are present
 * await ensureSecureGitignore('/path/to/project');
 *
 * @example
 * // Called automatically when .goodvibes directory is created
 * await ensureGoodVibesDir(cwd); // internally calls ensureSecureGitignore
 */
export declare function ensureSecureGitignore(cwd: string): Promise<void>;
