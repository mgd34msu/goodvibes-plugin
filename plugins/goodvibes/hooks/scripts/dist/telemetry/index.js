/**
 * Telemetry module - aggregates all telemetry subsystems.
 *
 * This module provides backward compatibility with the old telemetry.ts API
 * while delegating to the new modular implementation.
 */
import * as path from 'path';
import { PROJECT_ROOT } from '../shared.js';
export { STALE_AGENT_MAX_AGE_MS, getGitInfo, deriveProjectName, loadActiveAgents, saveActiveAgents, registerActiveAgent, popActiveAgent, cleanupStaleAgents, } from './agents.js';
export { MAX_OUTPUT_LENGTH, KEYWORD_CATEGORIES, parseTranscript, extractKeywords, } from './transcript.js';
export { ensureGoodVibesDirs, writeTelemetryRecord, createTelemetryRecord, } from './records.js';
// ============================================================================
// Constants and Paths (for backward compatibility)
// ============================================================================
const GOODVIBES_DIR = path.join(PROJECT_ROOT, '.goodvibes');
const STATE_DIR = 'state';
const TELEMETRY_DIR = 'telemetry';
const ACTIVE_AGENTS_FILE = path.join(GOODVIBES_DIR, STATE_DIR, 'active-agents.json');
// ============================================================================
// Backward Compatibility Wrappers
// ============================================================================
import { loadActiveAgents as loadActiveAgentsCore, saveActiveAgents as saveActiveAgentsCore, registerActiveAgent as registerActiveAgentCore, popActiveAgent as popActiveAgentCore, cleanupStaleAgents as cleanupStaleAgentsCore, } from './agents.js';
import { ensureGoodVibesDirs as ensureGoodVibesDirsCore, writeTelemetryRecord as writeTelemetryRecordCore, } from './records.js';
/**
 * Ensure .goodvibes directories exist (backward compatible wrapper)
 */
export function ensureGoodVibesDirsCompat() {
    ensureGoodVibesDirsCore(GOODVIBES_DIR, STATE_DIR, TELEMETRY_DIR);
}
/**
 * Load active agents state from file (backward compatible wrapper)
 */
export function loadActiveAgentsCompat() {
    ensureGoodVibesDirsCompat();
    return loadActiveAgentsCore(ACTIVE_AGENTS_FILE);
}
/**
 * Save active agents state to file (backward compatible wrapper)
 */
export function saveActiveAgentsCompat(state) {
    saveActiveAgentsCore(ACTIVE_AGENTS_FILE, state);
}
/**
 * Register a new active agent (backward compatible wrapper)
 */
export function registerActiveAgentCompat(entry) {
    ensureGoodVibesDirsCompat();
    registerActiveAgentCore(ACTIVE_AGENTS_FILE, entry);
}
/**
 * Look up and remove an active agent entry (backward compatible wrapper)
 */
export function popActiveAgentCompat(agentId) {
    return popActiveAgentCore(ACTIVE_AGENTS_FILE, agentId);
}
/**
 * Removes agent entries older than 24 hours (backward compatible wrapper)
 */
export function cleanupStaleAgentsCompat() {
    return cleanupStaleAgentsCore(ACTIVE_AGENTS_FILE);
}
/**
 * Write a telemetry record to the monthly JSONL file (backward compatible wrapper)
 */
export function writeTelemetryRecordCompat(record) {
    ensureGoodVibesDirsCompat();
    const telemetryDirPath = path.join(GOODVIBES_DIR, TELEMETRY_DIR);
    writeTelemetryRecordCore(telemetryDirPath, record);
}
