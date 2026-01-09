/**
 * Pre-Compact Hook (GoodVibes)
 *
 * Runs before context compression (auto or manual).
 * Can save important context before it's compacted.
 */
export { createPreCompactCheckpoint, saveSessionSummary, getFilesModifiedThisSession } from './state-preservation.js';
