/**
 * Date formatting utilities for the demo CLI.
 */

/**
 * Format a date as an ISO 8601 string.
 * @param date - The date to format
 * @returns ISO 8601 formatted string
 */
export function toISO(date: Date): string {
  return date.toISOString();
}

/**
 * Format a date as a Unix timestamp (seconds since epoch).
 */
export function toUnix(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

/**
 * Format a date in a human-readable format.
 * Example: "Monday, March 3, 2026 at 12:34:56 PM UTC"
 */
export function toHumanReadable(date: Date): string {
  return date.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}

/**
 * Format a date in locale-specific short format.
 * Example: "3/3/2026, 12:34:56 PM"
 */
export function toLocale(date: Date, locale?: string): string {
  return date.toLocaleString(locale ?? 'en-US');
}

/**
 * Format a duration in milliseconds to a human-readable string.
 * Example: "2h 15m 30s"
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / 60000) % 60;
  const hours = Math.floor(ms / 3600000);

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

  return parts.join(' ');
}
