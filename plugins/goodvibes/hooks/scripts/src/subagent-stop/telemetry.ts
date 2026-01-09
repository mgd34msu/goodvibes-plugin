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

import {
  ensureGoodVibesDir,
  parseTranscript,
  extractKeywords,
  fileExists,
} from '../shared/index.js';
import { debug } from '../shared/logging.js';

import type { TelemetryEntry, TelemetryTracking } from '../types/telemetry.js';

/**
 * Type guard to check if a value is a valid trackings record.
 *
 * @param value - The value to validate
 * @returns True if value is a Record<string, TelemetryTracking>
 */
function isTrackingsRecord(
  value: unknown
): value is Record<string, TelemetryTracking> {
  return typeof value === 'object' && value !== null;
}

/** Relative path to the agent tracking file within .goodvibes */
const TRACKING_FILE = 'state/agent-tracking.json';

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
export async function saveAgentTracking(
  cwd: string,
  tracking: TelemetryTracking
): Promise<void> {
  await ensureGoodVibesDir(cwd);
  const trackingPath = path.join(cwd, '.goodvibes', TRACKING_FILE);

  let trackings: Record<string, TelemetryTracking> = {};
  if (await fileExists(trackingPath)) {
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(trackingPath, 'utf-8'));
      if (isTrackingsRecord(parsed)) {
        trackings = parsed;
      }
    } catch (error: unknown) {
      debug('telemetry operation failed', { error: String(error) });
    }
  }

  trackings[tracking.agent_id] = tracking;
  await fs.writeFile(trackingPath, JSON.stringify(trackings, null, 2));
}

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
export async function getAgentTracking(
  cwd: string,
  agentId: string
): Promise<TelemetryTracking | null> {
  const trackingPath = path.join(cwd, '.goodvibes', TRACKING_FILE);

  if (!(await fileExists(trackingPath))) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(await fs.readFile(trackingPath, 'utf-8'));
    if (isTrackingsRecord(parsed)) {
      return parsed[agentId] ?? null;
    }
    return null;
  } catch (error: unknown) {
    debug('getAgentTracking failed', { error: String(error) });
    return null;
  }
}

/**
 * Removes tracking data for a specific agent.
 * Called after agent completion to clean up tracking state.
 *
 * @param cwd - The current working directory (project root)
 * @param agentId - The unique identifier of the agent to remove
 * @returns Promise that resolves when tracking is removed
 */
export async function removeAgentTracking(
  cwd: string,
  agentId: string
): Promise<void> {
  const trackingPath = path.join(cwd, '.goodvibes', TRACKING_FILE);

  if (!(await fileExists(trackingPath))) {
    return;
  }

  try {
    const parsed: unknown = JSON.parse(await fs.readFile(trackingPath, 'utf-8'));
    if (isTrackingsRecord(parsed)) {
      delete parsed[agentId];
      await fs.writeFile(trackingPath, JSON.stringify(parsed, null, 2));
    }
  } catch (error: unknown) {
    debug('telemetry operation failed', { error: String(error) });
  }
}

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
export async function writeTelemetryEntry(
  cwd: string,
  entry: TelemetryEntry
): Promise<void> {
  await ensureGoodVibesDir(cwd);

  const now = new Date();
  const fileName = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.jsonl`;
  const telemetryPath = path.join(cwd, '.goodvibes', 'telemetry', fileName);

  await fs.appendFile(telemetryPath, JSON.stringify(entry) + '\n');
}

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
export async function buildTelemetryEntry(
  tracking: TelemetryTracking,
  transcriptPath: string,
  status: 'completed' | 'failed'
): Promise<TelemetryEntry> {
  const transcriptData = await parseTranscript(transcriptPath);
  const allText =
    transcriptData.summary + ' ' + transcriptData.filesModified.join(' ');
  const keywords = extractKeywords(allText);

  // Add agent type as keyword
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string should fall back to full agent_type
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
