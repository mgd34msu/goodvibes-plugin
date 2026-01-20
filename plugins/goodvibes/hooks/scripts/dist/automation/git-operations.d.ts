/**
 * Git Operations
 *
 * Automated git operations including commits, branch management,
 * and repository state verification.
 */
/**
 * Returns the current git branch name.
 *
 * @param cwd - The current working directory (repository root)
 * @returns Promise resolving to the current branch name, or null if not on a branch (detached HEAD)
 *
 * @example
 * const branch = await getCurrentBranch('/repo');
 * // => 'feature/new-login' (if on a branch)
 * // => null (if in detached HEAD state)
 */
export declare function getCurrentBranch(cwd: string): Promise<string | null>;
/**
 * Checks if there are uncommitted changes in the working directory.
 * Includes both staged and unstaged changes.
 *
 * @param cwd - The current working directory (repository root)
 * @returns Promise resolving to true if there are uncommitted changes, false otherwise
 *
 * @example
 * const hasChanges = await hasUncommittedChanges('/repo');
 * // => true (if there are staged or unstaged changes)
 * // => false (if working directory is clean)
 */
export declare function hasUncommittedChanges(cwd: string): Promise<boolean>;
/**
 * Returns a list of file paths with uncommitted changes.
 * Parses git status --porcelain output to extract file paths.
 *
 * @param cwd - The current working directory (repository root)
 * @returns Promise resolving to an array of file paths with changes, or empty array if none
 *
 * @example
 * const files = await getUncommittedFiles('/repo');
 * // => ['src/index.ts', 'package.json'] (files with changes)
 * // => [] (if no uncommitted changes)
 */
export declare function getUncommittedFiles(cwd: string): Promise<string[]>;
/**
 * Creates a checkpoint commit with all current changes.
 * Stages all files with git add -A and commits with a prefixed message.
 * Returns false if there are no changes to commit.
 *
 * @param cwd - The current working directory (repository root)
 * @param message - The checkpoint message (will be prefixed with 'checkpoint:')
 * @returns Promise resolving to true if the checkpoint was created successfully, false otherwise
 *
 * @example
 * const created = await createCheckpoint('/repo', 'pre-refactor state');
 * // => true (commit created: 'checkpoint: pre-refactor state')
 * // => false (no changes to commit or error occurred)
 */
export declare function createCheckpoint(cwd: string, message: string): Promise<boolean>;
/**
 * Creates a new feature branch with a sanitized name.
 * Normalizes the name to lowercase with hyphens and prefixes with 'feature/'.
 *
 * @param cwd - The current working directory (repository root)
 * @param name - The feature name (will be sanitized and normalized)
 * @returns Promise resolving to true if the branch was created successfully, false otherwise
 *
 * @example
 * const created = await createFeatureBranch('/repo', 'Add User Authentication');
 * // => true (created and checked out 'feature/add-user-authentication')
 * // => false (branch creation failed)
 */
export declare function createFeatureBranch(cwd: string, name: string): Promise<boolean>;
/**
 * Merges a feature branch into the main branch and deletes the feature branch.
 * Performs a no-fast-forward merge to preserve branch history.
 *
 * @param cwd - The current working directory (repository root)
 * @param featureBranch - The name of the feature branch to merge
 * @param mainBranch - The name of the main branch to merge into
 * @returns Promise resolving to true if merge and cleanup succeeded, false otherwise
 *
 * @example
 * const merged = await mergeFeatureBranch('/repo', 'feature/new-login', 'main');
 * // => true (merged to main and deleted feature branch)
 * // => false (merge failed or cleanup failed)
 */
export declare function mergeFeatureBranch(cwd: string, featureBranch: string, mainBranch: string): Promise<boolean>;
