/**
 * State Preservation Module for Pre-Compact Hook
 *
 * Handles saving session state and creating checkpoints before context compaction.
 */
import * as fs from 'fs';
import * as path from 'path';
import { loadState, saveState } from '../state.js';
import { createCheckpointIfNeeded } from '../post-tool-use/checkpoint-manager.js';
import { hasUncommittedChanges } from '../automation/git-operations.js';
import { ensureGoodVibesDir, debug, logError } from '../shared.js';
/**
 * Creates a checkpoint commit before context compaction if there are uncommitted changes.
 * This ensures work is not lost during the compaction process.
 */
export async function createPreCompactCheckpoint(cwd) {
    try {
        if (!hasUncommittedChanges(cwd)) {
            debug('No uncommitted changes, skipping pre-compact checkpoint');
            return;
        }
        const state = await loadState(cwd);
        const result = await createCheckpointIfNeeded(state, cwd, 'pre-compact: saving work before context compaction');
        if (result.created) {
            debug('Pre-compact checkpoint created', { message: result.message });
            await saveState(cwd, state);
        }
        else {
            debug('Pre-compact checkpoint skipped', { reason: result.message });
        }
    }
    catch (error) {
        logError('createPreCompactCheckpoint', error);
        // Don't throw - checkpoint failure shouldn't block compaction
    }
}
/**
 * Saves a session summary to `.goodvibes/state/last-session-summary.md`.
 * This summary can be used to restore context after compaction.
 */
export async function saveSessionSummary(cwd, summary) {
    try {
        await ensureGoodVibesDir(cwd);
        const stateDir = path.join(cwd, '.goodvibes', 'state');
        if (!fs.existsSync(stateDir)) {
            fs.mkdirSync(stateDir, { recursive: true });
        }
        const summaryPath = path.join(stateDir, 'last-session-summary.md');
        const timestamp = new Date().toISOString();
        const content = `# Session Summary

Generated: ${timestamp}

## Context Before Compaction

${summary}

---
*This summary was automatically saved before context compaction by GoodVibes.*
`;
        fs.writeFileSync(summaryPath, content, 'utf-8');
        debug('Saved session summary', { path: summaryPath });
    }
    catch (error) {
        logError('saveSessionSummary', error);
        // Don't throw - summary failure shouldn't block compaction
    }
}
/**
 * Returns a list of files modified during the current session.
 * Combines both modified and created files from the state.
 */
export function getFilesModifiedThisSession(state) {
    const files = new Set();
    // Add files modified this session
    if (state.files.modifiedThisSession) {
        for (const file of state.files.modifiedThisSession) {
            files.add(file);
        }
    }
    // Add files created this session
    if (state.files.createdThisSession) {
        for (const file of state.files.createdThisSession) {
            files.add(file);
        }
    }
    return Array.from(files);
}
