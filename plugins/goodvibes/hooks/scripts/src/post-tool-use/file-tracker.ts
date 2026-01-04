import type { HooksState } from '../types/state.js';

/** Records a file modification in the session state */
export function trackFileModification(state: HooksState, filePath: string): void {
  if (!state.files.modifiedThisSession.includes(filePath)) {
    state.files.modifiedThisSession.push(filePath);
  }
  if (!state.files.modifiedSinceCheckpoint.includes(filePath)) {
    state.files.modifiedSinceCheckpoint.push(filePath);
  }
}

/** Records a new file creation in the session state */
export function trackFileCreation(state: HooksState, filePath: string): void {
  if (!state.files.createdThisSession.includes(filePath)) {
    state.files.createdThisSession.push(filePath);
  }
  trackFileModification(state, filePath);
}

/** Clears the list of files modified since the last checkpoint */
export function clearCheckpointTracking(state: HooksState): void {
  state.files.modifiedSinceCheckpoint = [];
}

/** Returns the count of files modified since the last checkpoint */
export function getModifiedFileCount(state: HooksState): number {
  return state.files.modifiedSinceCheckpoint.length;
}
