/**
 * Git Context
 *
 * Retrieves git repository information including branch, status, and commits.
 */
import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
/** Constant for detached HEAD state. */
const GIT_DETACHED_HEAD = 'detached';
function execGit(command, cwd) {
    try {
        return execSync(command, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    }
    catch (error) {
        // Git command failed - this is expected for some operations (e.g., no upstream)
        console.error(`[git-context] Git command failed: ${command}`, error);
        return null;
    }
}
async function directoryExists(dirPath) {
    try {
        await fs.access(dirPath);
        return true;
    }
    catch {
        return false;
    }
}
/** Retrieve git context for the project directory. */
export async function getGitContext(cwd) {
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
    let aheadBehind = null;
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
export function formatGitContext(context) {
    if (!context.isRepo)
        return 'Git: Not a git repository';
    const parts = [];
    parts.push(`Git: ${context.branch || GIT_DETACHED_HEAD} branch`);
    if (context.hasUncommittedChanges) {
        parts.push(`${context.uncommittedFileCount} uncommitted files`);
    }
    if (context.aheadBehind) {
        if (context.aheadBehind.ahead > 0)
            parts.push(`${context.aheadBehind.ahead} ahead`);
        if (context.aheadBehind.behind > 0)
            parts.push(`${context.aheadBehind.behind} behind`);
    }
    if (context.lastCommit) {
        parts.push(`\nLast: "${context.lastCommit}"`);
    }
    return parts.join(', ');
}
