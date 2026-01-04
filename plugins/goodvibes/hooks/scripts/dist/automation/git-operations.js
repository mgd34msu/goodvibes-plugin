/**
 * Git Operations
 *
 * Automated git operations including commits, branch management,
 * and repository state verification.
 */
import { execSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { debug } from '../shared.js';
/**
 * Sanitize a string for safe use in git commands.
 * Removes shell metacharacters that could enable command injection.
 */
function sanitizeForGit(input) {
    // Remove or escape shell metacharacters
    return input.replace(/[`$\\;"'|&<>(){}[\]!#*?~]/g, '');
}
/**
 * Execute a git command safely using array arguments.
 */
export function execGit(command, cwd) {
    try {
        return execSync(command, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 }).trim();
    }
    catch (error) {
        debug('execGit failed', { command, error: String(error) });
        return null;
    }
}
/**
 * Checks if a directory is a git repository.
 */
export function isGitRepo(cwd) {
    return fs.existsSync(path.join(cwd, '.git'));
}
/**
 * Detects the main branch name (main or master) for the repository.
 */
export function detectMainBranch(cwd) {
    const main = execGit('git rev-parse --verify main', cwd);
    if (main)
        return 'main';
    const master = execGit('git rev-parse --verify master', cwd);
    if (master)
        return 'master';
    return 'main'; // default
}
/**
 * Returns the current git branch name, or null if not in a branch.
 */
export function getCurrentBranch(cwd) {
    return execGit('git branch --show-current', cwd);
}
/**
 * Checks if there are uncommitted changes in the working directory.
 */
export function hasUncommittedChanges(cwd) {
    const status = execGit('git status --porcelain', cwd);
    return status !== null && status.length > 0;
}
/**
 * Returns a list of file paths with uncommitted changes.
 */
export function getUncommittedFiles(cwd) {
    const status = execGit('git status --porcelain', cwd);
    if (!status)
        return [];
    return status.split('\n').filter(Boolean).map(line => line.slice(3));
}
/**
 * Creates a checkpoint commit with all current changes.
 */
export function createCheckpoint(cwd, message) {
    if (!hasUncommittedChanges(cwd))
        return false;
    try {
        // Sanitize message to prevent command injection
        const safeMessage = sanitizeForGit(message);
        const commitMessage = `checkpoint: ${safeMessage}\n\n Auto-checkpoint by GoodVibes`;
        execSync('git add -A', { cwd, stdio: 'pipe', timeout: 30000 });
        // Use spawnSync with array args to avoid shell injection
        const result = spawnSync('git', ['commit', '-m', commitMessage], { cwd, stdio: 'pipe' });
        return result.status === 0;
    }
    catch (error) {
        debug('createCheckpoint failed', { error: String(error) });
        return false;
    }
}
/**
 * Creates a new feature branch with a sanitized name.
 */
export function createFeatureBranch(cwd, name) {
    try {
        // Sanitize and normalize branch name
        const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        const branchName = `feature/${safeName}`;
        // Use spawnSync with array args to avoid shell injection
        const result = spawnSync('git', ['checkout', '-b', branchName], { cwd, stdio: 'pipe' });
        return result.status === 0;
    }
    catch (error) {
        debug('createFeatureBranch failed', { error: String(error) });
        return false;
    }
}
/**
 * Merges a feature branch into the main branch and deletes the feature branch.
 */
export function mergeFeatureBranch(cwd, featureBranch, mainBranch) {
    try {
        // Sanitize branch names to prevent command injection
        const safeFeature = sanitizeForGit(featureBranch);
        const safeMain = sanitizeForGit(mainBranch);
        // Use spawnSync with array args to avoid shell injection
        const checkout = spawnSync('git', ['checkout', safeMain], { cwd, stdio: 'pipe' });
        if (checkout.status !== 0)
            return false;
        const merge = spawnSync('git', ['merge', safeFeature, '--no-ff', '-m', `Merge ${safeFeature}`], { cwd, stdio: 'pipe' });
        if (merge.status !== 0)
            return false;
        const deleteBranch = spawnSync('git', ['branch', '-d', safeFeature], { cwd, stdio: 'pipe' });
        return deleteBranch.status === 0;
    }
    catch (error) {
        debug('mergeFeatureBranch failed', { error: String(error) });
        return false;
    }
}
