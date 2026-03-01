/**
 * Time parsing utilities for the runtime domain.
 *
 * @module core/runtime/time-utils
 */

/**
 * Parses a time window string (e.g., "5m", "1h", "24h") into milliseconds.
 *
 * Supports units: `s` (seconds), `m` (minutes), `h` (hours), `d` (days).
 *
 * @param window - Time window string
 * @returns Duration in milliseconds, or null if the format is unrecognized
 *
 * @example
 * parseTimeWindow('5m') // 300000
 * parseTimeWindow('1h') // 3600000
 * parseTimeWindow('bad') // null
 */
export function parseTimeWindow(window: string): number | null {
  const match = window.match(/^(\d+)\s*(s|m|h|d)$/i);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  /* v8 ignore start */
  return value * (multipliers[unit] || 0);
  /* v8 ignore stop */
}
