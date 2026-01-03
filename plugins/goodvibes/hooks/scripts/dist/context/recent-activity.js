/**
 * Recent Activity Analyzer
 *
 * Analyzes recent git changes to identify hotspots and activity patterns.
 */
import { execSync } from 'child_process';
/**
 * Execute a git command and return output
 */
function gitExec(cwd, args) {
    try {
        return execSync(`git ${args}`, {
            cwd,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
            maxBuffer: 10 * 1024 * 1024,
        }).trim();
    }
    catch {
        return null;
    }
}
/**
 * Check if directory is a git repository
 */
function isGitRepo(cwd) {
    const result = gitExec(cwd, 'rev-parse --is-inside-work-tree');
    return result === 'true';
}
/**
 * Get files changed in recent commits
 */
function getRecentlyModifiedFiles(cwd, days = 7) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split('T')[0];
    const result = gitExec(cwd, `log --since="${sinceStr}" --name-status --pretty=format:""`);
    if (!result)
        return [];
    const fileChanges = new Map();
    for (const line of result.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
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
    const changes = [];
    for (const [file, counts] of fileChanges) {
        const total = counts.added + counts.modified + counts.deleted;
        let type = 'modified';
        if (counts.added > counts.modified && counts.added > counts.deleted) {
            type = 'added';
        }
        else if (counts.deleted > counts.modified) {
            type = 'deleted';
        }
        changes.push({ file, changes: total, type });
    }
    return changes.sort((a, b) => b.changes - a.changes).slice(0, 10);
}
/**
 * Identify hotspots (frequently changed files)
 */
function getHotspots(cwd, commits = 50) {
    const result = gitExec(cwd, `log -${commits} --name-only --pretty=format:""`);
    if (!result)
        return [];
    const fileCount = new Map();
    for (const line of result.split('\n')) {
        const file = line.trim();
        if (!file)
            continue;
        if (file.includes('node_modules/') ||
            file.includes('dist/') ||
            file.includes('.lock') ||
            file.endsWith('.json') ||
            file.endsWith('.md')) {
            continue;
        }
        fileCount.set(file, (fileCount.get(file) || 0) + 1);
    }
    const threshold = Math.max(3, commits * 0.1);
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
    return hotspots.sort((a, b) => b.changeCount - a.changeCount).slice(0, 5);
}
/**
 * Get recent commits summary
 */
function getRecentCommits(cwd, count = 5) {
    const format = '%h|%s|%an|%ar';
    const result = gitExec(cwd, `log -${count} --format="${format}"`);
    if (!result)
        return [];
    const commits = [];
    for (const line of result.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
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
 * Gather all recent activity context
 */
export async function getRecentActivity(cwd) {
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
 * Format recent activity for display
 */
export function formatRecentActivity(activity) {
    const sections = [];
    if (activity.recentCommits.length > 0) {
        const commitLines = activity.recentCommits
            .slice(0, 3)
            .map((c) => `- \`${c.hash}\` ${c.message} (${c.date})`);
        sections.push(`**Recent Commits:**\n${commitLines.join('\n')}`);
    }
    if (activity.hotspots.length > 0) {
        const hotspotLines = activity.hotspots.map((h) => `- \`${h.file}\` (${h.changeCount} changes)`);
        sections.push(`**Hotspots (frequently changed):**\n${hotspotLines.join('\n')}`);
    }
    if (activity.recentlyModifiedFiles.length > 0) {
        const fileLines = activity.recentlyModifiedFiles
            .slice(0, 5)
            .map((f) => `- \`${f.file}\` (${f.type}, ${f.changes} change(s))`);
        sections.push(`**Recently Modified:**\n${fileLines.join('\n')}`);
    }
    return sections.length > 0 ? sections.join('\n\n') : null;
}
