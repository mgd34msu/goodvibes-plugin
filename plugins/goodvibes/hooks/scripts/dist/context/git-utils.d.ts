/**
 * Git Utilities for Recent Activity Analysis
 *
 * Provides low-level git command execution and repository checks.
 */
/**
 * Execute a git command and return output.
 * Handles errors gracefully by returning null on command failure.
 *
 * @param cwd - The current working directory (repository root)
 * @param args - Git command arguments (e.g., "log --oneline")
 * @returns Promise resolving to the trimmed command output, or null if the command failed
 */
export declare function gitExec(cwd: string, args: string): Promise<string | null>;
/**
 * Check if directory is a git repository.
 *
 * @param cwd - The directory path to check
 * @returns Promise resolving to true if the directory is inside a git repository, false otherwise
 */
export declare function isGitRepo(cwd: string): Promise<boolean>;
