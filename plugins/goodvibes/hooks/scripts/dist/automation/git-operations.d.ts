/**
 * Git Operations
 *
 * Automated git operations including commits, branch management,
 * and repository state verification.
 */
/**
 * Execute a git command safely using array arguments.
 */
export declare function execGit(command: string, cwd: string): string | null;
/**
 * Checks if a directory is a git repository.
 */
export declare function isGitRepo(cwd: string): boolean;
/**
 * Detects the main branch name (main or master) for the repository.
 */
export declare function detectMainBranch(cwd: string): string;
/**
 * Returns the current git branch name, or null if not in a branch.
 */
export declare function getCurrentBranch(cwd: string): string | null;
/**
 * Checks if there are uncommitted changes in the working directory.
 */
export declare function hasUncommittedChanges(cwd: string): boolean;
/**
 * Returns a list of file paths with uncommitted changes.
 */
export declare function getUncommittedFiles(cwd: string): string[];
/**
 * Creates a checkpoint commit with all current changes.
 */
export declare function createCheckpoint(cwd: string, message: string): boolean;
/**
 * Creates a new feature branch with a sanitized name.
 */
export declare function createFeatureBranch(cwd: string, name: string): boolean;
/**
 * Merges a feature branch into the main branch and deletes the feature branch.
 */
export declare function mergeFeatureBranch(cwd: string, featureBranch: string, mainBranch: string): boolean;
