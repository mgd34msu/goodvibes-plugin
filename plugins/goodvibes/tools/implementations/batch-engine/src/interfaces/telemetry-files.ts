/**
 * Telemetry Files interfaces for Batch Engine
 * @see SPEC-v2 Section 9.2
 */

import type { SessionMetrics, Aggregations } from './telemetry.js';

// Re-export types from telemetry.ts for convenience
export type { SessionMetrics, Aggregations };

/**
 * Telemetry file paths structure:
 * .goodvibes/
 * └── telemetry/
 *     ├── current_session.json   # Current session metrics
 *     ├── history/
 *     │   ├── YYYY-MM-DD.json   # Daily aggregates
 *     │   └── ...
 *     └── aggregations.json      # Pre-computed aggregations
 */
export const TELEMETRY_PATHS = {
  TELEMETRY_DIR: '.goodvibes/telemetry',
  CURRENT_SESSION: '.goodvibes/telemetry/current_session.json',
  HISTORY_DIR: '.goodvibes/telemetry/history',
  AGGREGATIONS: '.goodvibes/telemetry/aggregations.json',
} as const;

export type TelemetryPath = typeof TELEMETRY_PATHS[keyof typeof TELEMETRY_PATHS];

/**
 * Get the path for a specific history date file
 * @param date - Date string in YYYY-MM-DD format
 * @returns Full path to the history file
 */
export function getHistoryPath(date: string): string {
  return `${TELEMETRY_PATHS.HISTORY_DIR}/${date}.json`;
}

/**
 * File manager for reading/writing telemetry files
 * @see SPEC-v2 Section 9.2
 */
export interface TelemetryFileManager {
  /**
   * Ensure the telemetry directory structure exists
   */
  ensureTelemetryDir(): Promise<void>;

  /**
   * Read the current session metrics
   * @returns Current session metrics or null if file doesn't exist
   */
  readCurrentSession(): Promise<SessionMetrics | null>;

  /**
   * Write current session metrics
   * @param metrics - The session metrics to write
   */
  writeCurrentSession(metrics: SessionMetrics): Promise<void>;

  /**
   * Read history aggregations for a specific date
   * @param date - Date string in YYYY-MM-DD format
   * @returns Aggregations for that date or null if file doesn't exist
   */
  readHistory(date: string): Promise<Aggregations | null>;

  /**
   * Write history aggregations for a specific date
   * @param date - Date string in YYYY-MM-DD format
   * @param aggregations - The aggregations to write
   */
  writeHistory(date: string, aggregations: Aggregations): Promise<void>;

  /**
   * List all available history dates
   * @returns Array of date strings in YYYY-MM-DD format
   */
  listHistoryDates(): Promise<string[]>;

  /**
   * Read pre-computed aggregations
   * @returns Aggregations or null if file doesn't exist
   */
  readAggregations(): Promise<Aggregations | null>;

  /**
   * Write pre-computed aggregations
   * @param aggregations - The aggregations to write
   */
  writeAggregations(aggregations: Aggregations): Promise<void>;
}

/**
 * Empty session metrics for initialization
 * @see SPEC-v2 Section 9.1
 */
export const EMPTY_SESSION_METRICS: SessionMetrics = {
  id: '',
  started_at: new Date().toISOString(),
  mode: 'interactive',
  total_batches: 0,
  total_operations: 0,
  total_agents: 0,
  total_tokens: 0,
  total_duration_ms: 0,
  operations_by_type: {},
  tokens_by_type: {},
  batch_success_rate: 0,
  operation_success_rate: 0,
  agent_success_rate: 0,
  rollbacks_triggered: 0,
  fix_loops_run: 0,
  retries_total: 0,
};

/**
 * Empty aggregations for initialization
 * @see SPEC-v2 Section 9.1
 */
export const EMPTY_AGGREGATIONS: Aggregations = {
  hourly: [],
  daily: [],
  by_operation_type: {},
  by_agent_type: {},
  trends: {
    token_trend: { direction: 'stable', change_percent: 0, period: '7d' },
    success_trend: { direction: 'stable', change_percent: 0, period: '7d' },
    duration_trend: { direction: 'stable', change_percent: 0, period: '7d' },
  },
};

/**
 * Telemetry file type mapping
 */
export const TELEMETRY_FILE_TYPES = {
  [TELEMETRY_PATHS.CURRENT_SESSION]: 'current_session',
  [TELEMETRY_PATHS.AGGREGATIONS]: 'aggregations',
} as const;

export type TelemetryFileType = typeof TELEMETRY_FILE_TYPES[keyof typeof TELEMETRY_FILE_TYPES];

/**
 * Validate a date string is in YYYY-MM-DD format
 * @param date - Date string to validate
 * @returns True if valid YYYY-MM-DD format
 */
export function isValidHistoryDate(date: string): boolean {
  const pattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!pattern.test(date)) {
    return false;
  }
  const parsed = new Date(date);
  return !isNaN(parsed.getTime());
}

/**
 * Get today's date in YYYY-MM-DD format
 * @returns Today's date string
 */
export function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0] ?? new Date().toISOString().slice(0, 10);
}
