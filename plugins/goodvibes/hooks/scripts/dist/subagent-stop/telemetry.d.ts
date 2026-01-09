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
import type { TelemetryEntry, TelemetryTracking } from '../types/telemetry.js';
/**
 * Persists agent tracking data to disk.
 * Stores tracking entry keyed by agent_id for later retrieval.
 *
 * @param cwd - The current working directory (project root)
 * @param tracking - The telemetry tracking data to save
 * @returns Promise that resolves when data is saved
 *
 * @example
 * await saveAgentTracking(cwd, {
 *   agent_id: 'agent-123',
 *   agent_type: 'backend-engineer',
 *   // ...other fields
 * });
 */
export declare function saveAgentTracking(cwd: string, tracking: TelemetryTracking): Promise<void>;
/**
 * Retrieves tracking data for a specific agent.
 *
 * @param cwd - The current working directory (project root)
 * @param agentId - The unique identifier of the agent
 * @returns Promise resolving to tracking data, or null if not found
 *
 * @example
 * const tracking = await getAgentTracking(cwd, 'agent-123');
 * if (tracking) {
 *   console.log(`Agent ${tracking.agent_type} started at ${tracking.started_at}`);
 * }
 */
export declare function getAgentTracking(cwd: string, agentId: string): Promise<TelemetryTracking | null>;
/**
 * Removes tracking data for a specific agent.
 * Called after agent completion to clean up tracking state.
 *
 * @param cwd - The current working directory (project root)
 * @param agentId - The unique identifier of the agent to remove
 * @returns Promise that resolves when tracking is removed
 */
export declare function removeAgentTracking(cwd: string, agentId: string): Promise<void>;
/**
 * Appends a telemetry entry to the monthly log file.
 * Creates JSONL files organized by year-month (e.g., 2024-01.jsonl).
 *
 * @param cwd - The current working directory (project root)
 * @param entry - The telemetry entry to write
 * @returns Promise that resolves when entry is written
 *
 * @example
 * await writeTelemetryEntry(cwd, {
 *   event: 'subagent_complete',
 *   agent_id: 'agent-123',
 *   // ...other fields
 * });
 */
export declare function writeTelemetryEntry(cwd: string, entry: TelemetryEntry): Promise<void>;
/**
 * Builds a telemetry entry from tracking data and transcript.
 * Parses the transcript to extract files modified, tools used, and keywords.
 *
 * @param tracking - The telemetry tracking data from agent start
 * @param transcriptPath - Path to the agent's transcript file
 * @param status - Final status of the agent ('completed' or 'failed')
 * @returns Promise resolving to complete TelemetryEntry
 *
 * @example
 * const entry = await buildTelemetryEntry(tracking, '/path/to/transcript.jsonl', 'completed');
 * await writeTelemetryEntry(cwd, entry);
 */
export declare function buildTelemetryEntry(tracking: TelemetryTracking, transcriptPath: string, status: 'completed' | 'failed'): Promise<TelemetryEntry>;
