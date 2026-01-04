import { getCurrentBranch } from '../automation/git-operations.js';
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
export async function checkBranchGuard(command, cwd, state) {
    // Check for dangerous commands on main branch
    const currentBranch = await getCurrentBranch(cwd);
    const mainBranch = state.git.mainBranch;
    // Prevent force push to main
    if (/git\s+push\s+.*--force/.test(command) || /git\s+push\s+-f/.test(command)) {
        if (currentBranch === mainBranch) {
            return {
                allowed: false,
                reason: `Force push to ${mainBranch} is not allowed`
            };
        }
        return {
            allowed: true,
            warning: 'Force push detected - ensure this is intentional'
        };
    }
    // Prevent hard reset on main
    if (/git\s+reset\s+--hard/.test(command) && currentBranch === mainBranch) {
        return {
            allowed: false,
            reason: `Hard reset on ${mainBranch} is not allowed`
        };
    }
    // Warn about rebasing main
    if (/git\s+rebase/.test(command) && currentBranch === mainBranch) {
        return {
            allowed: true,
            warning: `Rebasing ${mainBranch} - ensure this is intentional`
        };
    }
    return { allowed: true };
}
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
export function checkMergeReadiness(_cwd, state) {
    // Check if tests are passing
    if (state.tests.failingFiles.length > 0) {
        return {
            allowed: false,
            reason: `Cannot merge: ${state.tests.failingFiles.length} test files failing`
        };
    }
    // Check if build is passing
    if (state.build.status === 'failing') {
        return {
            allowed: false,
            reason: 'Cannot merge: build is failing'
        };
    }
    // Check for pending fixes
    if (state.tests.pendingFixes.length > 0) {
        return {
            allowed: false,
            reason: `Cannot merge: ${state.tests.pendingFixes.length} pending test fixes`
        };
    }
    return { allowed: true };
}
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
export function isGitCommand(command) {
    return /^\s*git\s+/.test(command);
}
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
export function isMergeCommand(command) {
    return /git\s+merge/.test(command);
}
