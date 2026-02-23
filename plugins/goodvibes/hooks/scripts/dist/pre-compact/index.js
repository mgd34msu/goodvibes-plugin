/**
 * Pre-Compact Hook (GoodVibes)
 *
 * Runs before context compression (auto or manual).
 * Can save important context before it's compacted.
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import { respond, readHookInput, loadAnalytics, debug, logError, CACHE_DIR, createResponse, parseTranscript, fileExists, isTestEnvironment, } from '../shared/index.js';
import { loadState } from '../state/index.js';
import { createPreCompactCheckpoint, saveSessionSummary, getFilesModifiedThisSession, } from './state-preservation.js';
import { RuntimeClient } from '../shared/runtime-client.js';
/**
 * Generates a human-readable session summary from analytics and state.
 * Includes session metadata, tool usage counts, validation stats,
 * list of modified files, and transcript context.
 *
 * @param analytics - Session analytics data or null if unavailable
 * @param modifiedFiles - Array of file paths modified during the session
 * @param transcriptSummary - Summary extracted from conversation transcript
 * @returns Formatted multi-line summary string
 */
function generateSessionSummary(analytics, modifiedFiles, transcriptSummary) {
    const lines = [];
    if (analytics) {
        lines.push(`Session ID: ${analytics.session_id}`);
        lines.push(`Started: ${analytics.started_at}`);
        lines.push(`Tools used: ${analytics.tool_usage.length}`);
        lines.push(`Validations run: ${analytics.validations_run}`);
        lines.push(`Issues found: ${analytics.issues_found}`);
        if (analytics.skills_recommended.length > 0) {
            lines.push(`Skills recommended: ${analytics.skills_recommended.join(', ')}`);
        }
    }
    const MAX_FILES_IN_SUMMARY = 20;
    if (modifiedFiles.length > 0) {
        lines.push('');
        lines.push('## Files Modified This Session');
        for (const file of modifiedFiles.slice(0, MAX_FILES_IN_SUMMARY)) {
            lines.push(`- ${file}`);
        }
        if (modifiedFiles.length > MAX_FILES_IN_SUMMARY) {
            lines.push(`- ... and ${modifiedFiles.length - MAX_FILES_IN_SUMMARY} more files`);
        }
    }
    if (transcriptSummary) {
        lines.push('');
        lines.push('## Last Context');
        lines.push(transcriptSummary);
    }
    return lines.join('\n');
}
/**
 * Main entry point for pre-compact hook.
 * Saves important session context before context compression occurs.
 * Creates a checkpoint commit, generates session summary, and backs up analytics.
 *
 * @returns Promise that resolves when hook processing completes
 */
async function runPreCompactHook() {
    try {
        debug('PreCompact hook starting');
        const input = await readHookInput();
        debug('PreCompact received input', {
            hook_event_name: input.hook_event_name,
        });
        // ─── Phase 6: Runtime engine integration (early-return when available) ───
        // Sends session:compact event and queries for a system message to inject
        // after compaction. Falls through to existing logic when not available.
        try {
            const runtimeClient = new RuntimeClient();
            if (runtimeClient.isAvailable()) {
                debug('Phase 6: runtime engine available, sending session:compact event');
                await runtimeClient.sendHookEvent('session:compact', input);
                const queryResult = await runtimeClient.query({ kind: 'get_system_message' });
                if (queryResult?.kind === 'system_message') {
                    debug('Phase 6: runtime returned system message for compact, using it');
                    respond(createResponse({ systemMessage: queryResult.message }));
                    return;
                }
            }
        }
        catch {
            // Runtime integration must never break the hook — fall through
            debug('Phase 6: runtime integration error, falling through to existing logic');
        }
        // ─── End Phase 6 integration ───
        const cwd = input.cwd || process.cwd();
        // Create checkpoint before compaction if there are uncommitted changes
        await createPreCompactCheckpoint(cwd);
        // Load state and analytics
        const state = await loadState(cwd);
        const analytics = await loadAnalytics();
        const modifiedFiles = getFilesModifiedThisSession(state);
        // Parse transcript for additional context
        let transcriptSummary = '';
        if (input.transcript_path && (await fileExists(input.transcript_path))) {
            const transcriptData = await parseTranscript(input.transcript_path);
            transcriptSummary = transcriptData.summary;
        }
        // Generate and save session summary
        const summary = generateSessionSummary(analytics, modifiedFiles, transcriptSummary);
        await saveSessionSummary(cwd, summary);
        // Save analytics backup before compact
        if (analytics) {
            const compactBackup = path.join(CACHE_DIR, 'pre-compact-backup.json');
            await fs.writeFile(compactBackup, JSON.stringify({
                ...analytics,
                compact_at: new Date().toISOString(),
                files_modified: modifiedFiles,
            }, null, 2));
            debug(`Saved pre-compact backup to ${compactBackup}`);
        }
        respond(createResponse());
    }
    catch (error) {
        logError('PreCompact main', error);
        respond(createResponse());
    }
}
// Re-export functions from sub-modules for testing
export { createPreCompactCheckpoint, saveSessionSummary, getFilesModifiedThisSession } from './state-preservation.js';
// Only run the hook if not in test mode
if (!isTestEnvironment()) {
    runPreCompactHook().catch((error) => {
        logError('PreCompact uncaught', error);
        respond(createResponse());
    });
}
