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
import { createFeatureBranch as gitCreateBranch, mergeFeatureBranch as gitMergeBranch, } from '../automation/git-operations.js';
/** Maximum length for feature branch name slugs */
const BRANCH_NAME_MAX_LENGTH = 50;
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
export function shouldCreateFeatureBranch(state, _cwd) {
    // Already on a feature branch
    if (state.git.featureBranch) {
        return false;
    }
    // Not on main branch
    if (state.git.currentBranch !== state.git.mainBranch) {
        return false;
    }
    // First significant file creation
    return state.files.createdThisSession.length === 1;
}
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
 *   debug('Created branch:', branchName);  // 'feature/user-auth'
 * }
 */
export async function maybeCreateFeatureBranch(state, cwd, featureName) {
    if (!shouldCreateFeatureBranch(state, cwd)) {
        return { created: false, branchName: null };
    }
    const name = featureName ?? state.session.featureDescription ?? 'feature';
    const branchName = `feature/${name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, BRANCH_NAME_MAX_LENGTH)}`;
    const success = await gitCreateBranch(cwd, name);
    if (success) {
        state.git.featureBranch = branchName;
        state.git.currentBranch = branchName;
        state.git.featureStartedAt = new Date().toISOString();
        state.git.featureDescription = name;
        return { created: true, branchName };
    }
    return { created: false, branchName: null };
}
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
export function shouldMergeFeature(state) {
    // Must be on a feature branch
    if (!state.git.featureBranch) {
        return false;
    }
    // Tests must be passing
    if (state.tests.failingFiles.length > 0) {
        return false;
    }
    // Build must be passing
    if (state.build.status !== 'passing') {
        return false;
    }
    // No pending fixes
    if (state.tests.pendingFixes.length > 0) {
        return false;
    }
    // Feature must be marked complete
    if (!state.git.pendingMerge) {
        return false;
    }
    return true;
}
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
 *   debug(message);  // 'Merged feature/user-auth to main'
 * } else if (message) {
 *   debug('Merge issue:', message);  // 'Merge failed - may have conflicts'
 * }
 */
export async function maybeMergeFeature(state, cwd) {
    if (!shouldMergeFeature(state)) {
        return { merged: false, message: '' };
    }
    const featureBranch = state.git.featureBranch;
    const mainBranch = state.git.mainBranch;
    const success = await gitMergeBranch(cwd, featureBranch, mainBranch);
    if (success) {
        state.git.currentBranch = mainBranch;
        state.git.featureBranch = null;
        state.git.featureStartedAt = null;
        state.git.pendingMerge = false;
        return {
            merged: true,
            message: `Merged ${featureBranch} to ${mainBranch}`,
        };
    }
    return { merged: false, message: 'Merge failed - may have conflicts' };
}
