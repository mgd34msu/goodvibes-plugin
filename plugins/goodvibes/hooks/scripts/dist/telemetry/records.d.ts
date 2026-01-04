/**
 * Telemetry Records
 *
 * Provides telemetry record types and writing functionality.
 */
import type { ActiveAgentEntry } from './agents.js';
import type { ParsedTranscript } from './transcript.js';
/** Complete telemetry record for a subagent completion event. */
export interface TelemetryRecord {
    type: 'subagent_complete';
    agent_id: string;
    agent_type: string;
    session_id: string;
    project_name: string;
    started_at: string;
    ended_at: string;
    duration_ms: number;
    cwd: string;
    git_branch?: string;
    git_commit?: string;
    task_description?: string;
    files_modified: string[];
    tools_used: string[];
    keywords: string[];
    success: boolean;
    final_summary?: string;
}
/**
 * Ensure .goodvibes directories exist with lazy creation
 */
export declare function ensureGoodVibesDirs(goodVibesDir: string, stateDir: string, telemetryDir: string): void;
/**
 * Write a telemetry record to the monthly JSONL file
 */
export declare function writeTelemetryRecord(telemetryDir: string, record: TelemetryRecord): void;
/**
 * Create a telemetry record from agent start entry and stop data
 */
export declare function createTelemetryRecord(startEntry: ActiveAgentEntry, parsedTranscript: ParsedTranscript, keywords: string[]): TelemetryRecord;
