import type { HooksState } from '../types/state.js';
/** Information about a potential crash recovery scenario */
export interface RecoveryInfo {
    /** Whether recovery is needed from a previous session */
    needsRecovery: boolean;
    /** Description of the previous feature being worked on */
    previousFeature: string | null;
    /** Branch name from the previous session */
    onBranch: string | null;
    /** List of files with uncommitted changes */
    uncommittedFiles: string[];
    /** List of pending issues from the previous session */
    pendingIssues: string[];
    /** Last checkpoint created before the crash */
    lastCheckpoint: HooksState['git']['checkpoints'][0] | null;
}
/** Checks if crash recovery is needed based on previous session state */
export declare function checkCrashRecovery(cwd: string): Promise<RecoveryInfo>;
/** Formats recovery information into a human-readable context string */
export declare function formatRecoveryContext(info: RecoveryInfo): string;
