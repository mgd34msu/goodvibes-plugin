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
/** Checks if a git command is safe to run on the current branch */
export declare function checkBranchGuard(command: string, cwd: string, state: HooksState): GitGuardResult;
/** Checks if the current branch is ready to be merged */
export declare function checkMergeReadiness(_cwd: string, state: HooksState): GitGuardResult;
/** Checks if a command is a git command */
export declare function isGitCommand(command: string): boolean;
/** Checks if a command is a git merge command */
export declare function isMergeCommand(command: string): boolean;
