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
 * Sanitizes a string for safe use in git commands.
 * Removes shell metacharacters that could enable command injection.
 *
 * @param input - The string to sanitize
 * @returns A sanitized string safe for use in git commands
 */
function sanitizeForGit(input) {
    // Remove or escape shell metacharacters
    return input.replace(/[`$\\;"'|&<>(){}[\]!#*?~]/g, '');
}
/**
 * Executes a git command and returns the output.
 * Handles errors gracefully by returning null on failure.
 *
 * @param command - The git command to execute
 * @param cwd - The current working directory (repository root)
 * @returns The trimmed command output, or null if the command failed
 *
 * @example
 * const branch = execGit('git branch --show-current', '/repo');
 * if (branch) {
 *   console.log('Current branch:', branch);
 * }
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
 * Checks if a directory is a git repository by looking for a .git directory.
 *
 * @param cwd - The directory path to check
 * @returns True if the directory contains a .git folder, false otherwise
 *
 * @example
 * if (isGitRepo('/my-project')) {
 *   console.log('This is a git repository');
 * }
 */
export function isGitRepo(cwd) {
    return fs.existsSync(path.join(cwd, '.git'));
}
/**
 * Detects the main branch name for the repository.
 * Checks for 'main' first, then 'master', defaulting to 'main'.
 *
 * @param cwd - The current working directory (repository root)
 * @returns The name of the main branch ('main' or 'master')
 *
 * @example
 * const mainBranch = detectMainBranch('/repo');
 * console.log('Main branch is:', mainBranch);
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
 * Returns the current git branch name.
 *
 * @param cwd - The current working directory (repository root)
 * @returns The current branch name, or null if not on a branch (detached HEAD)
 *
 * @example
 * const branch = getCurrentBranch('/repo');
 * if (branch === 'main') {
 *   console.log('On main branch');
 * }
 */
export function getCurrentBranch(cwd) {
    return execGit('git branch --show-current', cwd);
}
/**
 * Checks if there are uncommitted changes in the working directory.
 * Includes both staged and unstaged changes.
 *
 * @param cwd - The current working directory (repository root)
 * @returns True if there are uncommitted changes, false otherwise
 *
 * @example
 * if (hasUncommittedChanges('/repo')) {
 *   console.log('You have uncommitted changes');
 * }
 */
export function hasUncommittedChanges(cwd) {
    const status = execGit('git status --porcelain', cwd);
    return status !== null && status.length > 0;
}
/**
 * Returns a list of file paths with uncommitted changes.
 * Parses git status --porcelain output to extract file paths.
 *
 * @param cwd - The current working directory (repository root)
 * @returns An array of file paths with changes, or empty array if none
 *
 * @example
 * const files = getUncommittedFiles('/repo');
 * files.forEach(f => console.log('Modified:', f));
 */
export function getUncommittedFiles(cwd) {
    const status = execGit('git status --porcelain', cwd);
    if (!status)
        return [];
    return status.split('\n').filter(Boolean).map(line => line.slice(3));
}
/**
 * Creates a checkpoint commit with all current changes.
 * Stages all files with git add -A and commits with a prefixed message.
 * Returns false if there are no changes to commit.
 *
 * @param cwd - The current working directory (repository root)
 * @param message - The checkpoint message (will be prefixed with 'checkpoint:')
 * @returns True if the checkpoint was created successfully, false otherwise
 *
 * @example
 * if (createCheckpoint('/repo', 'pre-refactor state')) {
 *   console.log('Checkpoint created');
 * }
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
 * Normalizes the name to lowercase with hyphens and prefixes with 'feature/'.
 *
 * @param cwd - The current working directory (repository root)
 * @param name - The feature name (will be sanitized and normalized)
 * @returns True if the branch was created successfully, false otherwise
 *
 * @example
 * if (createFeatureBranch('/repo', 'Add User Authentication')) {
 *   // Creates and checks out branch: feature/add-user-authentication
 * }
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
 * Performs a no-fast-forward merge to preserve branch history.
 *
 * @param cwd - The current working directory (repository root)
 * @param featureBranch - The name of the feature branch to merge
 * @param mainBranch - The name of the main branch to merge into
 * @returns True if merge and cleanup succeeded, false otherwise
 *
 * @example
 * if (mergeFeatureBranch('/repo', 'feature/new-login', 'main')) {
 *   console.log('Feature merged and branch cleaned up');
 * }
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
