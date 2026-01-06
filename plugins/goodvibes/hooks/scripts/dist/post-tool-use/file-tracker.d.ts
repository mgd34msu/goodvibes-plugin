/**
 * File Tracker
 *
 * Tracks file modifications and creations across the session to trigger automation.
 * Maintains separate lists for session-level tracking (all modifications) and
 * checkpoint-level tracking (modifications since last checkpoint commit).
 *
 * @module post-tool-use/file-tracker
 * @see {@link ./checkpoint-manager} for checkpoint threshold logic
 */
import type { HooksState } from '../types/state.js';
/**
 * Records a file modification in the session state.
 * Adds the file path to both modifiedThisSession and modifiedSinceCheckpoint lists.
 * Uses Set internally for O(1) deduplication.
 *
 * @param state - The current hooks session state to update
 * @param filePath - Absolute path to the modified file
 * @returns A new HooksState object with updated file tracking
 *
 * @example
 * const newState = trackFileModification(state, '/project/src/utils.ts');
 */
export declare function trackFileModification(state: HooksState, filePath: string): HooksState;
/**
 * Records a new file creation in the session state.
 * Adds to createdThisSession list and also tracks as a modification.
 * Uses Set internally for O(1) deduplication.
 *
 * @param state - The current hooks session state to update
 * @param filePath - Absolute path to the newly created file
 * @returns A new HooksState object with updated file tracking
 *
 * @example
 * const newState = trackFileCreation(state, '/project/src/newFile.ts');
 */
export declare function trackFileCreation(state: HooksState, filePath: string): HooksState;
/**
 * Clears the list of files modified since the last checkpoint.
 * Called after a successful checkpoint to reset the tracking counter.
 *
 * @param state - The current hooks session state to update
 * @returns A new HooksState object with cleared checkpoint tracking
 *
 * @example
 * // After creating a checkpoint
 * const newState = clearCheckpointTracking(state);
 */
export declare function clearCheckpointTracking(state: HooksState): HooksState;
/**
 * Returns the count of files modified since the last checkpoint.
 * Used to determine if threshold has been reached for creating checkpoints or running builds.
 *
 * @param state - The current hooks session state containing file tracking data
 * @returns The number of unique files modified since the last checkpoint
 *
 * @example
 * const count = getModifiedFileCount(state);
 * if (count >= 5) {
 *   console.log('Threshold reached, creating checkpoint');
 * }
 */
export declare function getModifiedFileCount(state: HooksState): number;
