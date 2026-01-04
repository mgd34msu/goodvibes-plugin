/**
 * State Preservation Module for Pre-Compact Hook
 *
 * Handles saving session state and creating checkpoints before context compaction.
 */
import type { HooksState } from '../types/state.js';
/**
 * Creates a checkpoint commit before context compaction if there are uncommitted changes.
 * This ensures work is not lost during the compaction process.
 */
export declare function createPreCompactCheckpoint(cwd: string): Promise<void>;
/**
 * Saves a session summary to `.goodvibes/state/last-session-summary.md`.
 * This summary can be used to restore context after compaction.
 */
export declare function saveSessionSummary(cwd: string, summary: string): Promise<void>;
/**
 * Returns a list of files modified during the current session.
 * Combines both modified and created files from the state.
 */
export declare function getFilesModifiedThisSession(state: HooksState): string[];
