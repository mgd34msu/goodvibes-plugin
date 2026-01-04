import type { TelemetryEntry, TelemetryTracking } from '../types/telemetry.js';
/** Persists agent tracking data to disk */
export declare function saveAgentTracking(cwd: string, tracking: TelemetryTracking): Promise<void>;
/** Retrieves tracking data for a specific agent */
export declare function getAgentTracking(cwd: string, agentId: string): Promise<TelemetryTracking | null>;
/** Removes tracking data for a specific agent */
export declare function removeAgentTracking(cwd: string, agentId: string): Promise<void>;
/** Appends a telemetry entry to the monthly log file */
export declare function writeTelemetryEntry(cwd: string, entry: TelemetryEntry): Promise<void>;
/** Builds a telemetry entry from tracking data and transcript */
export declare function buildTelemetryEntry(tracking: TelemetryTracking, transcriptPath: string, status: 'completed' | 'failed'): Promise<TelemetryEntry>;
