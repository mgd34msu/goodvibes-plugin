/**
 * Analytics
 *
 * Session analytics types and persistence utilities.
 */

import * as fs from 'fs/promises';

import { CACHE_DIR, ANALYTICS_FILE } from './constants.js';
import { fileExists } from './file-utils.js';
import { debug } from './logging.js';

// =============================================================================
// Analytics Types
// =============================================================================

/** Represents a single tool usage event for analytics. */
export interface ToolUsage {
  tool: string;
  timestamp: string;
  duration_ms?: number;
  success: boolean;
  args?: Record<string, unknown>;
}

/** Represents a tool failure event for analytics. */
export interface ToolFailure {
  tool: string;
  error: string;
  timestamp: string;
}

/** Represents a subagent spawn event for analytics. */
export interface SubagentSpawn {
  type: string;
  task: string;
  started_at: string;
  completed_at?: string;
  success?: boolean;
}

/** Aggregated analytics for a session. */
export interface SessionAnalytics {
  session_id: string;
  started_at: string;
  ended_at?: string;
  tool_usage: ToolUsage[];
  tool_failures?: ToolFailure[];
  skills_recommended: string[];
  subagents_spawned?: SubagentSpawn[];
  validations_run: number;
  issues_found: number;
  detected_stack?: Record<string, unknown>;
}

// =============================================================================
// Cache and Analytics Management
// =============================================================================

/**
 * Ensures the cache directory exists for storing analytics and temporary data.
 *
 * Creates the .cache directory under PLUGIN_ROOT if it doesn't exist.
 * This directory is used for session analytics and other cached data.
 *
 * @example
 * await ensureCacheDir();
 * // Now safe to write to CACHE_DIR
 * await fs.writeFile(path.join(CACHE_DIR, 'data.json'), JSON.stringify(data));
 */
export async function ensureCacheDir(): Promise<void> {
  if (!(await fileExists(CACHE_DIR))) {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  }
}

/**
 * Loads the current session analytics from the cache file.
 *
 * Reads and parses the analytics.json file from the cache directory.
 * Returns null if the file doesn't exist or contains invalid JSON.
 *
 * @returns Promise resolving to the parsed SessionAnalytics object, or null if unavailable
 *
 * @example
 * const analytics = await loadAnalytics();
 * if (analytics) {
 *   debug(`Session: ${analytics.session_id}`);
 *   debug(`Tools used: ${analytics.tool_usage.length}`);
 * }
 */
export async function loadAnalytics(): Promise<SessionAnalytics | null> {
  await ensureCacheDir();
  if (await fileExists(ANALYTICS_FILE)) {
    try {
      const content = await fs.readFile(ANALYTICS_FILE, 'utf-8');
      const parsed: unknown = JSON.parse(content);
      if (typeof parsed === 'object' && parsed !== null && 'session_id' in parsed) {
        return parsed as SessionAnalytics;
      }
      return null;
    } catch (error: unknown) {
      debug('loadAnalytics failed', { error: String(error) });
      return null;
    }
  }
  return null;
}

/**
 * Saves session analytics to the cache file.
 *
 * Writes the analytics object to analytics.json in the cache directory.
 * Creates the cache directory if it doesn't exist.
 *
 * @param analytics - The SessionAnalytics object to persist
 * @returns Promise that resolves when the analytics are saved
 *
 * @example
 * const analytics: SessionAnalytics = {
 *   session_id: 'session_123',
 *   started_at: new Date().toISOString(),
 *   tool_usage: [],
 *   skills_recommended: [],
 *   validations_run: 0,
 *   issues_found: 0,
 * };
 * await saveAnalytics(analytics);
 */
export async function saveAnalytics(
  analytics: SessionAnalytics
): Promise<void> {
  await ensureCacheDir();
  await fs.writeFile(ANALYTICS_FILE, JSON.stringify(analytics, null, 2));
}

/**
 * Gets the current session ID or creates a new one.
 *
 * Attempts to load an existing session ID from analytics. If no session
 * exists, generates a new ID using the current timestamp.
 *
 * @returns Promise resolving to the session ID string (format: 'session_<timestamp>')
 *
 * @example
 * const sessionId = await getSessionId();
 * debug(sessionId); // 'session_1705234567890'
 */
export async function getSessionId(): Promise<string> {
  const analytics = await loadAnalytics();
  if (analytics?.session_id) {
    return analytics.session_id;
  }
  return `session_${Date.now()}`;
}

/**
 * Logs a tool usage event to the session analytics.
 *
 * Records information about a tool invocation including the tool name,
 * timestamp, duration, and success status. Creates a new analytics
 * session if one doesn't exist.
 *
 * @param usage - The ToolUsage object describing the tool invocation
 * @returns Promise that resolves when the usage is logged
 *
 * @example
 * await logToolUsage({
 *   tool: 'Bash',
 *   timestamp: new Date().toISOString(),
 *   duration_ms: 1500,
 *   success: true,
 *   args: { command: 'npm test' },
 * });
 */
export async function logToolUsage(usage: ToolUsage): Promise<void> {
  const existingAnalytics = await loadAnalytics();
  const analytics = existingAnalytics ?? {
    session_id: await getSessionId(),
    started_at: new Date().toISOString(),
    tool_usage: [],
    skills_recommended: [],
    validations_run: 0,
    issues_found: 0,
  };

  analytics.tool_usage.push(usage);
  await saveAnalytics(analytics);
}
