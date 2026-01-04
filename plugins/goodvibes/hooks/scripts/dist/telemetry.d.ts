/**
 * Telemetry utilities for GoodVibes hooks
 *
 * Provides:
 * - Active agent state management for SubagentStart/Stop correlation
 * - Transcript parsing for tool usage and file modifications
 * - Keyword extraction for categorization
 * - JSONL telemetry record writing
 */
/** Represents an active agent entry being tracked for telemetry. */
export interface ActiveAgentEntry {
    agent_id: string;
    agent_type: string;
    session_id: string;
    cwd: string;
    project_name: string;
    started_at: string;
    git_branch?: string;
    git_commit?: string;
    task_description?: string;
}
/** State containing all currently active agents. */
export interface ActiveAgentsState {
    agents: Record<string, ActiveAgentEntry>;
    last_updated: string;
}
/** Parsed transcript data extracted from session logs. */
export interface ParsedTranscript {
    files_modified: string[];
    tools_used: string[];
    final_output?: string;
    error_count: number;
    success_indicators: string[];
}
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
/** Git branch and commit information. */
export interface GitInfo {
    branch?: string;
    commit?: string;
}
/** Keyword categories for classifying agent tasks and transcript content. */
export declare const KEYWORD_CATEGORIES: Record<string, string[]>;
/**
 * Ensure .goodvibes directories exist with lazy creation
 */
export declare function ensureGoodVibesDirs(): void;
/**
 * Get git branch and commit info for the current directory
 */
export declare function getGitInfo(cwd: string): GitInfo;
/**
 * Derive project name from working directory path
 */
export declare function deriveProjectName(cwd: string): string;
/**
 * Load active agents state from file
 */
export declare function loadActiveAgents(): ActiveAgentsState;
/**
 * Save active agents state to file
 */
export declare function saveActiveAgents(state: ActiveAgentsState): void;
/**
 * Register a new active agent
 */
export declare function registerActiveAgent(entry: ActiveAgentEntry): void;
/**
 * Look up and remove an active agent entry
 */
export declare function popActiveAgent(agentId: string): ActiveAgentEntry | null;
/** Removes agent entries older than 24 hours. Returns count of removed entries. */
export declare function cleanupStaleAgents(): number;
/**
 * Parse a transcript file to extract useful information
 */
export declare function parseTranscript(transcriptPath: string): ParsedTranscript;
/**
 * Extract keywords from task description and transcript content
 */
export declare function extractKeywords(taskDescription?: string, transcriptContent?: string, agentType?: string): string[];
/**
 * Write a telemetry record to the monthly JSONL file
 */
export declare function writeTelemetryRecord(record: TelemetryRecord): void;
/**
 * Create a telemetry record from agent start entry and stop data
 */
export declare function createTelemetryRecord(startEntry: ActiveAgentEntry, parsedTranscript: ParsedTranscript, keywords: string[]): TelemetryRecord;
