/**
 * Git Context
 *
 * Retrieves git repository information including branch, status, and commits.
 */
import { exec as execCallback } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';
import { debug } from '../shared/logging.js';
const exec = promisify(execCallback);
/**
 * Constant for detached HEAD state.
 * Used when formatting git context for a repository in detached HEAD mode.
 */
const GIT_DETACHED_HEAD = 'detached';
/**
 * Execute a git command and return its output.
 * Handles errors gracefully by returning null on failure.
 *
 * @param command - The git command to execute
 * @param cwd - The current working directory (repository root)
 * @returns Promise resolving to the trimmed command output, or null if the command failed
 */
async function execGit(command, cwd) {
    try {
        const { stdout } = await exec(command, {
            cwd,
            encoding: 'utf-8',
            timeout: 30000,
            maxBuffer: 1024 * 1024,
        });
        return stdout.trim();
    }
    catch (error) {
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
async function directoryExists(dirPath) {
    try {
        await fs.access(dirPath);
        return true;
    }
    catch (error) {
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
 *   debug(`${context.uncommittedFileCount} uncommitted files`);
 * }
 */
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
    const [branch, status, lastCommit, recentCommitsRaw, abRaw] = await Promise.all([
        execGit('git branch --show-current', cwd),
        execGit('git status --porcelain', cwd),
        execGit('git log -1 --format="%s (%ar)"', cwd),
        execGit('git log -5 --format="- %s"', cwd),
        execGit('git rev-list --left-right --count HEAD...@{u}', cwd),
    ]);
    const uncommittedFiles = (status || '').split('\n').filter(Boolean);
    const recentCommits = recentCommitsRaw ? recentCommitsRaw.split('\n') : [];
    let aheadBehind = null;
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
export function formatGitContext(context) {
    if (!context.isRepo) {
        return 'Git: Not a git repository';
    }
    const parts = [];
    parts.push(`Git: ${context.branch || GIT_DETACHED_HEAD} branch`);
    if (context.hasUncommittedChanges) {
        parts.push(`${context.uncommittedFileCount} uncommitted files`);
    }
    if (context.aheadBehind) {
        if (context.aheadBehind.ahead > 0) {
            parts.push(`${context.aheadBehind.ahead} ahead`);
        }
        if (context.aheadBehind.behind > 0) {
            parts.push(`${context.aheadBehind.behind} behind`);
        }
    }
    if (context.lastCommit) {
        parts.push(`\nLast: "${context.lastCommit}"`);
    }
    return parts.join(', ');
}
