import type { HooksState } from '../types/state.js';
/** Result of checking whether a checkpoint should be created */
export interface CheckpointTrigger {
    /** Whether a checkpoint should be triggered */
    triggered: boolean;
    /** Reason for triggering the checkpoint */
    reason: string;
}
/**
 * Determines if a checkpoint should be created based on file modification count.
 * Compares the number of modified files since last checkpoint against the configured threshold.
 *
 * @param state - The current hooks session state containing file modification tracking
 * @param _cwd - Current working directory (unused, reserved for future use)
 * @returns CheckpointTrigger with `triggered` boolean and `reason` string explaining the trigger
 *
 * @example
 * const trigger = shouldCheckpoint(state, '/project');
 * if (trigger.triggered) {
 *   console.log('Checkpoint needed:', trigger.reason);
 * }
 */
export declare function shouldCheckpoint(state: HooksState, _cwd: string): CheckpointTrigger;
/**
 * Creates a git checkpoint if conditions are met or if a forced reason is provided.
 * Checks for uncommitted changes before creating the checkpoint.
 * Updates state with checkpoint info and clears file tracking on success.
 *
 * @param state - The current hooks session state to update with checkpoint info
 * @param cwd - Current working directory (git repository root)
 * @param forcedReason - Optional reason to force checkpoint creation regardless of threshold
 * @returns Object with `created` boolean and `message` describing the result
 *
 * @example
 * // Conditional checkpoint based on thresholds
 * const result = await createCheckpointIfNeeded(state, '/project');
 *
 * @example
 * // Forced checkpoint with custom reason
 * const result = await createCheckpointIfNeeded(state, '/project', 'pre-refactor backup');
 */
export declare function createCheckpointIfNeeded(state: HooksState, cwd: string, forcedReason?: string): Promise<{
    created: boolean;
    message: string;
}>;
