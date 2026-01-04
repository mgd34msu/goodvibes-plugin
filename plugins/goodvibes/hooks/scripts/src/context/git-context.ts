/**
 * Git Context Gatherer
 *
 * Gathers git-related context: branch, uncommitted changes, last commit, ahead/behind status.
 */

import { execSync } from 'child_process';

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
 * Execute a git command and return output
 */
function gitExec(cwd: string, args: string): string | null {
  try {
    return execSync(`git ${args}`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Check if directory is a git repository
 */
function isGitRepo(cwd: string): boolean {
  const result = gitExec(cwd, 'rev-parse --is-inside-work-tree');
  return result === 'true';
}

/**
 * Get current branch name
 */
function getCurrentBranch(cwd: string): string | undefined {
  const branch = gitExec(cwd, 'branch --show-current');
  if (branch) return branch;

  // Detached HEAD - get the commit hash
  const hash = gitExec(cwd, 'rev-parse --short HEAD');
  return hash ? `(detached at ${hash})` : undefined;
}

/**
 * Get uncommitted changes count
 */
function getChangeCounts(cwd: string): { staged: number; unstaged: number; untracked: number } {
  const status = gitExec(cwd, 'status --porcelain');
  if (!status) return { staged: 0, unstaged: 0, untracked: 0 };

  let staged = 0;
  let unstaged = 0;
  let untracked = 0;

  const lines = status.split('\n').filter((line) => line.length > 0);
  for (const line of lines) {
    const indexStatus = line[0];
    const workTreeStatus = line[1];

    if (indexStatus === '?' && workTreeStatus === '?') {
      untracked++;
    } else {
      if (indexStatus !== ' ' && indexStatus !== '?') {
        staged++;
      }
      if (workTreeStatus !== ' ' && workTreeStatus !== '?') {
        unstaged++;
      }
    }
  }

  return { staged, unstaged, untracked };
}

/**
 * Get last commit info
 */
function getLastCommit(cwd: string): GitContext['lastCommit'] {
  const format = '%H|%s|%an|%ar';
  const result = gitExec(cwd, `log -1 --format="${format}"`);
  if (!result) return undefined;

  const [hash, message, author, date] = result.split('|');
  return {
    hash: hash?.slice(0, 7) || '',
    message: message || '',
    author: author || '',
    date: date || '',
  };
}

/**
 * Get ahead/behind status relative to upstream
 */
function getAheadBehind(cwd: string): GitContext['aheadBehind'] {
  const result = gitExec(cwd, 'rev-list --left-right --count HEAD...@{upstream}');
  if (!result) return undefined;

  const parts = result.split('\t');
  const ahead = parseInt(parts[0] || '0', 10);
  const behind = parseInt(parts[1] || '0', 10);
  return {
    ahead: isNaN(ahead) ? 0 : ahead,
    behind: isNaN(behind) ? 0 : behind,
  };
}

/**
 * Get stash count
 */
function getStashCount(cwd: string): number {
  const result = gitExec(cwd, 'stash list');
  if (!result) return 0;
  return result.split('\n').filter((line) => line.length > 0).length;
}

/**
 * Gather all git context for a project
 */
export async function getGitContext(cwd: string): Promise<GitContext> {
  if (!isGitRepo(cwd)) {
    return {
      isGitRepo: false,
      uncommittedChanges: 0,
      stagedChanges: 0,
      unstagedChanges: 0,
      untrackedFiles: 0,
      hasStash: false,
      stashCount: 0,
    };
  }

  const branch = getCurrentBranch(cwd);
  const { staged, unstaged, untracked } = getChangeCounts(cwd);
  const lastCommit = getLastCommit(cwd);
  const aheadBehind = getAheadBehind(cwd);
  const stashCount = getStashCount(cwd);

  return {
    isGitRepo: true,
    branch,
    uncommittedChanges: staged + unstaged,
    stagedChanges: staged,
    unstagedChanges: unstaged,
    untrackedFiles: untracked,
    lastCommit,
    aheadBehind,
    hasStash: stashCount > 0,
    stashCount,
  };
}

/**
 * Format git context for display
 */
export function formatGitContext(ctx: GitContext): string {
  if (!ctx.isGitRepo) {
    return '**Git:** Not a git repository';
  }

  const lines: string[] = [];

  // Branch info
  if (ctx.branch) {
    let branchLine = `**Branch:** \`${ctx.branch}\``;
    if (ctx.aheadBehind) {
      const { ahead, behind } = ctx.aheadBehind;
      if (ahead > 0 || behind > 0) {
        const parts: string[] = [];
        if (ahead > 0) parts.push(`${ahead} ahead`);
        if (behind > 0) parts.push(`${behind} behind`);
        branchLine += ` (${parts.join(', ')})`;
      }
    }
    lines.push(branchLine);
  }

  // Changes
  const changesParts: string[] = [];
  if (ctx.stagedChanges > 0) changesParts.push(`${ctx.stagedChanges} staged`);
  if (ctx.unstagedChanges > 0) changesParts.push(`${ctx.unstagedChanges} unstaged`);
  if (ctx.untrackedFiles > 0) changesParts.push(`${ctx.untrackedFiles} untracked`);

  if (changesParts.length > 0) {
    lines.push(`**Changes:** ${changesParts.join(', ')}`);
  } else {
    lines.push('**Changes:** Working tree clean');
  }

  // Last commit
  if (ctx.lastCommit) {
    lines.push(`**Last commit:** "${ctx.lastCommit.message}" (${ctx.lastCommit.date})`);
  }

  // Stash
  if (ctx.hasStash) {
    lines.push(`**Stash:** ${ctx.stashCount} stashed change(s)`);
  }

  return lines.join('\n');
}
