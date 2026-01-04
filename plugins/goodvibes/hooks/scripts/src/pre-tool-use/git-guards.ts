import type { HooksState } from '../types/state.js';
import { getCurrentBranch, hasUncommittedChanges } from '../automation/git-operations.js';

/** Result of a git guard check */
export interface GitGuardResult {
  /** Whether the operation is allowed */
  allowed: boolean;
  /** Reason if operation is blocked */
  reason?: string;
  /** Warning message if operation is risky but allowed */
  warning?: string;
}

/** Checks if a git command is safe to run on the current branch */
export function checkBranchGuard(
  command: string,
  cwd: string,
  state: HooksState
): GitGuardResult {
  // Check for dangerous commands on main branch
  const currentBranch = getCurrentBranch(cwd);
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

/** Checks if the current branch is ready to be merged */
export function checkMergeReadiness(
  _cwd: string,
  state: HooksState
): GitGuardResult {
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

/** Checks if a command is a git command */
export function isGitCommand(command: string): boolean {
  return /^\s*git\s+/.test(command);
}

/** Checks if a command is a git merge command */
export function isMergeCommand(command: string): boolean {
  return /git\s+merge/.test(command);
}
