/**
 * Recent Activity Analyzer
 *
 * Analyzes recent git changes to identify hotspots and activity patterns.
 */

import { execSync } from 'child_process';
import { debug } from '../shared/logging.js';

/**
 * Maximum buffer size for git command output (10MB).
 * Prevents memory issues when processing large git histories.
 */
const GIT_MAX_BUFFER = 10 * 1024 * 1024;
/**
 * Default number of days to look back for recent changes.
 * Used to determine what counts as "recent" file modifications.
 */
const DEFAULT_DAYS_LOOKBACK = 7;
/**
 * Default number of commits to analyze for hotspots.
 * More commits provide better hotspot accuracy but slower processing.
 */
const DEFAULT_COMMITS_FOR_HOTSPOTS = 50;
/**
 * Default number of recent commits to retrieve.
 * Displayed in the recent activity summary.
 */
const DEFAULT_RECENT_COMMITS = 5;
/**
 * Maximum recently modified files to return.
 * Limits the number of files in the recent changes list.
 */
const MAX_RECENT_FILES = 10;
/**
 * Maximum hotspots to return.
 * Limits the number of frequently-changed files reported.
 */
const MAX_HOTSPOTS = 5;
/**
 * Minimum hotspot threshold multiplier.
 * Files changed in at least this fraction of commits are considered hotspots.
 */
const HOTSPOT_THRESHOLD_MULTIPLIER = 0.1;
/**
 * Minimum absolute hotspot threshold.
 * Files must be changed at least this many times to be a hotspot.
 */
const MIN_HOTSPOT_THRESHOLD = 3;
/**
 * Maximum recent commits to display in formatted output.
 * Prevents overwhelming output with too many commits.
 */
const MAX_DISPLAY_COMMITS = 3;
/**
 * Maximum recently modified files to display.
 * Limits files shown in formatted output.
 */
const MAX_DISPLAY_FILES = 5;

/** Aggregated recent git activity for the project. */
export interface RecentActivity {
  recentlyModifiedFiles: FileChange[];
  hotspots: Hotspot[];
  recentCommits: RecentCommit[];
  activeContributors: string[];
}

/** A file change summary with modification type. */
export interface FileChange {
  file: string;
  changes: number;
  type: 'added' | 'modified' | 'deleted';
}

/** A frequently changed file that may need attention. */
export interface Hotspot {
  file: string;
  changeCount: number;
  reason: string;
}

/** Summary of a recent git commit. */
export interface RecentCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
  filesChanged: number;
}

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
    // Git command failed - log for debugging but return null as this is expected
    debug(`recent-activity: Git command failed: git ${args}`, error);
    return null;
  }
}

/**
 * Check if directory is a git repository.
 * Uses git rev-parse to verify the directory is within a git working tree.
 *
 * @param cwd - The directory path to check
 * @returns True if the directory is inside a git repository, false otherwise
 */
function isGitRepo(cwd: string): boolean {
  const result = gitExec(cwd, 'rev-parse --is-inside-work-tree');
  return result === 'true';
}

/**
 * Get files changed in recent commits.
 * Analyzes git log to find files modified in the specified time period.
 *
 * @param cwd - The current working directory (repository root)
 * @param days - Number of days to look back (default: 7)
 * @returns Array of FileChange objects sorted by frequency of changes
 */
function getRecentlyModifiedFiles(cwd: string, days: number = DEFAULT_DAYS_LOOKBACK): FileChange[] {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split('T')[0];

  const result = gitExec(cwd, `log --since="${sinceStr}" --name-status --pretty=format:""`);
  if (!result) return [];

  const fileChanges = new Map<string, { added: number; modified: number; deleted: number }>();

  for (const line of result.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^([AMD])\t(.+)$/);
    if (match) {
      const status = match[1];
      const file = match[2];
      const current = fileChanges.get(file) || { added: 0, modified: 0, deleted: 0 };

      switch (status) {
        case 'A':
          current.added++;
          break;
        case 'M':
          current.modified++;
          break;
        case 'D':
          current.deleted++;
          break;
      }

      fileChanges.set(file, current);
    }
  }

  const changes: FileChange[] = [];
  for (const [file, counts] of fileChanges) {
    const total = counts.added + counts.modified + counts.deleted;
    let type: 'added' | 'modified' | 'deleted' = 'modified';

    if (counts.added > counts.modified && counts.added > counts.deleted) {
      type = 'added';
    } else if (counts.deleted > counts.modified) {
      type = 'deleted';
    }

    changes.push({ file, changes: total, type });
  }

  return changes.sort((a, b) => b.changes - a.changes).slice(0, MAX_RECENT_FILES);
}

/**
 * Identify hotspots (frequently changed files).
 * Files that change often may indicate instability or active development areas.
 *
 * @param cwd - The current working directory (repository root)
 * @param commits - Number of recent commits to analyze (default: 50)
 * @returns Array of Hotspot objects for files that changed frequently
 */
function getHotspots(cwd: string, commits: number = DEFAULT_COMMITS_FOR_HOTSPOTS): Hotspot[] {
  const result = gitExec(cwd, `log -${commits} --name-only --pretty=format:""`);
  if (!result) return [];

  const fileCount = new Map<string, number>();

  for (const line of result.split('\n')) {
    const file = line.trim();
    if (!file) continue;

    if (
      file.includes('node_modules/') ||
      file.includes('dist/') ||
      file.includes('.lock') ||
      file.endsWith('.json') ||
      file.endsWith('.md')
    ) {
      continue;
    }

    fileCount.set(file, (fileCount.get(file) || 0) + 1);
  }

  const threshold = Math.max(MIN_HOTSPOT_THRESHOLD, commits * HOTSPOT_THRESHOLD_MULTIPLIER);
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
 * Retrieves abbreviated commit information for display in context.
 *
 * @param cwd - The current working directory (repository root)
 * @param count - Number of recent commits to retrieve (default: 5)
 * @returns Array of RecentCommit objects with hash, message, author, and date
 */
function getRecentCommits(cwd: string, count: number = DEFAULT_RECENT_COMMITS): RecentCommit[] {
  const format = '%h|%s|%an|%ar';
  const result = gitExec(cwd, `log -${count} --format="${format}"`);
  if (!result) return [];

  const commits: RecentCommit[] = [];

  for (const line of result.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = trimmed.split('|');
    if (parts.length >= 4) {
      commits.push({
        hash: parts[0] || '',
        message: parts[1] || '',
        author: parts[2] || '',
        date: parts[3] || '',
        filesChanged: 0,
      });
    }
  }

  return commits.slice(0, count);
}

/**
 * Gather all recent git activity context for the project.
 * Analyzes git history to identify recently modified files, hotspots, and commits.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to RecentActivity with all git activity data
 *
 * @example
 * const activity = await getRecentActivity('/my-repo');
 * if (activity.hotspots.length > 0) {
 *   console.log('Frequently changed files:', activity.hotspots);
 * }
 */
export async function getRecentActivity(cwd: string): Promise<RecentActivity> {
  if (!isGitRepo(cwd)) {
    return {
      recentlyModifiedFiles: [],
      hotspots: [],
      recentCommits: [],
      activeContributors: [],
    };
  }

  const recentlyModifiedFiles = getRecentlyModifiedFiles(cwd);
  const hotspots = getHotspots(cwd);
  const recentCommits = getRecentCommits(cwd);

  return {
    recentlyModifiedFiles,
    hotspots,
    recentCommits,
    activeContributors: [],
  };
}

/**
 * Format recent activity for display in context output.
 * Creates a human-readable summary of recent commits, hotspots, and file changes.
 *
 * @param activity - The RecentActivity object to format
 * @returns Formatted string with commits, hotspots, and recent files, or null if no activity
 *
 * @example
 * const formatted = formatRecentActivity(activity);
 * // Returns formatted sections with recent commits, hotspots, and modified files
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
    const hotspotLines = activity.hotspots.map((h) => `- \`${h.file}\` (${h.changeCount} changes)`);
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
