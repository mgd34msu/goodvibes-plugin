import type { HooksState } from '../types/state.js';
import {
  detectMainBranch,
  getCurrentBranch,
  createFeatureBranch as gitCreateBranch,
  mergeFeatureBranch as gitMergeBranch,
  hasUncommittedChanges,
} from '../automation/git-operations.js';

/** Maximum length for feature branch name slugs */
const BRANCH_NAME_MAX_LENGTH = 50;

/** Determines if a feature branch should be created based on current state */
export function shouldCreateFeatureBranch(state: HooksState, _cwd: string): boolean {
  // Already on a feature branch
  if (state.git.featureBranch) return false;

  // Not on main branch
  if (state.git.currentBranch !== state.git.mainBranch) return false;

  // First significant file creation
  return state.files.createdThisSession.length === 1;
}

/** Creates a feature branch if conditions are met */
export async function maybeCreateFeatureBranch(
  state: HooksState,
  cwd: string,
  featureName?: string
): Promise<{ created: boolean; branchName: string | null }> {
  if (!shouldCreateFeatureBranch(state, cwd)) {
    return { created: false, branchName: null };
  }

  const name = featureName || state.session.featureDescription || 'feature';
  const branchName = `feature/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, BRANCH_NAME_MAX_LENGTH)}`;

  const success = gitCreateBranch(cwd, name);

  if (success) {
    state.git.featureBranch = branchName;
    state.git.currentBranch = branchName;
    state.git.featureStartedAt = new Date().toISOString();
    state.git.featureDescription = name;

    return { created: true, branchName };
  }

  return { created: false, branchName: null };
}

/** Checks if the current feature branch is ready to be merged */
export function shouldMergeFeature(state: HooksState): boolean {
  // Must be on a feature branch
  if (!state.git.featureBranch) return false;

  // Tests must be passing
  if (state.tests.failingFiles.length > 0) return false;

  // Build must be passing
  if (state.build.status !== 'passing') return false;

  // No pending fixes
  if (state.tests.pendingFixes.length > 0) return false;

  // Feature must be marked complete
  if (!state.git.pendingMerge) return false;

  return true;
}

/** Merges the feature branch if conditions are met */
export async function maybeMergeFeature(
  state: HooksState,
  cwd: string
): Promise<{ merged: boolean; message: string }> {
  if (!shouldMergeFeature(state)) {
    return { merged: false, message: '' };
  }

  const featureBranch = state.git.featureBranch!;
  const mainBranch = state.git.mainBranch;

  const success = gitMergeBranch(cwd, featureBranch, mainBranch);

  if (success) {
    state.git.currentBranch = mainBranch;
    state.git.featureBranch = null;
    state.git.featureStartedAt = null;
    state.git.pendingMerge = false;

    return { merged: true, message: `Merged ${featureBranch} to ${mainBranch}` };
  }

  return { merged: false, message: 'Merge failed - may have conflicts' };
}
