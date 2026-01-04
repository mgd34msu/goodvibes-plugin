/**
 * Telemetry utilities for GoodVibes hooks
 *
 * This is a thin compatibility layer that re-exports from the modular
 * telemetry/ directory implementation.
 *
 * Provides:
 * - Active agent state management for SubagentStart/Stop correlation
 * - Transcript parsing for tool usage and file modifications
 * - Keyword extraction for categorization
 * - JSONL telemetry record writing
 */
// Re-export everything from the telemetry module
export * from './telemetry/index.js';
// For backward compatibility, also export the "Compat" versions as the original names
export { ensureGoodVibesDirsCompat as ensureGoodVibesDirs, loadActiveAgentsCompat as loadActiveAgents, saveActiveAgentsCompat as saveActiveAgents, registerActiveAgentCompat as registerActiveAgent, popActiveAgentCompat as popActiveAgent, cleanupStaleAgentsCompat as cleanupStaleAgents, writeTelemetryRecordCompat as writeTelemetryRecord, } from './telemetry/index.js';
