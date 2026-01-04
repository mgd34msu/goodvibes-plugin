import type { HooksState } from '../types/state.js';

/** Records a file modification in the session state */
export function trackFileModification(state: HooksState, filePath: string): void {
  // Use Set for O(1) lookups, then convert to array
  const modifiedSession = new Set(state.files.modifiedThisSession);
  const modifiedCheckpoint = new Set(state.files.modifiedSinceCheckpoint);

  modifiedSession.add(filePath);
  modifiedCheckpoint.add(filePath);

  state.files.modifiedThisSession = Array.from(modifiedSession);
  state.files.modifiedSinceCheckpoint = Array.from(modifiedCheckpoint);
}

/** Records a new file creation in the session state */
export function trackFileCreation(state: HooksState, filePath: string): void {
  // Use Set for O(1) lookups, then convert to array
  const created = new Set(state.files.createdThisSession);
  created.add(filePath);
  state.files.createdThisSession = Array.from(created);

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
