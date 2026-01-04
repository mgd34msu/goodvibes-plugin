import type { HooksState } from '../types/state.js';
/** Records a file modification in the session state */
export declare function trackFileModification(state: HooksState, filePath: string): void;
/** Records a new file creation in the session state */
export declare function trackFileCreation(state: HooksState, filePath: string): void;
/** Clears the list of files modified since the last checkpoint */
export declare function clearCheckpointTracking(state: HooksState): void;
/** Returns the count of files modified since the last checkpoint */
export declare function getModifiedFileCount(state: HooksState): number;
