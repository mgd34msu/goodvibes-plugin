/**
 * Gitignore Management
 *
 * Ensures .gitignore contains security-critical entries to prevent
 * accidental commits of sensitive files.
 */
/** Security-critical gitignore entries grouped by category. */
export declare const SECURITY_GITIGNORE_ENTRIES: Record<string, string[]>;
/**
 * Ensure .gitignore contains security-critical entries
 */
export declare function ensureSecureGitignore(cwd: string): Promise<void>;
