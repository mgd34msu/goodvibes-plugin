/**
 * Type definitions for telemetry data.
 */
/** Complete telemetry entry for a subagent completion event. */
export interface TelemetryEntry {
    event: 'subagent_complete';
    agent_id: string;
    agent_type: string;
    session_id: string;
    project: string;
    project_name: string;
    git_branch?: string;
    git_commit?: string;
    started_at: string;
    ended_at: string;
    duration_ms: number;
    status: 'completed' | 'failed';
    keywords: string[];
    files_modified: string[];
    tools_used: string[];
    summary: string;
}
/** Tracking data for an active agent session. */
export interface TelemetryTracking {
    agent_id: string;
    agent_type: string;
    session_id: string;
    project: string;
    project_name: string;
    git_branch?: string;
    git_commit?: string;
    started_at: string;
}
