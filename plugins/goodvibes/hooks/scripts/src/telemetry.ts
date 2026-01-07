/**
 * Telemetry utilities for GoodVibes hooks
 *
 * This is a backward compatibility layer that re-exports from the modular
 * telemetry/ directory implementation and provides path-aware wrappers.
 *
 * Provides:
 * - Active agent state management for SubagentStart/Stop correlation
 * - Transcript parsing for tool usage and file modifications
 * - Keyword extraction for categorization
 * - JSONL telemetry record writing
 *
 * New code should import directly from './telemetry/index.js' for the
 * core functions that take explicit path parameters.
 */

import * as path from 'path';
import { PROJECT_ROOT } from './shared/constants.js';

// Re-export all types and core functions from the telemetry module
export * from './telemetry/index.js';

// Import core functions for the wrappers
import {
  loadActiveAgents as loadActiveAgentsCore,
  saveActiveAgents as saveActiveAgentsCore,
  registerActiveAgent as registerActiveAgentCore,
  popActiveAgent as popActiveAgentCore,
  cleanupStaleAgents as cleanupStaleAgentsCore,
  ensureGoodVibesDirs as ensureGoodVibesDirsCore,
  writeTelemetryRecord as writeTelemetryRecordCore,
} from './telemetry/index.js';
import type {
  ActiveAgentsState,
  ActiveAgentEntry,
  TelemetryRecord,
} from './telemetry/index.js';

// =============================================================================
// Constants and Paths
// =============================================================================

const GOODVIBES_DIR = path.join(PROJECT_ROOT, '.goodvibes');
const STATE_DIR = 'state';
const TELEMETRY_DIR = 'telemetry';
const ACTIVE_AGENTS_FILE = path.join(
  GOODVIBES_DIR,
  STATE_DIR,
  'active-agents.json'
);

// =============================================================================
// Backward Compatibility Wrappers
// These use PROJECT_ROOT to determine paths automatically.
// =============================================================================

/**
 * Ensure .goodvibes directories exist (backward compatible wrapper)
 */
export async function ensureGoodVibesDirs(): Promise<void> {
  await ensureGoodVibesDirsCore(GOODVIBES_DIR, STATE_DIR, TELEMETRY_DIR);
}

/**
 * Load active agents state from file (backward compatible wrapper)
 */
export async function loadActiveAgents(): Promise<ActiveAgentsState> {
  await ensureGoodVibesDirs();
  return loadActiveAgentsCore(ACTIVE_AGENTS_FILE);
}

/**
 * Save active agents state to file (backward compatible wrapper)
 */
export async function saveActiveAgents(
  state: ActiveAgentsState
): Promise<void> {
  await saveActiveAgentsCore(ACTIVE_AGENTS_FILE, state);
}

/**
 * Register a new active agent (backward compatible wrapper)
 */
export async function registerActiveAgent(
  entry: ActiveAgentEntry
): Promise<void> {
  await ensureGoodVibesDirs();
  await registerActiveAgentCore(ACTIVE_AGENTS_FILE, entry);
}

/**
 * Look up and remove an active agent entry (backward compatible wrapper)
 */
export async function popActiveAgent(
  agentId: string
): Promise<ActiveAgentEntry | null> {
  return popActiveAgentCore(ACTIVE_AGENTS_FILE, agentId);
}

/**
 * Removes agent entries older than 24 hours (backward compatible wrapper)
 */
export async function cleanupStaleAgents(): Promise<number> {
  return cleanupStaleAgentsCore(ACTIVE_AGENTS_FILE);
}

/**
 * Write a telemetry record to the monthly JSONL file (backward compatible wrapper)
 */
export async function writeTelemetryRecord(
  record: TelemetryRecord
): Promise<void> {
  await ensureGoodVibesDirs();
  const telemetryDirPath = path.join(GOODVIBES_DIR, TELEMETRY_DIR);
  await writeTelemetryRecordCore(telemetryDirPath, record);
}
