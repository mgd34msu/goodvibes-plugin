import type { HooksState } from '../types/state.js';
/** Result of checking whether a checkpoint should be created */
export interface CheckpointTrigger {
    /** Whether a checkpoint should be triggered */
    triggered: boolean;
    /** Reason for triggering the checkpoint */
    reason: string;
}
/** Determines if a checkpoint should be created based on file modification count */
export declare function shouldCheckpoint(state: HooksState, _cwd: string): CheckpointTrigger;
/** Creates a git checkpoint if conditions are met or forced */
export declare function createCheckpointIfNeeded(state: HooksState, cwd: string, forcedReason?: string): Promise<{
    created: boolean;
    message: string;
}>;
