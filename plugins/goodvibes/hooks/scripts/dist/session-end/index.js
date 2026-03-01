/**
 * Session End Hook (GoodVibes)
 *
 * Runs when a Claude Code session ends.
 * Handles cleanup, logging, and saving session state.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { respond, readHookInput, loadAnalytics, saveAnalytics, debug, logError, CACHE_DIR, createResponse, isTestEnvironment, ensureGlobalAnalyticsDir, } from '../shared/index.js';
import { RuntimeClient } from '../shared/runtime-client.js';
/** Milliseconds per minute for duration calculation. */
const MS_PER_MINUTE = 60000;
/**
 * Kill any tmux panes registered for this session in .goodvibes/active-panes.json.
 * Best-effort: never throws. Removes the session entry after cleanup.
 */
function cleanupDashboardPanes(sessionId) {
    try {
        const goodvibesDir = process.env.GOODVIBES_DIR
            || join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), '.goodvibes');
        const stateFile = join(goodvibesDir, 'active-panes.json');
        if (!existsSync(stateFile))
            return;
        let allState = {};
        try {
            allState = JSON.parse(readFileSync(stateFile, 'utf-8'));
        }
        catch {
            return; // Corrupt file — nothing to clean up
        }
        const entry = allState[sessionId];
        if (!entry)
            return;
        // Kill each tracked pane (best-effort per pane)
        for (const pane of [entry.mini, entry.full]) {
            if (pane !== null && pane !== undefined) {
                try {
                    execFileSync('tmux', ['kill-pane', '-t', pane.paneId], { timeout: 5000 });
                }
                catch {
                    // Pane already gone — ignore
                }
            }
        }
        // Remove this session entry
        delete allState[sessionId];
        // Always write back (even if empty) to avoid race with concurrent writers
        writeFileSync(stateFile, JSON.stringify(allState, null, 2));
    }
    catch {
        // Best-effort — never throw from cleanup
    }
}
/** Main entry point for session-end hook. Finalizes analytics and saves session summary. */
async function runSessionEndHook() {
    try {
        debug('SessionEnd hook starting');
        // Ensure global analytics directory exists (lightweight, redundant safety check)
        ensureGlobalAnalyticsDir();
        const input = await readHookInput();
        // ─── Phase 6: Runtime engine integration (fire-and-forget, additive only) ───
        // Sends session:ending event to the runtime engine for lifecycle tracking.
        // ALWAYS falls through to existing cleanup logic — no early-return here.
        try {
            const runtimeClient = new RuntimeClient(input.session_id);
            if (runtimeClient.isAvailable()) {
                debug('Phase 6: runtime engine available, sending session:ending event');
                void runtimeClient.sendHookEvent('session:ending', input);
            }
        }
        catch {
            // Runtime integration must never break session-end cleanup
        }
        // ─── End Phase 6 integration ───
        debug('SessionEnd received input', {
            session_id: input.session_id,
        });
        // Clean up any analytics dashboard panes for this session.
        // The dashboard handler keys panes by the JSONL-derived session ID
        // (basename of transcript_path without .jsonl), which differs from
        // input.session_id (Claude Code's internal UUID). Derive the matching key.
        const jsonlSessionId = input.transcript_path
            ? basename(input.transcript_path, '.jsonl')
            : input.session_id;
        cleanupDashboardPanes(jsonlSessionId);
        const analytics = await loadAnalytics();
        if (analytics) {
            // Finalize analytics
            analytics.ended_at = new Date().toISOString();
            // Calculate session duration
            const started = new Date(analytics.started_at).getTime();
            const ended = new Date(analytics.ended_at).getTime();
            const durationMinutes = Math.round((ended - started) / MS_PER_MINUTE);
            // Save final analytics
            await saveAnalytics(analytics);
            // Create session summary file
            const summaryFile = join(CACHE_DIR, `session-${analytics.session_id}.json`);
            await writeFile(summaryFile, JSON.stringify({
                session_id: analytics.session_id,
                duration_minutes: durationMinutes,
                tools_used: analytics.tool_usage.length,
                unique_tools: [...new Set(analytics.tool_usage.map((u) => u.tool))],
                skills_recommended: analytics.skills_recommended.length,
                validations_run: analytics.validations_run,
                issues_found: analytics.issues_found,
                ended_reason: 'session_end',
            }, null, 2));
            debug(`Session ended. Duration: ${durationMinutes}m, Tools: ${analytics.tool_usage.length}`);
        }
        respond(createResponse());
    }
    catch (error) {
        logError('SessionEnd main', error);
        respond(createResponse());
    }
}
// Only run the hook if not in test mode
/* v8 ignore next 5 - test environment check */
if (!isTestEnvironment()) {
    runSessionEndHook().catch((error) => {
        logError('SessionEnd uncaught', error);
        respond(createResponse());
    });
}
