/**
 * Git Context
 *
 * Retrieves git repository information including branch, status, and commits.
 */

import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { debug } from '../shared/logging.js';

/**
 * Constant for detached HEAD state.
 * Used when formatting git context for a repository in detached HEAD mode.
 */
const GIT_DETACHED_HEAD = 'detached';

/** Git repository status and recent activity. */
export interface GitContext {
  isRepo: boolean;
  branch: string | null;
  hasUncommittedChanges: boolean;
  uncommittedFileCount: number;
  lastCommit: string | null;
  recentCommits: string[];
  aheadBehind: { ahead: number; behind: number } | null;
}

/**
 * Execute a git command and return its output.
 * Handles errors gracefully by returning null on failure.
 *
 * @param command - The git command to execute
 * @param cwd - The current working directory (repository root)
 * @returns The trimmed command output, or null if the command failed
 */
function execGit(command: string, cwd: string): string | null {
  try {
    return execSync(command, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 }).trim();
  } catch (error: unknown) {
    // Git command failed - this is expected for some operations (e.g., no upstream)
    debug(`git-context: Git command failed: ${command}`, error);
    return null;
  }
}

/**
 * Check if a directory exists asynchronously.
 *
 * @param dirPath - The directory path to check
 * @returns Promise resolving to true if directory exists, false otherwise
 */
async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    await fs.access(dirPath);
    return true;
  } catch (error: unknown) {
    debug('git-context failed', { error: String(error) });
    return false;
  }
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
 *   console.log(`${context.uncommittedFileCount} uncommitted files`);
 * }
 */
export async function getGitContext(cwd: string): Promise<GitContext> {
  const gitDir = path.join(cwd, '.git');
  const isRepo = await directoryExists(gitDir);

  if (!isRepo) {
    return {
      isRepo: false,
      branch: null,
      hasUncommittedChanges: false,
      uncommittedFileCount: 0,
      lastCommit: null,
      recentCommits: [],
      aheadBehind: null,
    };
  }

  const branch = execGit('git branch --show-current', cwd);
  const status = execGit('git status --porcelain', cwd) || '';
  const uncommittedFiles = status.split('\n').filter(Boolean);
  const lastCommit = execGit('git log -1 --format="%s (%ar)"', cwd);
  const recentCommitsRaw = execGit('git log -5 --format="- %s"', cwd);
  const recentCommits = recentCommitsRaw ? recentCommitsRaw.split('\n') : [];

  let aheadBehind: { ahead: number; behind: number } | null = null;
  const abRaw = execGit('git rev-list --left-right --count HEAD...@{u}', cwd);
  if (abRaw) {
    const [ahead, behind] = abRaw.split('\t').map(Number);
    aheadBehind = { ahead, behind };
  }

  return {
    isRepo: true,
    branch,
    hasUncommittedChanges: uncommittedFiles.length > 0,
    uncommittedFileCount: uncommittedFiles.length,
    lastCommit,
    recentCommits,
    aheadBehind,
  };
}

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
export function formatGitContext(context: GitContext): string {
  if (!context.isRepo) return 'Git: Not a git repository';

  const parts: string[] = [];
  parts.push(`Git: ${context.branch || GIT_DETACHED_HEAD} branch`);

  if (context.hasUncommittedChanges) {
    parts.push(`${context.uncommittedFileCount} uncommitted files`);
  }

  if (context.aheadBehind) {
    if (context.aheadBehind.ahead > 0) parts.push(`${context.aheadBehind.ahead} ahead`);
    if (context.aheadBehind.behind > 0) parts.push(`${context.aheadBehind.behind} behind`);
  }

  if (context.lastCommit) {
    parts.push(`\nLast: "${context.lastCommit}"`);
  }

  return parts.join(', ');
}
