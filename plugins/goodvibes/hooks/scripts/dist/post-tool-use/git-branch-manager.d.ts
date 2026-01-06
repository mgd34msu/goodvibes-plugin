/**
 * Git Branch Manager
 *
 * Automates feature branch creation and merging based on session state.
 * Creates feature branches when the first file is created on main branch,
 * and merges branches back to main when tests/builds pass and feature is complete.
 *
 * @module post-tool-use/git-branch-manager
 * @see {@link ../automation/git-operations} for git command execution
 * @see {@link ./file-tracker} for file creation tracking
 */
import type { HooksState } from '../types/state.js';
/**
 * Determines if a feature branch should be created based on current state.
 * Returns true when: not already on a feature branch, currently on main branch,
 * and exactly one file has been created this session.
 *
 * @param state - The current hooks session state with git and file info
 * @param _cwd - Current working directory (unused, reserved for future use)
 * @returns True if conditions are met to create a feature branch
 *
 * @example
 * if (shouldCreateFeatureBranch(state, '/project')) {
 *   await maybeCreateFeatureBranch(state, '/project');
 * }
 */
export declare function shouldCreateFeatureBranch(state: HooksState, _cwd: string): boolean;
/**
 * Creates a feature branch if conditions are met.
 * Generates branch name from feature description, sanitizing for git compatibility.
 * Updates state with new branch info on success.
 *
 * @param state - The current hooks session state to check conditions and update
 * @param cwd - Current working directory (git repository root)
 * @param featureName - Optional custom name for the feature branch
 * @returns Object with `created` boolean and `branchName` string or null
 *
 * @example
 * const { created, branchName } = await maybeCreateFeatureBranch(state, '/project', 'user-auth');
 * if (created) {
 *   console.log('Created branch:', branchName);  // 'feature/user-auth'
 * }
 */
export declare function maybeCreateFeatureBranch(state: HooksState, cwd: string, featureName?: string): Promise<{
    created: boolean;
    branchName: string | null;
}>;
/**
 * Checks if the current feature branch is ready to be merged.
 * Requires: on a feature branch, all tests passing, build passing,
 * no pending fixes, and feature marked as complete (pendingMerge).
 *
 * @param state - The current hooks session state with git, test, and build info
 * @returns True if all merge conditions are satisfied
 *
 * @example
 * if (shouldMergeFeature(state)) {
 *   await maybeMergeFeature(state, '/project');
 * }
 */
export declare function shouldMergeFeature(state: HooksState): boolean;
/**
 * Merges the feature branch if conditions are met.
 * Performs git merge of feature branch into main branch.
 * Updates state to clear feature branch info on success.
 *
 * @param state - The current hooks session state to check conditions and update
 * @param cwd - Current working directory (git repository root)
 * @returns Object with `merged` boolean and `message` describing the result
 *
 * @example
 * const { merged, message } = await maybeMergeFeature(state, '/project');
 * if (merged) {
 *   console.log(message);  // 'Merged feature/user-auth to main'
 * } else if (message) {
 *   console.log('Merge issue:', message);  // 'Merge failed - may have conflicts'
 * }
 */
export declare function maybeMergeFeature(state: HooksState, cwd: string): Promise<{
    merged: boolean;
    message: string;
}>;
