/**
 * Git Context Gatherer
 *
 * Gathers git-related context: branch, uncommitted changes, last commit, ahead/behind status.
 */
export interface GitContext {
    isGitRepo: boolean;
    branch?: string;
    uncommittedChanges: number;
    stagedChanges: number;
    unstagedChanges: number;
    untrackedFiles: number;
    lastCommit?: {
        hash: string;
        message: string;
        author: string;
        date: string;
    };
    aheadBehind?: {
        ahead: number;
        behind: number;
    };
    hasStash: boolean;
    stashCount: number;
}
/**
 * Gather all git context for a project
 */
export declare function getGitContext(cwd: string): Promise<GitContext>;
/**
 * Format git context for display
 */
export declare function formatGitContext(ctx: GitContext): string;
