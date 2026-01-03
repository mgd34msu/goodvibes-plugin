/**
 * Stop Hook (GoodVibes)
 *
 * Cleanup and save analytics when session ends:
 * - Finalize analytics
 * - Log session summary
 * - Clean up temporary cache files
 */
import * as fs from 'fs';
import * as path from 'path';
import { respond, readHookInput, loadAnalytics, saveAnalytics, debug, logError, CACHE_DIR, } from './shared.js';
function createResponse(systemMessage) {
    return {
        continue: true,
        systemMessage,
    };
}
async function main() {
    try {
        debug('Stop hook starting');
        // Read hook input from stdin
        const input = await readHookInput();
        debug('Stop hook received input', { session_id: input.session_id });
        const analytics = loadAnalytics();
        debug('Loaded analytics', { has_analytics: !!analytics, session_id: analytics?.session_id });
        if (analytics) {
            // Finalize analytics
            analytics.ended_at = new Date().toISOString();
            // Calculate session duration
            const started = new Date(analytics.started_at).getTime();
            const ended = new Date(analytics.ended_at).getTime();
            const durationMinutes = Math.round((ended - started) / 60000);
            // Save final analytics
            saveAnalytics(analytics);
            // Create session summary file
            const summaryFile = path.join(CACHE_DIR, `session-${analytics.session_id}.json`);
            fs.writeFileSync(summaryFile, JSON.stringify({
                session_id: analytics.session_id,
                duration_minutes: durationMinutes,
                tools_used: analytics.tool_usage.length,
                unique_tools: [...new Set(analytics.tool_usage.map(u => u.tool))],
                skills_recommended: analytics.skills_recommended.length,
                validations_run: analytics.validations_run,
                issues_found: analytics.issues_found,
            }, null, 2));
            debug(`Session summary saved to ${summaryFile}`, {
                duration_minutes: durationMinutes,
                tools_used: analytics.tool_usage.length,
                issues_found: analytics.issues_found,
            });
        }
        // Clean up temporary files (but keep analytics)
        const tempFiles = ['detected-stack.json'];
        for (const file of tempFiles) {
            const filePath = path.join(CACHE_DIR, file);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                debug(`Cleaned up temp file: ${file}`);
            }
        }
        // Respond with success
        respond(createResponse());
    }
    catch (error) {
        logError('Stop main', error);
        respond(createResponse(`Cleanup error: ${error instanceof Error ? error.message : String(error)}`));
    }
}
main();
