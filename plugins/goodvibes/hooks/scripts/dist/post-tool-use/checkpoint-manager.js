import { createCheckpoint as gitCheckpoint, hasUncommittedChanges } from '../automation/git-operations.js';
import { CHECKPOINT_TRIGGERS } from '../shared.js';
import { clearCheckpointTracking, getModifiedFileCount } from './file-tracker.js';
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
export function shouldCheckpoint(state, _cwd) {
    // Check file count threshold
    const fileCount = getModifiedFileCount(state);
    if (fileCount >= CHECKPOINT_TRIGGERS.fileCountThreshold) {
        return { triggered: true, reason: `${fileCount} files modified` };
    }
    return { triggered: false, reason: '' };
}
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
export async function createCheckpointIfNeeded(state, cwd, forcedReason) {
    const trigger = forcedReason
        ? { triggered: true, reason: forcedReason }
        : shouldCheckpoint(state, cwd);
    if (!trigger.triggered) {
        return { created: false, message: '' };
    }
    if (!hasUncommittedChanges(cwd)) {
        return { created: false, message: 'No changes to checkpoint' };
    }
    const success = gitCheckpoint(cwd, trigger.reason);
    if (success) {
        // Update state
        clearCheckpointTracking(state);
        state.git.checkpoints.unshift({
            hash: '', // Would need to get from git
            message: trigger.reason,
            timestamp: new Date().toISOString(),
        });
        return { created: true, message: `Checkpoint: ${trigger.reason}` };
    }
    return { created: false, message: 'Checkpoint failed' };
}
