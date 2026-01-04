/**
 * Telemetry Records
 *
 * Provides telemetry record types and writing functionality.
 */
import * as fs from 'fs';
import * as path from 'path';
import { debug } from '../shared.js';
// ============================================================================
// Directory Management
// ============================================================================
/**
 * Ensure .goodvibes directories exist with lazy creation
 */
export function ensureGoodVibesDirs(goodVibesDir, stateDir, telemetryDir) {
    const dirs = [
        goodVibesDir,
        path.join(goodVibesDir, stateDir),
        path.join(goodVibesDir, telemetryDir),
    ];
    for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            debug('Created directory: ' + dir);
        }
    }
}
// ============================================================================
// Telemetry Writing
// ============================================================================
/**
 * Write a telemetry record to the monthly JSONL file
 */
export function writeTelemetryRecord(telemetryDir, record) {
    // Get current month for filename (YYYY-MM)
    const now = new Date();
    const yearMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    const telemetryFile = path.join(telemetryDir, yearMonth + '.jsonl');
    // Append record as a single line of JSON
    const line = JSON.stringify(record) + '\n';
    fs.appendFileSync(telemetryFile, line);
    debug('Wrote telemetry record to ' + telemetryFile);
}
/**
 * Create a telemetry record from agent start entry and stop data
 */
export function createTelemetryRecord(startEntry, parsedTranscript, keywords) {
    const endedAt = new Date().toISOString();
    const startedAt = new Date(startEntry.started_at).getTime();
    const endedAtMs = new Date(endedAt).getTime();
    const durationMs = endedAtMs - startedAt;
    // Determine success based on error count and success indicators
    const success = parsedTranscript.error_count === 0 ||
        parsedTranscript.success_indicators.length > 0;
    return {
        type: 'subagent_complete',
        agent_id: startEntry.agent_id,
        agent_type: startEntry.agent_type,
        session_id: startEntry.session_id,
        project_name: startEntry.project_name,
        started_at: startEntry.started_at,
        ended_at: endedAt,
        duration_ms: durationMs,
        cwd: startEntry.cwd,
        git_branch: startEntry.git_branch,
        git_commit: startEntry.git_commit,
        task_description: startEntry.task_description,
        files_modified: parsedTranscript.files_modified,
        tools_used: parsedTranscript.tools_used,
        keywords,
        success,
        final_summary: parsedTranscript.final_output,
    };
}
