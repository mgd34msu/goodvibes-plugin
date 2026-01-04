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
/** Retrieve git context for the project directory. */
export declare function getGitContext(cwd: string): Promise<GitContext>;
/** Format git context for display in context output. */
export declare function formatGitContext(context: GitContext): string;
