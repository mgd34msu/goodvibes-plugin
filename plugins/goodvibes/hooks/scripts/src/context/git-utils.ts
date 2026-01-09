/**
 * Git Utilities for Recent Activity Analysis
 *
 * Provides low-level git command execution and repository checks.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

import { debug } from '../shared/logging.js';

import { GIT_MAX_BUFFER } from './constants/recent-activity.js';

const execAsync = promisify(exec);

/**
 * Execute a git command and return output.
 * Handles errors gracefully by returning null on command failure.
 *
 * @param cwd - The current working directory (repository root)
 * @param args - Git command arguments (e.g., "log --oneline")
 * @returns Promise resolving to the trimmed command output, or null if the command failed
 */
export async function gitExec(cwd: string, args: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`git ${args}`, {
      cwd,
      encoding: 'utf-8',
      maxBuffer: GIT_MAX_BUFFER,
      timeout: 30000,
    });
    return stdout.trim();
  } catch (error: unknown) {
    debug(`recent-activity: Git command failed: git ${args}`, error);
    return null;
  }
}

/**
 * Check if directory is a git repository.
 *
 * @param cwd - The directory path to check
 * @returns Promise resolving to true if the directory is inside a git repository, false otherwise
 */
export async function isGitRepo(cwd: string): Promise<boolean> {
  const result = await gitExec(cwd, 'rev-parse --is-inside-work-tree');
  return result === 'true';
}
