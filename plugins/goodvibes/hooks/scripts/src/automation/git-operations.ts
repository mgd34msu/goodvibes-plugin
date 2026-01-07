/**
 * Git Operations
 *
 * Automated git operations including commits, branch management,
 * and repository state verification.
 */

import { exec, spawn } from 'child_process';
import * as path from 'path';
import { promisify } from 'util';

import { fileExists } from '../shared/file-utils.js';
import { debug } from '../shared/index.js';

const execAsync = promisify(exec);

/**
 * Promisified spawn that returns a promise resolving to exit code.
 * Used for commands where we need to pass arguments as an array to avoid shell injection.
 *
 * @param command - The command to execute
 * @param args - Array of arguments to pass to the command
 * @param options - Execution options including working directory and optional timeout
 * @returns Promise resolving to an object with exit code, stdout, and stderr
 */
function spawnAsync(
  command: string,
  args: string[],
  options: { cwd: string; timeout?: number }
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    const timeoutId = options.timeout
      ? setTimeout(() => {
          child.kill('SIGTERM');
          resolve({
            code: null,
            stdout,
            stderr: stderr + '\nProcess timed out',
          });
        }, options.timeout)
      : /* v8 ignore next -- @preserve defensive: all exported functions always provide timeout */ null;

    child.on('close', (code) => {
      /* v8 ignore else -- @preserve defensive: all exported functions always provide timeout */
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      resolve({ code, stdout, stderr });
    });

    child.on('error', (err) => {
      /* v8 ignore else -- @preserve defensive: all exported functions always provide timeout */
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      resolve({ code: null, stdout, stderr: err.message });
    });
  });
}

/**
 * Sanitizes a string for safe use in git commands.
 * Removes shell metacharacters that could enable command injection.
 *
 * @param input - The string to sanitize
 * @returns A sanitized string safe for use in git commands
 */
function sanitizeForGit(input: string): string {
  // Remove or escape shell metacharacters
  return input.replace(/[`$\\;"'|&<>(){}[\]!#*?~]/g, '');
}

/**
 * Executes a git command and returns the output.
 * Handles errors gracefully by returning null on failure.
 *
 * @param command - The git command to execute
 * @param cwd - The current working directory (repository root)
 * @returns Promise resolving to the trimmed command output, or null if the command failed
 *
 * @example
 * const branch = await execGit('git branch --show-current', '/repo');
 * if (branch) {
 *   console.log('Current branch:', branch);
 * }
 */
export async function execGit(
  command: string,
  cwd: string
): Promise<string | null> {
  try {
    const { stdout } = await execAsync(command, {
      cwd,
      encoding: 'utf-8',
      timeout: 30000,
    });
    return stdout.trim();
  } catch (error: unknown) {
    debug('execGit failed', { command, error: String(error) });
    return null;
  }
}

/**
 * Checks if a directory is a git repository by looking for a .git directory.
 *
 * @param cwd - The directory path to check
 * @returns Promise resolving to true if the directory contains a .git folder, false otherwise
 *
 * @example
 * if (await isGitRepo('/my-project')) {
 *   console.log('This is a git repository');
 * }
 */
export async function isGitRepo(cwd: string): Promise<boolean> {
  return fileExists(path.join(cwd, '.git'));
}

/**
 * Detects the main branch name for the repository.
 * Checks for 'main' first, then 'master', defaulting to 'main'.
 *
 * @param cwd - The current working directory (repository root)
 * @returns Promise resolving to the name of the main branch ('main' or 'master')
 *
 * @example
 * const mainBranch = await detectMainBranch('/repo');
 * console.log('Main branch is:', mainBranch);
 */
export async function detectMainBranch(cwd: string): Promise<string> {
  const main = await execGit('git rev-parse --verify main', cwd);
  if (main) {
    return 'main';
  }

  const master = await execGit('git rev-parse --verify master', cwd);
  if (master) {
    return 'master';
  }

  return 'main'; // default
}

/**
 * Returns the current git branch name.
 *
 * @param cwd - The current working directory (repository root)
 * @returns Promise resolving to the current branch name, or null if not on a branch (detached HEAD)
 *
 * @example
 * const branch = await getCurrentBranch('/repo');
 * if (branch === 'main') {
 *   console.log('On main branch');
 * }
 */
export async function getCurrentBranch(cwd: string): Promise<string | null> {
  return execGit('git branch --show-current', cwd);
}

/**
 * Checks if there are uncommitted changes in the working directory.
 * Includes both staged and unstaged changes.
 *
 * @param cwd - The current working directory (repository root)
 * @returns Promise resolving to true if there are uncommitted changes, false otherwise
 *
 * @example
 * if (await hasUncommittedChanges('/repo')) {
 *   console.log('You have uncommitted changes');
 * }
 */
export async function hasUncommittedChanges(cwd: string): Promise<boolean> {
  const status = await execGit('git status --porcelain', cwd);
  return status !== null && status.length > 0;
}

/**
 * Returns a list of file paths with uncommitted changes.
 * Parses git status --porcelain output to extract file paths.
 *
 * @param cwd - The current working directory (repository root)
 * @returns Promise resolving to an array of file paths with changes, or empty array if none
 *
 * @example
 * const files = await getUncommittedFiles('/repo');
 * files.forEach(f => console.log('Modified:', f));
 */
export async function getUncommittedFiles(cwd: string): Promise<string[]> {
  const status = await execGit('git status --porcelain', cwd);
  if (!status) {
    return [];
  }
  return status
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3));
}

/**
 * Creates a checkpoint commit with all current changes.
 * Stages all files with git add -A and commits with a prefixed message.
 * Returns false if there are no changes to commit.
 *
 * @param cwd - The current working directory (repository root)
 * @param message - The checkpoint message (will be prefixed with 'checkpoint:')
 * @returns Promise resolving to true if the checkpoint was created successfully, false otherwise
 *
 * @example
 * if (await createCheckpoint('/repo', 'pre-refactor state')) {
 *   console.log('Checkpoint created');
 * }
 */
export async function createCheckpoint(
  cwd: string,
  message: string
): Promise<boolean> {
  if (!(await hasUncommittedChanges(cwd))) {
    return false;
  }

  try {
    // Sanitize message to prevent command injection
    const safeMessage = sanitizeForGit(message);
    const commitMessage = `checkpoint: ${safeMessage}\n\n Auto-checkpoint by GoodVibes`;

    await execAsync('git add -A', { cwd, timeout: 30000 });
    // Use spawnAsync with array args to avoid shell injection
    const result = await spawnAsync('git', ['commit', '-m', commitMessage], {
      cwd,
      timeout: 30000,
    });
    return result.code === 0;
  } catch (error: unknown) {
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
 * @returns Promise resolving to true if the branch was created successfully, false otherwise
 *
 * @example
 * if (await createFeatureBranch('/repo', 'Add User Authentication')) {
 *   // Creates and checks out branch: feature/add-user-authentication
 * }
 */
export async function createFeatureBranch(
  cwd: string,
  name: string
): Promise<boolean> {
  try {
    // Sanitize and normalize branch name
    const safeName = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const branchName = `feature/${safeName}`;

    // Use spawnAsync with array args to avoid shell injection
    const result = await spawnAsync('git', ['checkout', '-b', branchName], {
      cwd,
      timeout: 30000,
    });
    return result.code === 0;
  } catch (error: unknown) {
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
 * @returns Promise resolving to true if merge and cleanup succeeded, false otherwise
 *
 * @example
 * if (await mergeFeatureBranch('/repo', 'feature/new-login', 'main')) {
 *   console.log('Feature merged and branch cleaned up');
 * }
 */
export async function mergeFeatureBranch(
  cwd: string,
  featureBranch: string,
  mainBranch: string
): Promise<boolean> {
  try {
    // Sanitize branch names to prevent command injection
    const safeFeature = sanitizeForGit(featureBranch);
    const safeMain = sanitizeForGit(mainBranch);

    // Use spawnAsync with array args to avoid shell injection
    const checkout = await spawnAsync('git', ['checkout', safeMain], {
      cwd,
      timeout: 30000,
    });
    if (checkout.code !== 0) {
      return false;
    }

    const merge = await spawnAsync(
      'git',
      ['merge', safeFeature, '--no-ff', '-m', `Merge ${safeFeature}`],
      { cwd, timeout: 30000 }
    );
    if (merge.code !== 0) {
      return false;
    }

    const deleteBranch = await spawnAsync(
      'git',
      ['branch', '-d', safeFeature],
      { cwd, timeout: 30000 }
    );
    return deleteBranch.code === 0;
  } catch (error: unknown) {
    debug('mergeFeatureBranch failed', { error: String(error) });
    return false;
  }
}
