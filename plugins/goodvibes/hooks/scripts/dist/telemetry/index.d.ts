/**
 * Telemetry Module
 *
 * Central export point for all telemetry functionality.
 * This is the canonical barrel file for the modular telemetry implementation.
 *
 * The core functions here take explicit path parameters for testability.
 * For backward compatibility wrappers that use PROJECT_ROOT, import from
 * '../telemetry.js' instead.
 */
export type { ActiveAgentEntry, ActiveAgentsState, GitInfo } from './agents.js';
export { STALE_AGENT_MAX_AGE_MS, getActiveAgentsFilePath, getGitInfo, deriveProjectName, loadActiveAgents, saveActiveAgents, registerActiveAgent, popActiveAgent, cleanupStaleAgents, } from './agents.js';
export type { ParsedTranscript } from './transcript.js';
export { MAX_OUTPUT_LENGTH, KEYWORD_CATEGORIES, parseTranscript, extractKeywords, } from './transcript.js';
export type { TelemetryRecord } from './records.js';
export { ensureGoodVibesDirs, writeTelemetryRecord, createTelemetryRecord, } from './records.js';
