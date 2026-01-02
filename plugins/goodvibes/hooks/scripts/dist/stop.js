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
import { loadAnalytics, saveAnalytics, CACHE_DIR, } from './shared.js';
function main() {
    try {
        const analytics = loadAnalytics();
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
            // Log summary to stderr (won't affect hook response)
            console.error(`GoodVibes session ended. Duration: ${durationMinutes}m, Tools: ${analytics.tool_usage.length}, Issues: ${analytics.issues_found}`);
        }
        // Clean up temporary files (but keep analytics)
        const tempFiles = ['detected-stack.json'];
        for (const file of tempFiles) {
            const filePath = path.join(CACHE_DIR, file);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
    }
    catch (error) {
        // Silent cleanup - don't disrupt session end
        console.error('GoodVibes cleanup warning:', error);
    }
}
main();
