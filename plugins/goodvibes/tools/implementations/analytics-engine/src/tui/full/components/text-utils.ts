/**
 * Shared text utilities for TUI full-dashboard components.
 */

/**
 * Truncate or pad a string to exactly `width` characters.
 * If the string is longer than `width`, truncate and append an ellipsis.
 * If shorter, right-pad with spaces.
 */
export function fixedWidth(str: string, width: number): string {
  if (str.length > width) return str.slice(0, width - 1) + '\u2026';
  return str.padEnd(width);
}
