/**
 * Type definitions for telemetry data.
 */

/**
 * Complete telemetry entry for a subagent completion event.
 * Captures all metadata about an agent's execution including duration, files modified, and tools used.
 */
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

/**
 * Tracking data for an active agent session.
 * Lighter weight version of TelemetryEntry used while an agent is still running.
 */
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
