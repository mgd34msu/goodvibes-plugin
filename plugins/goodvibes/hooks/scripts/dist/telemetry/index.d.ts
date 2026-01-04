/**
 * Telemetry module - aggregates all telemetry subsystems.
 *
 * This module provides backward compatibility with the old telemetry.ts API
 * while delegating to the new modular implementation.
 */
export type { ActiveAgentEntry, ActiveAgentsState, GitInfo } from './agents.js';
export { STALE_AGENT_MAX_AGE_MS, getGitInfo, deriveProjectName, loadActiveAgents, saveActiveAgents, registerActiveAgent, popActiveAgent, cleanupStaleAgents, } from './agents.js';
export type { ParsedTranscript } from './transcript.js';
export { MAX_OUTPUT_LENGTH, KEYWORD_CATEGORIES, parseTranscript, extractKeywords, } from './transcript.js';
export type { TelemetryRecord } from './records.js';
export { ensureGoodVibesDirs, writeTelemetryRecord, createTelemetryRecord, } from './records.js';
/**
 * Ensure .goodvibes directories exist (backward compatible wrapper)
 */
export declare function ensureGoodVibesDirsCompat(): void;
/**
 * Load active agents state from file (backward compatible wrapper)
 */
export declare function loadActiveAgentsCompat(): import("./agents.js").ActiveAgentsState;
/**
 * Save active agents state to file (backward compatible wrapper)
 */
export declare function saveActiveAgentsCompat(state: import('./agents.js').ActiveAgentsState): void;
/**
 * Register a new active agent (backward compatible wrapper)
 */
export declare function registerActiveAgentCompat(entry: import('./agents.js').ActiveAgentEntry): void;
/**
 * Look up and remove an active agent entry (backward compatible wrapper)
 */
export declare function popActiveAgentCompat(agentId: string): import("./agents.js").ActiveAgentEntry | null;
/**
 * Removes agent entries older than 24 hours (backward compatible wrapper)
 */
export declare function cleanupStaleAgentsCompat(): number;
/**
 * Write a telemetry record to the monthly JSONL file (backward compatible wrapper)
 */
export declare function writeTelemetryRecordCompat(record: import('./records.js').TelemetryRecord): void;
