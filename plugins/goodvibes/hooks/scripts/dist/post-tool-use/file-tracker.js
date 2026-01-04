/**
 * Records a file modification in the session state.
 * Adds the file path to both modifiedThisSession and modifiedSinceCheckpoint lists.
 * Uses Set internally for O(1) deduplication.
 *
 * @param state - The current hooks session state to update
 * @param filePath - Absolute path to the modified file
 *
 * @example
 * trackFileModification(state, '/project/src/utils.ts');
 */
export function trackFileModification(state, filePath) {
    // Use Set for O(1) lookups, then convert to array
    const modifiedSession = new Set(state.files.modifiedThisSession);
    const modifiedCheckpoint = new Set(state.files.modifiedSinceCheckpoint);
    modifiedSession.add(filePath);
    modifiedCheckpoint.add(filePath);
    state.files.modifiedThisSession = Array.from(modifiedSession);
    state.files.modifiedSinceCheckpoint = Array.from(modifiedCheckpoint);
}
/**
 * Records a new file creation in the session state.
 * Adds to createdThisSession list and also tracks as a modification.
 * Uses Set internally for O(1) deduplication.
 *
 * @param state - The current hooks session state to update
 * @param filePath - Absolute path to the newly created file
 *
 * @example
 * trackFileCreation(state, '/project/src/newFile.ts');
 */
export function trackFileCreation(state, filePath) {
    // Use Set for O(1) lookups, then convert to array
    const created = new Set(state.files.createdThisSession);
    created.add(filePath);
    state.files.createdThisSession = Array.from(created);
    trackFileModification(state, filePath);
}
/**
 * Clears the list of files modified since the last checkpoint.
 * Called after a successful checkpoint to reset the tracking counter.
 *
 * @param state - The current hooks session state to update
 *
 * @example
 * // After creating a checkpoint
 * clearCheckpointTracking(state);
 */
export function clearCheckpointTracking(state) {
    state.files.modifiedSinceCheckpoint = [];
}
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
export function getModifiedFileCount(state) {
    return state.files.modifiedSinceCheckpoint.length;
}
