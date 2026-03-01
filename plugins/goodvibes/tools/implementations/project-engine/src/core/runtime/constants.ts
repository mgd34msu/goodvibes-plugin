/**
 * Shared constants for the runtime domain.
 *
 * @module core/runtime/constants
 */

/**
 * Regular expressions for detecting timestamps in log lines.
 *
 * Ordered from most specific to least, covering ISO 8601, common formats,
 * bracketed timestamps, and Unix timestamps (ms and s).
 */
export const TIMESTAMP_PATTERNS: RegExp[] = [
  // ISO 8601: 2024-01-15T10:30:45.123Z
  /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)/,
  // Common format: 2024-01-15 10:30:45
  /(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/,
  // Bracketed: [2024-01-15 10:30:45]
  /\[(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?)\]/,
  // Unix timestamp (milliseconds)
  /\b(1[6-9]\d{11})\b/,
  // Unix timestamp (seconds)
  /\b(1[6-9]\d{8})\b/,
];
