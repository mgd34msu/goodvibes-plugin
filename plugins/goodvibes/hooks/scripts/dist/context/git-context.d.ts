/**
 * Git Context
 *
 * Retrieves git repository information including branch, status, and commits.
 */
/** Git repository status and recent activity. */
export interface GitContext {
    isRepo: boolean;
    branch: string | null;
    hasUncommittedChanges: boolean;
    uncommittedFileCount: number;
    lastCommit: string | null;
    recentCommits: string[];
    aheadBehind: {
        ahead: number;
        behind: number;
    } | null;
}
/**
 * Retrieve git context for the project directory.
 * Gathers comprehensive git repository information including branch, status, commits, and remote tracking.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to a GitContext object with repository status
 *
 * @example
 * const context = await getGitContext('/my-repo');
 * if (context.isRepo && context.hasUncommittedChanges) {
 *   debug(`${context.uncommittedFileCount} uncommitted files`);
 * }
 */
export declare function getGitContext(cwd: string): Promise<GitContext>;
/**
 * Format git context for display in context output.
 * Creates a human-readable summary of the repository status.
 *
 * @param context - The GitContext object to format
 * @returns Formatted string with branch, uncommitted changes, and last commit info
 *
 * @example
 * const formatted = formatGitContext(context);
 * // Returns: "Git: main branch, 3 uncommitted files, 2 ahead\nLast: \"fix: bug\" (2 hours ago)"
 */
export declare function formatGitContext(context: GitContext): string;
