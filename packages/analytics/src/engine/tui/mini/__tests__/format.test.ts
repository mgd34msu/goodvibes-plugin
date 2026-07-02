import { describe, it, expect } from 'vitest';
import {
  formatNumber,
  formatBytes,
  formatDuration,
  formatPercent,
  formatDollars,
  formatBar,
  formatTime,
  formatUptime,
  truncate,
  pad,
  colorForHealth,
  formatDelta,
  formatUptimeProgressive,
  formatTokensSaved,
  ansi,
} from '../format.js';

// ── formatNumber ─────────────────────────────────────────────────────────────

describe('formatNumber', () => {
  it('returns "0" for NaN', () => {
    expect(formatNumber(NaN)).toBe('0');
  });

  it('returns "0" for Infinity', () => {
    expect(formatNumber(Infinity)).toBe('0');
  });

  it('returns "0" for -Infinity', () => {
    expect(formatNumber(-Infinity)).toBe('0');
  });

  it('formats zero as "0"', () => {
    expect(formatNumber(0)).toBe('0');
  });

  it('formats small positive integer', () => {
    expect(formatNumber(42)).toBe('42');
  });

  it('formats 999 as "999"', () => {
    expect(formatNumber(999)).toBe('999');
  });

  it('formats 1000 as "1.0k"', () => {
    expect(formatNumber(1_000)).toBe('1.0k');
  });

  it('formats 1500 as "1.5k"', () => {
    expect(formatNumber(1_500)).toBe('1.5k');
  });

  it('formats 1000000 as "1.0M"', () => {
    expect(formatNumber(1_000_000)).toBe('1.0M');
  });

  it('formats 2500000 as "2.5M"', () => {
    expect(formatNumber(2_500_000)).toBe('2.5M');
  });

  it('formats 1000000000 as "1.0B"', () => {
    expect(formatNumber(1_000_000_000)).toBe('1.0B');
  });

  it('formats 3000000000 as "3.0B"', () => {
    expect(formatNumber(3_000_000_000)).toBe('3.0B');
  });

  it('formats negative thousand as "-1.0k"', () => {
    expect(formatNumber(-1_000)).toBe('-1.0k');
  });

  it('formats negative million as "-2.5M"', () => {
    expect(formatNumber(-2_500_000)).toBe('-2.5M');
  });

  it('formats negative small number', () => {
    expect(formatNumber(-42)).toBe('-42');
  });
});

// ── formatBytes ──────────────────────────────────────────────────────────────

describe('formatBytes', () => {
  it('returns "0 B" for NaN', () => {
    expect(formatBytes(NaN)).toBe('0 B');
  });

  it('returns "0 B" for negative values', () => {
    expect(formatBytes(-1)).toBe('0 B');
  });

  it('formats zero as "0 B"', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats 512 as "512 B"', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('formats 1024 as "1.0 KB"', () => {
    expect(formatBytes(1_024)).toBe('1.0 KB');
  });

  it('formats 1048576 as "1.0 MB"', () => {
    expect(formatBytes(1_048_576)).toBe('1.0 MB');
  });

  it('formats 1073741824 as "1.0 GB"', () => {
    expect(formatBytes(1_073_741_824)).toBe('1.0 GB');
  });

  it('formats 128 MB correctly', () => {
    expect(formatBytes(128 * 1_048_576)).toBe('128.0 MB');
  });
});

// ── formatDuration ───────────────────────────────────────────────────────────

describe('formatDuration', () => {
  it('returns "0ms" for NaN', () => {
    expect(formatDuration(NaN)).toBe('0ms');
  });

  it('returns "0ms" for negative values', () => {
    expect(formatDuration(-100)).toBe('0ms');
  });

  it('formats 0 as "0ms"', () => {
    expect(formatDuration(0)).toBe('0ms');
  });

  it('formats 500ms as "500ms"', () => {
    expect(formatDuration(500)).toBe('500ms');
  });

  it('formats 999ms as "999ms"', () => {
    expect(formatDuration(999)).toBe('999ms');
  });

  it('formats 1000ms as "1s"', () => {
    expect(formatDuration(1_000)).toBe('1s');
  });

  it('formats 61500ms as "1m 1s"', () => {
    expect(formatDuration(61_500)).toBe('1m 1s');
  });

  it('formats 3661000ms as "1h 1m"', () => {
    expect(formatDuration(3_661_000)).toBe('1h 1m');
  });

  it('formats exactly 1 hour as "1h 0m"', () => {
    expect(formatDuration(3_600_000)).toBe('1h 0m');
  });
});

// ── formatPercent ─────────────────────────────────────────────────────────────

describe('formatPercent', () => {
  it('returns "0.0%" for NaN', () => {
    expect(formatPercent(NaN)).toBe('0.0%');
  });

  it('returns "0.0%" for Infinity', () => {
    expect(formatPercent(Infinity)).toBe('0.0%');
  });

  it('formats 0 as "0.0%"', () => {
    expect(formatPercent(0)).toBe('0.0%');
  });

  it('formats 0.5 as "50.0%"', () => {
    expect(formatPercent(0.5)).toBe('50.0%');
  });

  it('formats 1 as "100.0%"', () => {
    expect(formatPercent(1)).toBe('100.0%');
  });

  it('formats 0.68 as "68.0%"', () => {
    expect(formatPercent(0.68)).toBe('68.0%');
  });

  it('formats 0.333 as "33.3%"', () => {
    expect(formatPercent(0.333)).toBe('33.3%');
  });
});

// ── formatDollars ─────────────────────────────────────────────────────────────

describe('formatDollars', () => {
  it('returns "$0.00" for NaN', () => {
    expect(formatDollars(NaN)).toBe('$0.00');
  });

  it('returns "$0.00" for Infinity', () => {
    expect(formatDollars(Infinity)).toBe('$0.00');
  });

  it('formats 0 as "$0.0000"', () => {
    expect(formatDollars(0)).toBe('$0.0000');
  });

  it('formats 0.0525 as "$0.0525"', () => {
    expect(formatDollars(0.0525)).toBe('$0.0525');
  });

  it('formats 1.5 as "$1.50"', () => {
    expect(formatDollars(1.5)).toBe('$1.50');
  });

  it('formats negative amounts with minus prefix', () => {
    expect(formatDollars(-0.005)).toBe('-$0.0050');
  });

  it('formats 10.0 as "$10.00"', () => {
    expect(formatDollars(10.0)).toBe('$10.00');
  });
});

// ── formatBar ─────────────────────────────────────────────────────────────────

describe('formatBar', () => {
  it('returns empty bars for NaN value', () => {
    expect(formatBar(NaN, 10, 5)).toBe('\u2591\u2591\u2591\u2591\u2591');
  });

  it('returns empty bars for NaN max', () => {
    expect(formatBar(5, NaN, 5)).toBe('\u2591\u2591\u2591\u2591\u2591');
  });

  it('returns empty string for width 0', () => {
    expect(formatBar(5, 10, 0)).toBe('');
  });

  it('returns empty bars for max <= 0', () => {
    expect(formatBar(5, 0, 4)).toBe('\u2591\u2591\u2591\u2591');
  });

  it('returns full bars for value >= max', () => {
    expect(formatBar(10, 10, 4)).toBe('\u2588\u2588\u2588\u2588');
  });

  it('returns half-filled bar for value = max/2', () => {
    expect(formatBar(5, 10, 10)).toBe('\u2588\u2588\u2588\u2588\u2588\u2591\u2591\u2591\u2591\u2591');
  });

  it('returns empty bars for value 0', () => {
    expect(formatBar(0, 10, 4)).toBe('\u2591\u2591\u2591\u2591');
  });

  it('clamps value above max to full bar', () => {
    expect(formatBar(20, 10, 4)).toBe('\u2588\u2588\u2588\u2588');
  });

  it('clamps negative value to empty bar', () => {
    expect(formatBar(-5, 10, 4)).toBe('\u2591\u2591\u2591\u2591');
  });

  it('returns empty string for negative width', () => {
    expect(formatBar(5, 10, -1)).toBe('');
  });
});

// ── formatTime ───────────────────────────────────────────────────────────────

describe('formatTime', () => {
  it('returns "--:--:--" for empty string', () => {
    expect(formatTime('')).toBe('--:--:--');
  });

  it('returns "--:--:--" for invalid ISO string', () => {
    expect(formatTime('not-a-date')).toBe('--:--:--');
  });

  it('formats a valid ISO timestamp to HH:MM:SS pattern', () => {
    const result = formatTime('2026-02-20T10:00:00.000Z');
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});

// ── formatUptime ─────────────────────────────────────────────────────────────

describe('formatUptime', () => {
  it('returns "0s" for NaN', () => {
    expect(formatUptime(NaN)).toBe('0s');
  });

  it('returns "0s" for negative values', () => {
    expect(formatUptime(-1)).toBe('0s');
  });

  it('formats 0ms as "0s"', () => {
    expect(formatUptime(0)).toBe('0s');
  });

  it('formats 45000ms as "45s"', () => {
    expect(formatUptime(45_000)).toBe('45s');
  });

  it('formats 61000ms as "1m 1s"', () => {
    expect(formatUptime(61_000)).toBe('1m 1s');
  });

  it('formats 3661000ms as "1h 1m 1s"', () => {
    expect(formatUptime(3_661_000)).toBe('1h 1m 1s');
  });

  it('formats exactly 1 hour as "1h 0m 0s"', () => {
    expect(formatUptime(3_600_000)).toBe('1h 0m 0s');
  });
});

// ── truncate ──────────────────────────────────────────────────────────────────

describe('truncate', () => {
  it('returns empty string for maxWidth 0', () => {
    expect(truncate('hello', 0)).toBe('');
  });

  it('returns string as-is when within maxWidth', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('returns string as-is when exactly maxWidth', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('truncates with ellipsis when exceeding maxWidth', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
  });

  it('truncates to maxWidth chars when maxWidth <= 3', () => {
    expect(truncate('hello', 2)).toBe('he');
  });

  it('handles maxWidth of 3 by slicing first 3 chars', () => {
    expect(truncate('hello', 3)).toBe('hel');
  });

  it('handles empty string input', () => {
    expect(truncate('', 5)).toBe('');
  });
});

// ── pad ───────────────────────────────────────────────────────────────────────

describe('pad', () => {
  it('returns empty string for width 0', () => {
    expect(pad('hi', 0)).toBe('');
  });

  it('left-aligns by default', () => {
    expect(pad('hi', 5)).toBe('hi   ');
  });

  it('right-aligns when align is right', () => {
    expect(pad('hi', 5, 'right')).toBe('   hi');
  });

  it('truncates when string exceeds width', () => {
    expect(pad('hello world', 5)).toBe('he...');
  });

  it('returns string unchanged when exactly width', () => {
    expect(pad('hello', 5)).toBe('hello');
  });

  it('handles width 1', () => {
    expect(pad('hello', 1)).toBe('h');
  });

  it('handles negative width as empty string', () => {
    expect(pad('hello', -1)).toBe('');
  });
});

// ── colorForHealth ────────────────────────────────────────────────────────────

describe('colorForHealth', () => {
  it('returns green ANSI code for healthy', () => {
    expect(colorForHealth('healthy')).toBe(ansi.green);
  });

  it('returns yellow ANSI code for warning', () => {
    expect(colorForHealth('warning')).toBe(ansi.yellow);
  });

  it('returns red ANSI code for alert', () => {
    expect(colorForHealth('alert')).toBe(ansi.red);
  });
});

// ── formatDelta ───────────────────────────────────────────────────────────────

describe('formatDelta', () => {
  it('returns stable indicator for NaN current', () => {
    expect(formatDelta(NaN, 10)).toBe('~0.0% \u2500');
  });

  it('returns stable indicator for NaN baseline', () => {
    expect(formatDelta(10, NaN)).toBe('~0.0% \u2500');
  });

  it('returns stable indicator when both are 0', () => {
    expect(formatDelta(0, 0)).toBe('~0.0% \u2500');
  });

  it('returns positive infinity when baseline is 0 and current > 0', () => {
    expect(formatDelta(5, 0)).toBe('+\u221e% \u25b2');
  });

  it('returns negative infinity when baseline is 0 and current < 0', () => {
    expect(formatDelta(-5, 0)).toBe('-\u221e% \u25bc');
  });

  it('returns stable indicator for small change (< 1%)', () => {
    expect(formatDelta(100.5, 100)).toBe('~0.5% \u2500');
  });

  it('returns positive indicator for increase >= 1%', () => {
    expect(formatDelta(116.5, 100)).toBe('+16.5% \u25b2');
  });

  it('returns negative indicator for decrease >= 1%', () => {
    expect(formatDelta(97.4, 100)).toBe('-2.6% \u25bc');
  });
});

// ── formatUptimeProgressive ───────────────────────────────────────────────────

describe('formatUptimeProgressive', () => {
  it('returns "00h 00m 00s" for NaN', () => {
    expect(formatUptimeProgressive(NaN)).toBe('00h 00m 00s');
  });

  it('returns "00h 00m 00s" for negative values', () => {
    expect(formatUptimeProgressive(-1)).toBe('00h 00m 00s');
  });

  it('formats 0ms as "00h 00m 00s"', () => {
    expect(formatUptimeProgressive(0)).toBe('00h 00m 00s');
  });

  it('formats 45000ms (45s) as "00h 00m 45s"', () => {
    expect(formatUptimeProgressive(45_000)).toBe('00h 00m 45s');
  });

  it('formats 65000ms (1m5s) as "00h 01m 05s"', () => {
    expect(formatUptimeProgressive(65_000)).toBe('00h 01m 05s');
  });

  it('formats 3599000ms (59m59s) as "00h 59m 59s"', () => {
    expect(formatUptimeProgressive(3_599_000)).toBe('00h 59m 59s');
  });

  it('formats 86399000ms (23h59m59s) as "23h 59m 59s"', () => {
    expect(formatUptimeProgressive(86_399_000)).toBe('23h 59m 59s');
  });

  it('formats 1 day + 2h30m as "1d 02h 30m" (drops seconds)', () => {
    expect(formatUptimeProgressive(95_400_000)).toBe('1d 02h 30m');
  });

  it('formats 6 days + 23h59m59s as "6d 23h 59m"', () => {
    const ms = (6 * 86400 + 23 * 3600 + 59 * 60 + 59) * 1000;
    expect(formatUptimeProgressive(ms)).toBe('6d 23h 59m');
  });

  it('formats 9 days + 5h as "1w 2d 05h"', () => {
    const ms = (9 * 86400 + 5 * 3600) * 1000;
    expect(formatUptimeProgressive(ms)).toBe('1w 2d 05h');
  });

  it('formats 30 days as month-level output', () => {
    const result = formatUptimeProgressive(30 * 86400_000);
    expect(result).toMatch(/^\d+mo \d+w$/);
  });

  it('formats 365 days as year-level output', () => {
    const result = formatUptimeProgressive(365 * 86400_000);
    expect(result).toMatch(/^\d+yr \d+mo$/);
  });

  it('hours always show 2-digit leading zero when < 10', () => {
    const ms = (86400 + 5 * 3600) * 1000;
    expect(formatUptimeProgressive(ms)).toBe('1d 05h 00m');
  });

  it('minutes always show 2 digits', () => {
    const ms = (86400 + 5 * 60) * 1000;
    expect(formatUptimeProgressive(ms)).toBe('1d 00h 05m');
  });
});

// ── formatTokensSaved ─────────────────────────────────────────────────────────

describe('formatTokensSaved', () => {
  it('returns "0" for NaN', () => {
    expect(formatTokensSaved(NaN)).toBe('0');
  });

  it('returns "0" for negative values', () => {
    expect(formatTokensSaved(-1)).toBe('0');
  });

  it('returns "0" for Infinity', () => {
    expect(formatTokensSaved(Infinity)).toBe('0');
  });

  it('formats 0 as "0"', () => {
    expect(formatTokensSaved(0)).toBe('0');
  });

  it('formats 42 as "42"', () => {
    expect(formatTokensSaved(42)).toBe('42');
  });

  it('formats 999 as "999"', () => {
    expect(formatTokensSaved(999)).toBe('999');
  });

  it('formats 1000 as "1.0k"', () => {
    expect(formatTokensSaved(1_000)).toBe('1.0k');
  });

  it('formats 3000 as "3.0k"', () => {
    expect(formatTokensSaved(3_000)).toBe('3.0k');
  });

  it('formats 75000 as "75.0k"', () => {
    expect(formatTokensSaved(75_000)).toBe('75.0k');
  });

  it('formats 100000 as "100k" (no decimal)', () => {
    expect(formatTokensSaved(100_000)).toBe('100k');
  });

  it('formats 999999 as "999k"', () => {
    expect(formatTokensSaved(999_999)).toBe('999k');
  });

  it('formats 1000000 as "1.0M"', () => {
    expect(formatTokensSaved(1_000_000)).toBe('1.0M');
  });

  it('formats 100000000 as "100M" (no decimal)', () => {
    expect(formatTokensSaved(100_000_000)).toBe('100M');
  });

  it('formats 1000000000 as "1.0B"', () => {
    expect(formatTokensSaved(1_000_000_000)).toBe('1.0B');
  });
});
