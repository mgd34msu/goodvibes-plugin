/**
 * Recent Activity Analyzer
 *
 * Analyzes recent git changes to identify hotspots and activity patterns.
 */

import { execSync } from 'child_process';

import { debug } from '../shared/logging.js';

import {
  GIT_MAX_BUFFER,
  DEFAULT_DAYS_LOOKBACK,
  DEFAULT_COMMITS_FOR_HOTSPOTS,
  DEFAULT_RECENT_COMMITS,
  MAX_RECENT_FILES,
  MAX_HOTSPOTS,
  HOTSPOT_THRESHOLD_MULTIPLIER,
  MIN_HOTSPOT_THRESHOLD,
  MAX_DISPLAY_COMMITS,
  MAX_DISPLAY_FILES,
} from './constants/recent-activity.js';

import type {
  RecentActivity,
  FileChange,
  Hotspot,
  RecentCommit,
} from '../types/recent-activity.js';

// Re-export types for consumers
export type { RecentActivity, FileChange, Hotspot, RecentCommit };

/**
 * Execute a git command and return output.
 * Handles errors gracefully by returning null on command failure.
 *
 * @param cwd - The current working directory (repository root)
 * @param args - Git command arguments (e.g., "log --oneline")
 * @returns The trimmed command output, or null if the command failed
 */
function gitExec(cwd: string, args: string): string | null {
  try {
    return execSync(`git ${args}`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: GIT_MAX_BUFFER,
      timeout: 30000,
    }).trim();
  } catch (error: unknown) {
    debug(`recent-activity: Git command failed: git ${args}`, error);
    return null;
  }
}

/**
 * Check if directory is a git repository.
 *
 * @param cwd - The directory path to check
 * @returns True if the directory is inside a git repository, false otherwise
 */
function isGitRepo(cwd: string): boolean {
  return gitExec(cwd, 'rev-parse --is-inside-work-tree') === 'true';
}

/**
 * Determine file change type based on counts.
 *
 * @param counts - Object with added, modified, deleted counts
 * @returns The dominant change type
 */
function determineChangeType(counts: {
  added: number;
  modified: number;
  deleted: number;
}): FileChange['type'] {
  if (counts.added > counts.modified && counts.added > counts.deleted) {
    return 'added';
  }
  if (counts.deleted > counts.modified) {
    return 'deleted';
  }
  return 'modified';
}

/**
 * Parse a git status line and update file changes map.
 *
 * @param line - The git log line to parse
 * @param fileChanges - Map to update with file changes
 */
function parseStatusLine(
  line: string,
  fileChanges: Map<string, { added: number; modified: number; deleted: number }>
): void {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }

  const match = trimmed.match(/^([AMD])\t(.+)$/);
  if (!match) {
    return;
  }

  const [, status, file] = match;
  const current = fileChanges.get(file) ?? { added: 0, modified: 0, deleted: 0 };

  if (status === 'A') {
    current.added++;
  } else if (status === 'M') {
    current.modified++;
  } else if (status === 'D') {
    current.deleted++;
  }

  fileChanges.set(file, current);
}

/**
 * Get files changed in recent commits.
 *
 * @param cwd - The current working directory (repository root)
 * @param days - Number of days to look back (default: 7)
 * @returns Array of FileChange objects sorted by frequency of changes
 */
function getRecentlyModifiedFiles(
  cwd: string,
  days: number = DEFAULT_DAYS_LOOKBACK
): FileChange[] {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split('T')[0];

  const result = gitExec(
    cwd,
    `log --since="${sinceStr}" --name-status --pretty=format:""`
  );
  if (!result) {
    return [];
  }

  const fileChanges = new Map<
    string,
    { added: number; modified: number; deleted: number }
  >();

  for (const line of result.split('\n')) {
    parseStatusLine(line, fileChanges);
  }

  const changes: FileChange[] = [];
  for (const [file, counts] of fileChanges) {
    const total = counts.added + counts.modified + counts.deleted;
    changes.push({ file, changes: total, type: determineChangeType(counts) });
  }

  return changes.sort((a, b) => b.changes - a.changes).slice(0, MAX_RECENT_FILES);
}

/**
 * Check if a file should be excluded from hotspot analysis.
 *
 * @param file - The file path to check
 * @returns True if file should be excluded
 */
function shouldExcludeFromHotspots(file: string): boolean {
  const excludePatterns = ['node_modules/', 'dist/', '.lock'];
  const excludeExtensions = ['.json', '.md'];

  return (
    excludePatterns.some((p) => file.includes(p)) ||
    excludeExtensions.some((ext) => file.endsWith(ext))
  );
}

/**
 * Identify hotspots (frequently changed files).
 *
 * @param cwd - The current working directory (repository root)
 * @param commits - Number of recent commits to analyze (default: 50)
 * @returns Array of Hotspot objects for files that changed frequently
 */
function getHotspots(
  cwd: string,
  commits: number = DEFAULT_COMMITS_FOR_HOTSPOTS
): Hotspot[] {
  const result = gitExec(cwd, `log -${commits} --name-only --pretty=format:""`);
  if (!result) {
    return [];
  }

  const fileCount = new Map<string, number>();

  for (const line of result.split('\n')) {
    const file = line.trim();
    if (!file || shouldExcludeFromHotspots(file)) {
      continue;
    }
    fileCount.set(file, (fileCount.get(file) ?? 0) + 1);
  }

  const threshold = Math.max(
    MIN_HOTSPOT_THRESHOLD,
    commits * HOTSPOT_THRESHOLD_MULTIPLIER
  );
  const hotspots: Hotspot[] = [];

  for (const [file, count] of fileCount) {
    if (count >= threshold) {
      hotspots.push({
        file,
        changeCount: count,
        reason: `Changed in ${count} of last ${commits} commits`,
      });
    }
  }

  return hotspots.sort((a, b) => b.changeCount - a.changeCount).slice(0, MAX_HOTSPOTS);
}

/**
 * Get recent commits summary.
 *
 * @param cwd - The current working directory (repository root)
 * @param count - Number of recent commits to retrieve (default: 5)
 * @returns Array of RecentCommit objects with hash, message, author, and date
 */
function getRecentCommits(
  cwd: string,
  count: number = DEFAULT_RECENT_COMMITS
): RecentCommit[] {
  const format = '%h|%s|%an|%ar';
  const result = gitExec(cwd, `log -${count} --format="${format}"`);
  if (!result) {
    return [];
  }

  const commits: RecentCommit[] = [];
  for (const line of result.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const parts = trimmed.split('|');
    if (parts.length >= 4) {
      commits.push({
        hash: parts[0] ?? '',
        message: parts[1] ?? '',
        author: parts[2] ?? '',
        date: parts[3] ?? '',
        filesChanged: 0,
      });
    }
  }

  return commits.slice(0, count);
}

/**
 * Gather all recent git activity context for the project.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to RecentActivity with all git activity data
 */
export function getRecentActivity(cwd: string): RecentActivity {
  if (!isGitRepo(cwd)) {
    return {
      recentlyModifiedFiles: [],
      hotspots: [],
      recentCommits: [],
      activeContributors: [],
    };
  }

  return {
    recentlyModifiedFiles: getRecentlyModifiedFiles(cwd),
    hotspots: getHotspots(cwd),
    recentCommits: getRecentCommits(cwd),
    activeContributors: [],
  };
}

/**
 * Format recent activity for display in context output.
 *
 * @param activity - The RecentActivity object to format
 * @returns Formatted string with commits, hotspots, and recent files, or null if no activity
 */
export function formatRecentActivity(activity: RecentActivity): string | null {
  const sections: string[] = [];

  if (activity.recentCommits.length > 0) {
    const commitLines = activity.recentCommits
      .slice(0, MAX_DISPLAY_COMMITS)
      .map((c) => `- \`${c.hash}\` ${c.message} (${c.date})`);
    sections.push(`**Recent Commits:**\n${commitLines.join('\n')}`);
  }

  if (activity.hotspots.length > 0) {
    const hotspotLines = activity.hotspots.map(
      (h) => `- \`${h.file}\` (${h.changeCount} changes)`
    );
    sections.push(`**Hotspots (frequently changed):**\n${hotspotLines.join('\n')}`);
  }

  if (activity.recentlyModifiedFiles.length > 0) {
    const fileLines = activity.recentlyModifiedFiles
      .slice(0, MAX_DISPLAY_FILES)
      .map((f) => `- \`${f.file}\` (${f.type}, ${f.changes} change(s))`);
    sections.push(`**Recently Modified:**\n${fileLines.join('\n')}`);
  }

  return sections.length > 0 ? sections.join('\n\n') : null;
}
