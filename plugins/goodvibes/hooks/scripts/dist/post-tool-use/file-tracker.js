/** Records a file modification in the session state */
export function trackFileModification(state, filePath) {
    if (!state.files.modifiedThisSession.includes(filePath)) {
        state.files.modifiedThisSession.push(filePath);
    }
    if (!state.files.modifiedSinceCheckpoint.includes(filePath)) {
        state.files.modifiedSinceCheckpoint.push(filePath);
    }
}
/** Records a new file creation in the session state */
export function trackFileCreation(state, filePath) {
    if (!state.files.createdThisSession.includes(filePath)) {
        state.files.createdThisSession.push(filePath);
    }
    trackFileModification(state, filePath);
}
/** Clears the list of files modified since the last checkpoint */
export function clearCheckpointTracking(state) {
    state.files.modifiedSinceCheckpoint = [];
}
/** Returns the count of files modified since the last checkpoint */
export function getModifiedFileCount(state) {
    return state.files.modifiedSinceCheckpoint.length;
}
