/**
 * Git handlers
 *
 * Provides Git and GitHub integration tools:
 * - Pull request creation with auto-generated descriptions
 * - Merge conflict resolution
 *
 * @module handlers/git
 */

// Create Pull Request
export { handleCreatePullRequest } from './create-pull-request.js';
export type {
  CreatePullRequestArgs,
  CreatePullRequestResult,
} from './create-pull-request.js';

// Resolve Merge Conflict
export { handleResolveMergeConflict } from './resolve-merge-conflict.js';
export type { ResolveMergeConflictArgs } from './resolve-merge-conflict.js';
