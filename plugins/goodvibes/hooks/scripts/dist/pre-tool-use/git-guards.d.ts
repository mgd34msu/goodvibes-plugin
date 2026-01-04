import type { HooksState } from '../types/state.js';
/** Result of a git guard check */
export interface GitGuardResult {
    /** Whether the operation is allowed */
    allowed: boolean;
    /** Reason if operation is blocked */
    reason?: string;
    /** Warning message if operation is risky but allowed */
    warning?: string;
}
/**
 * Checks if a git command is safe to run on the current branch.
 * Prevents dangerous operations like force push to main, hard reset on main,
 * and warns about risky operations like rebasing the main branch.
 *
 * @param command - The git command string to evaluate
 * @param cwd - The current working directory (repository root)
 * @param state - The current hooks state containing git configuration
 * @returns Promise resolving to a GitGuardResult indicating if the operation is allowed, blocked, or has warnings
 *
 * @example
 * const result = await checkBranchGuard('git push --force origin main', '/repo', state);
 * if (!result.allowed) {
 *   console.error(result.reason);
 * }
 */
export declare function checkBranchGuard(command: string, cwd: string, state: HooksState): Promise<GitGuardResult>;
/**
 * Checks if the current branch is ready to be merged.
 * Validates that tests are passing, build is successful, and there are no pending fixes.
 *
 * @param _cwd - The current working directory (unused but kept for API consistency)
 * @param state - The current hooks state containing test and build status
 * @returns A GitGuardResult indicating if merge is allowed or blocked with reason
 *
 * @example
 * const result = checkMergeReadiness('/repo', state);
 * if (!result.allowed) {
 *   console.error('Cannot merge:', result.reason);
 * }
 */
export declare function checkMergeReadiness(_cwd: string, state: HooksState): GitGuardResult;
/**
 * Checks if a command string is a git command.
 *
 * @param command - The command string to check
 * @returns True if the command starts with 'git', false otherwise
 *
 * @example
 * isGitCommand('git status');  // true
 * isGitCommand('npm install'); // false
 */
export declare function isGitCommand(command: string): boolean;
/**
 * Checks if a command string is a git merge command.
 *
 * @param command - The command string to check
 * @returns True if the command contains 'git merge', false otherwise
 *
 * @example
 * isMergeCommand('git merge feature-branch'); // true
 * isMergeCommand('git status');               // false
 */
export declare function isMergeCommand(command: string): boolean;
