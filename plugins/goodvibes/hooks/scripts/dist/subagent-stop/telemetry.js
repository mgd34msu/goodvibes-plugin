/**
 * Subagent Telemetry
 *
 * Persists and retrieves agent tracking data for telemetry analysis.
 * Records agent sessions, keywords, and outcomes to disk for monitoring
 * agent performance and identifying improvement opportunities.
 *
 * @module subagent-stop/telemetry
 * @see {@link ../types/telemetry} for telemetry data structures
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import { ensureGoodVibesDir, parseTranscript, extractKeywords, fileExists } from '../shared/index.js';
import { debug } from '../shared/logging.js';
/** Relative path to the agent tracking file within .goodvibes */
const TRACKING_FILE = 'state/agent-tracking.json';
/** Persists agent tracking data to disk */
export async function saveAgentTracking(cwd, tracking) {
    await ensureGoodVibesDir(cwd);
    const trackingPath = path.join(cwd, '.goodvibes', TRACKING_FILE);
    let trackings = {};
    if (await fileExists(trackingPath)) {
        try {
            trackings = JSON.parse(await fs.readFile(trackingPath, 'utf-8'));
        }
        catch (error) {
            debug('telemetry operation failed', { error: String(error) });
        }
    }
    trackings[tracking.agent_id] = tracking;
    await fs.writeFile(trackingPath, JSON.stringify(trackings, null, 2));
}
/** Retrieves tracking data for a specific agent */
export async function getAgentTracking(cwd, agentId) {
    const trackingPath = path.join(cwd, '.goodvibes', TRACKING_FILE);
    if (!(await fileExists(trackingPath)))
        return null;
    try {
        const trackings = JSON.parse(await fs.readFile(trackingPath, 'utf-8'));
        return trackings[agentId] || null;
    }
    catch (error) {
        debug('getAgentTracking failed', { error: String(error) });
        return null;
    }
}
/** Removes tracking data for a specific agent */
export async function removeAgentTracking(cwd, agentId) {
    const trackingPath = path.join(cwd, '.goodvibes', TRACKING_FILE);
    if (!(await fileExists(trackingPath)))
        return;
    try {
        const trackings = JSON.parse(await fs.readFile(trackingPath, 'utf-8'));
        delete trackings[agentId];
        await fs.writeFile(trackingPath, JSON.stringify(trackings, null, 2));
    }
    catch (error) {
        debug('telemetry operation failed', { error: String(error) });
    }
}
/** Appends a telemetry entry to the monthly log file */
export async function writeTelemetryEntry(cwd, entry) {
    await ensureGoodVibesDir(cwd);
    const now = new Date();
    const fileName = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.jsonl`;
    const telemetryPath = path.join(cwd, '.goodvibes', 'telemetry', fileName);
    await fs.appendFile(telemetryPath, JSON.stringify(entry) + '\n');
}
/** Builds a telemetry entry from tracking data and transcript */
export async function buildTelemetryEntry(tracking, transcriptPath, status) {
    const transcriptData = await parseTranscript(transcriptPath);
    const allText = transcriptData.summary + ' ' + transcriptData.filesModified.join(' ');
    const keywords = extractKeywords(allText);
    // Add agent type as keyword
    const agentName = tracking.agent_type.split(':').pop() || tracking.agent_type;
    if (!keywords.includes(agentName)) {
        keywords.unshift(agentName);
    }
    const endedAt = new Date().toISOString();
    const startedAt = new Date(tracking.started_at);
    const duration_ms = new Date(endedAt).getTime() - startedAt.getTime();
    return {
        event: 'subagent_complete',
        agent_id: tracking.agent_id,
        agent_type: tracking.agent_type,
        session_id: tracking.session_id,
        project: tracking.project,
        project_name: tracking.project_name,
        git_branch: tracking.git_branch,
        git_commit: tracking.git_commit,
        started_at: tracking.started_at,
        ended_at: endedAt,
        duration_ms,
        status,
        keywords,
        files_modified: transcriptData.filesModified,
        tools_used: transcriptData.toolsUsed,
        summary: transcriptData.summary,
    };
}
