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
export * from './telemetry/index.js';
import type { ActiveAgentsState, ActiveAgentEntry, TelemetryRecord } from './telemetry/index.js';
/**
 * Ensure .goodvibes directories exist (backward compatible wrapper)
 */
export declare function ensureGoodVibesDirs(): Promise<void>;
/**
 * Load active agents state from file (backward compatible wrapper)
 */
export declare function loadActiveAgents(): Promise<ActiveAgentsState>;
/**
 * Save active agents state to file (backward compatible wrapper)
 */
export declare function saveActiveAgents(state: ActiveAgentsState): Promise<void>;
/**
 * Register a new active agent (backward compatible wrapper)
 */
export declare function registerActiveAgent(entry: ActiveAgentEntry): Promise<void>;
/**
 * Look up and remove an active agent entry (backward compatible wrapper)
 */
export declare function popActiveAgent(agentId: string): Promise<ActiveAgentEntry | null>;
/**
 * Removes agent entries older than 24 hours (backward compatible wrapper)
 */
export declare function cleanupStaleAgents(): Promise<number>;
/**
 * Write a telemetry record to the monthly JSONL file (backward compatible wrapper)
 */
export declare function writeTelemetryRecord(record: TelemetryRecord): Promise<void>;
