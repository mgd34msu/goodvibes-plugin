/**
 * Git Context
 *
 * Retrieves git repository information including branch, status, and commits.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

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

function execGit(command: string, cwd: string): string | null {
  try {
    return execSync(command, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

/** Retrieve git context for the project directory. */
export async function getGitContext(cwd: string): Promise<GitContext> {
  const gitDir = path.join(cwd, '.git');
  const isRepo = fs.existsSync(gitDir);

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

/** Format git context for display in context output. */
export function formatGitContext(ctx: GitContext): string {
  if (!ctx.isRepo) return 'Git: Not a git repository';

  const parts: string[] = [];
  parts.push(`Git: ${ctx.branch || 'detached'} branch`);

  if (ctx.hasUncommittedChanges) {
    parts.push(`${ctx.uncommittedFileCount} uncommitted files`);
  }

  if (ctx.aheadBehind) {
    if (ctx.aheadBehind.ahead > 0) parts.push(`${ctx.aheadBehind.ahead} ahead`);
    if (ctx.aheadBehind.behind > 0) parts.push(`${ctx.aheadBehind.behind} behind`);
  }

  if (ctx.lastCommit) {
    parts.push(`\nLast: "${ctx.lastCommit}"`);
  }

  return parts.join(', ');
}
