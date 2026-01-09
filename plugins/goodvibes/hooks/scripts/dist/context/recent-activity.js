/**
 * Recent Activity Analyzer
 *
 * Analyzes recent git changes to identify hotspots and activity patterns.
 */
import { DEFAULT_DAYS_LOOKBACK, DEFAULT_COMMITS_FOR_HOTSPOTS, DEFAULT_RECENT_COMMITS, MAX_RECENT_FILES, MAX_HOTSPOTS, HOTSPOT_THRESHOLD_MULTIPLIER, MIN_HOTSPOT_THRESHOLD, } from './constants/recent-activity.js';
import { gitExec, isGitRepo } from './git-utils.js';
/**
 * Determine file change type based on counts.
 *
 * @param counts - Object with added, modified, deleted counts
 * @returns The dominant change type
 */
function determineChangeType(counts) {
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
function parseStatusLine(line, fileChanges) {
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
    /* v8 ignore start - Regex /^([AMD])\t/ guarantees status is A, M, or D.
       All branches tested but v8 has issues with else-if chain coverage. */
    if (status === 'A') {
        current.added++;
    }
    else if (status === 'M') {
        current.modified++;
    }
    else if (status === 'D') {
        current.deleted++;
    }
    /* v8 ignore stop */
    fileChanges.set(file, current);
}
/**
 * Get files changed in recent commits.
 *
 * @param cwd - The current working directory (repository root)
 * @param days - Number of days to look back (default: 7)
 * @returns Promise resolving to an array of FileChange objects sorted by frequency of changes
 */
async function getRecentlyModifiedFiles(cwd, days = DEFAULT_DAYS_LOOKBACK) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split('T')[0];
    const result = await gitExec(cwd, `log --since="${sinceStr}" --name-status --pretty=format:""`);
    if (!result) {
        return [];
    }
    const fileChanges = new Map();
    for (const line of result.split('\n')) {
        parseStatusLine(line, fileChanges);
    }
    const changes = [];
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
function shouldExcludeFromHotspots(file) {
    const excludePatterns = ['node_modules/', 'dist/', '.lock'];
    const excludeExtensions = ['.json', '.md'];
    return (excludePatterns.some((p) => file.includes(p)) ||
        excludeExtensions.some((ext) => file.endsWith(ext)));
}
/**
 * Identify hotspots (frequently changed files).
 *
 * @param cwd - The current working directory (repository root)
 * @param commits - Number of recent commits to analyze (default: 50)
 * @returns Promise resolving to an array of Hotspot objects for files that changed frequently
 */
async function getHotspots(cwd, commits = DEFAULT_COMMITS_FOR_HOTSPOTS) {
    const result = await gitExec(cwd, `log -${commits} --name-only --pretty=format:""`);
    if (!result) {
        return [];
    }
    const fileCount = new Map();
    for (const line of result.split('\n')) {
        const file = line.trim();
        if (!file || shouldExcludeFromHotspots(file)) {
            continue;
        }
        fileCount.set(file, (fileCount.get(file) ?? 0) + 1);
    }
    const threshold = Math.max(MIN_HOTSPOT_THRESHOLD, commits * HOTSPOT_THRESHOLD_MULTIPLIER);
    const hotspots = [];
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
 * @returns Promise resolving to an array of RecentCommit objects with hash, message, author, and date
 */
async function getRecentCommits(cwd, count = DEFAULT_RECENT_COMMITS) {
    const format = '%h|%s|%an|%ar';
    const result = await gitExec(cwd, `log -${count} --format="${format}"`);
    if (!result) {
        return [];
    }
    const commits = [];
    for (const line of result.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) {
            continue;
        }
        const parts = trimmed.split('|');
        if (parts.length >= 4) {
            /* v8 ignore start - split always returns strings, ?? never triggered */
            commits.push({
                hash: parts[0] ?? '',
                message: parts[1] ?? '',
                author: parts[2] ?? '',
                date: parts[3] ?? '',
                filesChanged: 0,
            });
            /* v8 ignore stop */
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
export async function getRecentActivity(cwd) {
    if (!(await isGitRepo(cwd))) {
        return {
            recentlyModifiedFiles: [],
            hotspots: [],
            recentCommits: [],
            activeContributors: [],
        };
    }
    const [recentlyModifiedFiles, hotspots, recentCommits] = await Promise.all([
        getRecentlyModifiedFiles(cwd),
        getHotspots(cwd),
        getRecentCommits(cwd),
    ]);
    return {
        recentlyModifiedFiles,
        hotspots,
        recentCommits,
        activeContributors: [],
    };
}
// Re-export formatRecentActivity from the formatter module
export { formatRecentActivity } from './recent-activity-formatter.js';
