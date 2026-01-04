import { createCheckpoint as gitCheckpoint, hasUncommittedChanges } from '../automation/git-operations.js';
import { CHECKPOINT_TRIGGERS } from '../shared.js';
import { clearCheckpointTracking, getModifiedFileCount } from './file-tracker.js';
/** Determines if a checkpoint should be created based on file modification count */
export function shouldCheckpoint(state, _cwd) {
    // Check file count threshold
    const fileCount = getModifiedFileCount(state);
    if (fileCount >= CHECKPOINT_TRIGGERS.fileCountThreshold) {
        return { triggered: true, reason: `${fileCount} files modified` };
    }
    return { triggered: false, reason: '' };
}
/** Creates a git checkpoint if conditions are met or forced */
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
