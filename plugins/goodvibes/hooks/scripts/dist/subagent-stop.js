/**
 * Subagent Stop Hook (GoodVibes)
 *
 * Runs when a Claude Code subagent (Task tool) finishes.
 * Correlates with SubagentStart to calculate duration and capture telemetry.
 *
 * Actions:
 * - Look up stored entry by agent_id from active-agents.json
 * - Calculate duration_ms
 * - Parse agent_transcript_path for files modified, tools used, final output
 * - Extract keywords from transcript
 * - Write telemetry record to .goodvibes/telemetry/YYYY-MM.jsonl
 */
import * as fs from 'fs';
import { respond, readHookInput, loadAnalytics, saveAnalytics, debug, logError, } from './shared.js';
import { popActiveAgent, parseTranscript, extractKeywords, createTelemetryRecord, writeTelemetryRecord, } from './telemetry.js';
function createResponse(systemMessage) {
    return {
        continue: true,
        systemMessage,
    };
}
async function main() {
    try {
        debug('SubagentStop hook starting');
        const rawInput = await readHookInput();
        debug('Raw input shape:', Object.keys(rawInput || {}));
        const input = rawInput;
        // Extract subagent info (handle different field names)
        const agentId = input.agent_id || input.subagent_id || '';
        const agentType = input.agent_type || input.subagent_type || 'unknown';
        const transcriptPath = input.agent_transcript_path || input.subagent_transcript_path || '';
        debug('SubagentStop received input', {
            agent_id: agentId,
            agent_type: agentType,
            session_id: input.session_id,
            transcript_path: transcriptPath,
        });
        // Look up the active agent entry
        const startEntry = agentId ? popActiveAgent(agentId) : null;
        if (startEntry) {
            debug('Found matching start entry', {
                agent_id: startEntry.agent_id,
                agent_type: startEntry.agent_type,
                started_at: startEntry.started_at,
            });
            // Parse the transcript if available
            let parsedTranscript = {
                files_modified: [],
                tools_used: [],
                error_count: 0,
                success_indicators: [],
            };
            if (transcriptPath && fs.existsSync(transcriptPath)) {
                parsedTranscript = parseTranscript(transcriptPath);
                debug('Parsed transcript', {
                    files_modified: parsedTranscript.files_modified.length,
                    tools_used: parsedTranscript.tools_used.length,
                    error_count: parsedTranscript.error_count,
                });
            }
            // Read transcript content for keyword extraction
            let transcriptContent = '';
            if (transcriptPath && fs.existsSync(transcriptPath)) {
                try {
                    transcriptContent = fs.readFileSync(transcriptPath, 'utf-8');
                }
                catch (readError) {
                    debug('Failed to read transcript:', readError instanceof Error ? readError.message : 'unknown');
                }
            }
            // Extract keywords
            const keywords = extractKeywords(startEntry.task_description, transcriptContent, startEntry.agent_type);
            debug('Extracted keywords', keywords);
            // Create and write telemetry record
            const record = createTelemetryRecord(startEntry, parsedTranscript, keywords);
            writeTelemetryRecord(record);
            debug('Telemetry record written', {
                agent_id: record.agent_id,
                duration_ms: record.duration_ms,
                success: record.success,
            });
            // Update session analytics
            const analytics = loadAnalytics();
            if (analytics && analytics.subagents_spawned) {
                // Find and update the matching subagent entry
                const subagentEntry = analytics.subagents_spawned.find(s => s.type === startEntry.agent_type &&
                    s.started_at === startEntry.started_at);
                if (subagentEntry) {
                    subagentEntry.completed_at = new Date().toISOString();
                    subagentEntry.success = record.success;
                    saveAnalytics(analytics);
                }
            }
        }
        else {
            debug('No matching start entry found, creating minimal telemetry', {
                agent_id: agentId,
                agent_type: agentType,
            });
            // Even without a start entry, we can still record some telemetry
            if (agentId || agentType !== 'unknown') {
                // Parse transcript if available
                let parsedTranscript = {
                    files_modified: [],
                    tools_used: [],
                    error_count: 0,
                    success_indicators: [],
                };
                let transcriptContent = '';
                if (transcriptPath && fs.existsSync(transcriptPath)) {
                    parsedTranscript = parseTranscript(transcriptPath);
                    try {
                        transcriptContent = fs.readFileSync(transcriptPath, 'utf-8');
                    }
                    catch (readError) {
                        debug('Failed to read transcript:', readError instanceof Error ? readError.message : 'unknown');
                    }
                }
                const keywords = extractKeywords(undefined, transcriptContent, agentType);
                // Create a minimal telemetry record
                const nowTime = Date.now();
                const record = {
                    type: 'subagent_complete',
                    agent_id: agentId || 'unknown_' + nowTime,
                    agent_type: agentType,
                    session_id: input.session_id || '',
                    project_name: 'unknown',
                    started_at: new Date().toISOString(), // Unknown actual start
                    ended_at: new Date().toISOString(),
                    duration_ms: 0, // Unknown
                    cwd: input.cwd || process.cwd(),
                    files_modified: parsedTranscript.files_modified,
                    tools_used: parsedTranscript.tools_used,
                    keywords,
                    success: parsedTranscript.error_count === 0,
                };
                writeTelemetryRecord(record);
            }
        }
        respond(createResponse());
    }
    catch (error) {
        logError('SubagentStop main', error);
        respond(createResponse());
    }
}
main();
