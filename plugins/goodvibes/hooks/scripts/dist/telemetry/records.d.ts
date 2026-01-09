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
 * Ensures .goodvibes directories exist with lazy creation.
 * Creates the main directory and state/telemetry subdirectories as needed.
 *
 * @param goodVibesDir - Path to the .goodvibes directory
 * @param stateDir - Name of the state subdirectory
 * @param telemetryDir - Name of the telemetry subdirectory
 * @returns Promise that resolves when directories are created
 *
 * @example
 * await ensureGoodVibesDirs('/project/.goodvibes', 'state', 'telemetry');
 */
export declare function ensureGoodVibesDirs(goodVibesDir: string, stateDir: string, telemetryDir: string): Promise<void>;
/**
 * Writes a telemetry record to the monthly JSONL file.
 * Creates files named by year-month (e.g., 2024-01.jsonl).
 *
 * @param telemetryDir - Path to the telemetry directory
 * @param record - The TelemetryRecord to write
 * @returns Promise that resolves when record is written
 *
 * @example
 * await writeTelemetryRecord('/project/.goodvibes/telemetry', record);
 */
export declare function writeTelemetryRecord(telemetryDir: string, record: TelemetryRecord): Promise<void>;
/**
 * Creates a telemetry record from agent start entry and stop data.
 * Combines start metadata with parsed transcript data.
 *
 * @param startEntry - The agent entry from subagent-start
 * @param parsedTranscript - Parsed transcript with files, tools, and errors
 * @param keywords - Extracted keywords for categorization
 * @returns Complete TelemetryRecord ready for writing
 *
 * @example
 * const record = createTelemetryRecord(startEntry, parsedTranscript, ['backend', 'api']);
 */
export declare function createTelemetryRecord(startEntry: ActiveAgentEntry, parsedTranscript: ParsedTranscript, keywords: string[]): TelemetryRecord;
