// === Number Formatting ===

/**
 * Format a number with K/M/B suffixes.
 * Handles NaN, Infinity, and negative values.
 */
export function formatNumber(n: number): string {
  if (!isFinite(n) || isNaN(n)) return '0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${Math.round(abs)}`;
}

/**
 * Format bytes to human readable (B, KB, MB, GB).
 */
export function formatBytes(bytes: number): string {
  if (!isFinite(bytes) || isNaN(bytes) || bytes < 0) return '0 B';
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${Math.round(bytes)} B`;
}

/**
 * Format milliseconds to human readable duration.
 * e.g. 61500 -> "1m 1s", 3661000 -> "1h 1m"
 */
export function formatDuration(ms: number): string {
  if (!isFinite(ms) || isNaN(ms) || ms < 0) return '0ms';
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  const totalSeconds = Math.floor(ms / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/**
 * Format a ratio (0–1 range) as a percentage string.
 * e.g. 0.68 -> "68.0%"
 */
export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return '0.0%';
  return `${(ratio * 100).toFixed(1)}%`;
}

/**
 * Format a dollar amount.
 * e.g. 0.00153 -> "$0.0015", 1.5 -> "$1.50"
 */
export function formatDollars(amount: number): string {
  if (!isFinite(amount) || isNaN(amount)) return '$0.00';
  if (amount < 0) return `-$${Math.abs(amount).toFixed(4)}`;
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

// === Bar Chart ===

const FILL_CHAR = '\u2588'; // █
const EMPTY_CHAR = '\u2591'; // ░

/**
 * Generate a horizontal bar chart string.
 * e.g. formatBar(8, 12, 12) -> "████████░░░░"
 */
export function formatBar(value: number, max: number, width: number): string {
  if (!isFinite(value) || !isFinite(max) || isNaN(value) || isNaN(max) || width <= 0) {
    return EMPTY_CHAR.repeat(Math.max(0, width));
  }
  if (max <= 0) return EMPTY_CHAR.repeat(width);
  const ratio = Math.max(0, Math.min(1, value / max));
  const filled = Math.round(ratio * width);
  return FILL_CHAR.repeat(filled) + EMPTY_CHAR.repeat(width - filled);
}

// === Time Formatting ===

/**
 * Format a timestamp ISO string to HH:MM:SS.
 */
export function formatTime(iso: string): string {
  if (!iso) return '--:--:--';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '--:--:--';
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/**
 * Format uptime from milliseconds.
 * e.g. 3661000 -> "1h 1m 1s"
 */
export function formatUptime(ms: number): string {
  if (!isFinite(ms) || isNaN(ms) || ms < 0) return '0s';
  const totalSeconds = Math.floor(ms / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

// === String Utilities ===

/**
 * Truncate a string to max width with ellipsis.
 */
export function truncate(str: string, maxWidth: number): string {
  if (maxWidth <= 0) return '';
  if (str.length <= maxWidth) return str;
  if (maxWidth <= 3) return str.slice(0, maxWidth);
  return str.slice(0, maxWidth - 3) + '...';
}

/**
 * Pad a string to exact width (left or right aligned).
 */
export function pad(str: string, width: number, align: 'left' | 'right' = 'left'): string {
  if (width <= 0) return '';
  const s = str.length > width ? truncate(str, width) : str;
  const diff = width - s.length;
  if (diff <= 0) return s;
  if (align === 'right') return ' '.repeat(diff) + s;
  return s + ' '.repeat(diff);
}

// === ANSI Colors & Box Drawing ===

export const ansi = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgRed: '\x1b[41m',
  box: {
    topLeft: '\u250c',     // ┌
    topRight: '\u2510',    // ┐
    bottomLeft: '\u2514',  // └
    bottomRight: '\u2518', // ┘
    horizontal: '\u2500',  // ─
    vertical: '\u2502',    // │
    teeRight: '\u251c',    // ├
    teeLeft: '\u2524',     // ┤
  },
} as const;

// === Health Color ===

/**
 * Return ANSI color code for a health status.
 */
export function colorForHealth(status: 'healthy' | 'warning' | 'alert'): string {
  switch (status) {
    case 'healthy': return ansi.green;
    case 'warning': return ansi.yellow;
    case 'alert':   return ansi.red;
    default:        return ansi.reset;
  }
}

// === Delta Formatting ===

/**
 * Format a delta between current and baseline with arrow indicator.
 * e.g. "+16.5% ▲" or "-2.6% ▼" or "~0.1% ─"
 * Stable threshold: absolute percentage < 1%.
 */
export function formatDelta(current: number, baseline: number): string {
  if (!isFinite(current) || !isFinite(baseline) || isNaN(current) || isNaN(baseline)) {
    return '~0.0% ─';
  }
  if (baseline === 0 && current === 0) return '~0.0% ─';
  if (baseline === 0) return current > 0 ? '+\u221e% \u25b2' : '-\u221e% \u25bc';
  const pct = ((current - baseline) / Math.abs(baseline)) * 100;
  if (Math.abs(pct) < 1) {
    return `~${Math.abs(pct).toFixed(1)}% ─`;
  }
  if (pct > 0) {
    return `+${pct.toFixed(1)}% ▲`;
  }
  return `${pct.toFixed(1)}% ▼`;
}
