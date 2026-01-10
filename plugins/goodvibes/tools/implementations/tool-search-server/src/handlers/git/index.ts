/**
 * Git handlers
 *
 * Provides Git and GitHub integration tools:
 * - Pull request creation with auto-generated descriptions
 * - (Future: commit management, branch operations, etc.)
 *
 * @module handlers/git
 */

// Create Pull Request
export { handleCreatePullRequest } from './create-pull-request.js';
export type {
  CreatePullRequestArgs,
  CreatePullRequestResult,
} from './create-pull-request.js';
