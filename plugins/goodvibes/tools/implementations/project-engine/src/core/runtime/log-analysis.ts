/**
 * Log analysis utilities for the runtime domain.
 *
 * Provides functions to group, deduplicate, and analyze log entries
 * for patterns, anomalies, and rate statistics.
 *
 * @module core/runtime/log-analysis
 */

import type { ParsedLogEntry } from './log-parser.js';
import { normalizeMessage } from './log-parser.js';
import type { LogAnalyzerArgs } from './types.js';

/** A grouped/deduplicated error or warning message */
export interface GroupedMessage {
  message: string;
  count: number;
  first_seen: string;
  last_seen: string;
  sample_stack?: string;
}

/** A detected anomaly in the log stream */
export interface Anomaly {
  type: 'spike' | 'gap' | 'new_error' | 'rate_change';
  description: string;
  timestamp?: string;
  severity: 'high' | 'medium' | 'low';
}

/** Rate analysis result */
export interface RateAnalysis {
  entries_per_minute: number;
  errors_per_minute: number;
  peak_period: string;
}

/**
 * Groups log entries by normalized message content, deduplicating repeated
 * errors or warnings and tracking occurrence counts and timestamps.
 *
 * @param entries - Array of parsed log entries to group
 * @returns Sorted array of grouped messages (highest count first)
 */
export function groupMessages(entries: ParsedLogEntry[]): GroupedMessage[] {
  const groups = new Map<string, GroupedMessage & { entries: ParsedLogEntry[] }>();

  for (const entry of entries) {
    const key = normalizeMessage(entry.message);
    const existing = groups.get(key);

    if (existing) {
      existing.count++;
      /* v8 ignore start */
      if (entry.timestamp) {
        const ts = entry.timestamp.toISOString();
        if (ts > existing.last_seen) existing.last_seen = ts;
      }
      /* v8 ignore stop */
      existing.entries.push(entry);
    } else {
      const firstSeen = entry.timestamp?.toISOString() || 'unknown';
      groups.set(key, {
        message: entry.message,
        count: 1,
        first_seen: firstSeen,
        last_seen: firstSeen,
        entries: [entry],
      });
    }
  }

  // Look for stack traces in grouped entries
  for (const group of groups.values()) {
    for (const entry of group.entries) {
      if (
        entry.raw.includes('    at ') ||
        entry.raw.includes('\tat ') ||
        entry.metadata?.stack
      ) {
        group.sample_stack =
          typeof entry.metadata?.stack === 'string'
            ? entry.metadata.stack
            : entry.raw;
        break;
      }
    }
  }

  return [...groups.values()]
    .map(({ entries: _entries, ...rest }) => rest)
    .sort((a, b) => b.count - a.count);
}

/* v8 ignore start */
/**
 * Detects anomalies in log entries such as gaps, error spikes,
 * new error types, and rate changes.
 *
 * Requires at least 10 entries with timestamps for meaningful analysis.
 *
 * @param entries - Array of parsed log entries
 * @returns Array of detected anomalies, sorted by severity
 */
/* v8 ignore stop */
export function detectAnomalies(entries: ParsedLogEntry[]): Anomaly[] {
  const anomalies: Anomaly[] = [];
  if (entries.length < 10) return anomalies;

  // Get entries with timestamps
  const timedEntries = entries.filter((e) => e.timestamp);
  if (timedEntries.length < 10) return anomalies;

  // Sort by timestamp
  timedEntries.sort(
    /* v8 ignore next */
    (a, b) => (a.timestamp?.getTime() || 0) - (b.timestamp?.getTime() || 0)
  );

  // Calculate intervals between entries
  const intervals: number[] = [];
  for (let i = 1; i < timedEntries.length; i++) {
    const prev = timedEntries[i - 1].timestamp!.getTime();
    const curr = timedEntries[i].timestamp!.getTime();
    intervals.push(curr - prev);
  }

  // Detect gaps (intervals > 5x average)
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  for (let i = 0; i < intervals.length; i++) {
    if (intervals[i] > avgInterval * 5 && intervals[i] > 60000) {
      // > 1 minute gap
      anomalies.push({
        type: 'gap',
        description: `No logs for ${Math.round(intervals[i] / 1000)}s between entries`,
        timestamp: timedEntries[i + 1].timestamp?.toISOString(),
        severity: intervals[i] > 300000 ? 'high' : 'medium', // > 5 min = high
      });
    }
  }

  // Detect error spikes
  const errorEntries = entries.filter((e) => e.level === 'error');
  // Pre-built index map for O(1) lookups instead of O(n) indexOf
  const entryIndexMap = new Map(entries.map((e, i) => [e, i]));
  if (errorEntries.length > 5) {
    // Split into first half and second half using pre-built index map
    const midpoint = Math.floor(entries.length / 2);
    const firstHalfErrors = errorEntries.filter(
      (e) => (entryIndexMap.get(e) ?? 0) < midpoint
    ).length;
    const secondHalfErrors = errorEntries.filter(
      (e) => (entryIndexMap.get(e) ?? 0) >= midpoint
    ).length;

    if (secondHalfErrors > firstHalfErrors * 3 && secondHalfErrors > 10) {
      anomalies.push({
        type: 'spike',
        description: `Error rate increased ${Math.round(secondHalfErrors / Math.max(firstHalfErrors, 1))}x in recent entries`,
        severity: secondHalfErrors > firstHalfErrors * 10 ? 'high' : 'medium',
      });
    }
  }

  // Detect new errors (errors that appear only in second half)
  const halfLength = entries.length / 2;
  const firstHalfErrorMessages = new Set(
    errorEntries
      .filter((e) => (entryIndexMap.get(e) ?? 0) < halfLength)
      .map((e) => normalizeMessage(e.message))
  );

  const newErrors = errorEntries
    .filter((e) => (entryIndexMap.get(e) ?? 0) >= halfLength)
    .filter((e) => !firstHalfErrorMessages.has(normalizeMessage(e.message)));

  if (newErrors.length > 0) {
    const uniqueNew = [...new Set(newErrors.map((e) => normalizeMessage(e.message)))];
    if (uniqueNew.length <= 3) {
      for (const msg of uniqueNew) {
        anomalies.push({
          type: 'new_error',
          description: `New error type appeared: ${msg.slice(0, 100)}`,
          timestamp: newErrors[0].timestamp?.toISOString(),
          severity: 'high',
        });
      }
    } else {
      anomalies.push({
        type: 'new_error',
        description: `${uniqueNew.length} new error types appeared recently`,
        severity: 'high',
      });
    }
  }

  // Detect rate changes
  if (timedEntries.length >= 20) {
    const firstQuarter = timedEntries.slice(
      0,
      Math.floor(timedEntries.length / 4)
    );
    const lastQuarter = timedEntries.slice(
      Math.floor((timedEntries.length * 3) / 4)
    );

    /* v8 ignore start */
    if (firstQuarter.length > 2 && lastQuarter.length > 2) {
    /* v8 ignore stop */
      const firstDuration =
        (firstQuarter[firstQuarter.length - 1].timestamp!.getTime() -
          firstQuarter[0].timestamp!.getTime()) /
        60000;
      const lastDuration =
        (lastQuarter[lastQuarter.length - 1].timestamp!.getTime() -
          lastQuarter[0].timestamp!.getTime()) /
        60000;

      if (firstDuration > 0 && lastDuration > 0) {
        const firstRate = firstQuarter.length / firstDuration;
        const lastRate = lastQuarter.length / lastDuration;

        if (lastRate > firstRate * 3) {
          anomalies.push({
            type: 'rate_change',
            description: `Log rate increased ${Math.round(lastRate / firstRate)}x (${Math.round(firstRate)}/min -> ${Math.round(lastRate)}/min)`,
            severity: lastRate > firstRate * 10 ? 'high' : 'medium',
          });
        } else if (lastRate < firstRate / 3) {
          anomalies.push({
            type: 'rate_change',
            description: `Log rate decreased ${Math.round(firstRate / lastRate)}x (${Math.round(firstRate)}/min -> ${Math.round(lastRate)}/min)`,
            severity: 'low',
          });
        }
      }
    }
  }

  return anomalies;
}

/**
 * Calculates log rate statistics for entries that have timestamps.
 *
 * Computes entries-per-minute, errors-per-minute, and identifies
 * the peak 1-minute window.
 *
 * @param entries - Array of parsed log entries
 * @returns Rate analysis result, or undefined if insufficient timed data
 */
export function calculateRateAnalysis(
  entries: ParsedLogEntry[]
): RateAnalysis | undefined {
  const timedEntries = entries.filter((e) => e.timestamp);
  if (timedEntries.length < 2) return undefined;

  // timedEntries are pre-filtered to have timestamps — no || 0 fallback needed
  timedEntries.sort((a, b) => a.timestamp!.getTime() - b.timestamp!.getTime());

  const start = timedEntries[0].timestamp!.getTime();
  const end = timedEntries[timedEntries.length - 1].timestamp!.getTime();
  const durationMinutes = (end - start) / 60000;

  if (durationMinutes < 1) return undefined;

  const errorEntries = entries.filter((e) => e.level === 'error');

  // Find peak period (1-minute windows)
  const windows = new Map<number, number>();
  for (const entry of timedEntries) {
    const minute = Math.floor(entry.timestamp!.getTime() / 60000);
    windows.set(minute, (windows.get(minute) || 0) + 1);
  }

  let peakMinute = 0;
  let peakCount = 0;
  for (const [minute, count] of windows) {
    if (count > peakCount) {
      peakMinute = minute;
      peakCount = count;
    }
  }

  return {
    entries_per_minute: Math.round((entries.length / durationMinutes) * 100) / 100,
    errors_per_minute:
      Math.round((errorEntries.length / durationMinutes) * 100) / 100,
    peak_period: new Date(peakMinute * 60000).toISOString(),
  };
}

/**
 * Matches custom user-defined patterns against log entries.
 *
 * Counts the number of entries matching each pattern and optionally
 * assigns a level to entries that did not already have one.
 *
 * @param entries - Array of parsed log entries to search
 * @param patterns - Custom pattern definitions from LogAnalyzerArgs
 * @returns Record mapping pattern name to match count
 */
export function matchPatterns(
  entries: ParsedLogEntry[],
  patterns: LogAnalyzerArgs['patterns']
): Record<string, number> {
  if (!patterns || patterns.length === 0) return {};

  const results: Record<string, number> = {};

  for (const patternDef of patterns) {
    results[patternDef.name] = 0;
    // Skip empty patterns — new RegExp('') matches every line
    if (!patternDef.pattern || patternDef.pattern.trim() === '') continue;
    try {
      const regex = new RegExp(patternDef.pattern, 'i');
      for (const entry of entries) {
        if (regex.test(entry.raw)) {
          results[patternDef.name]++;
        }
      }
    } catch {
      // Invalid regex, skip
    }
  }

  return results;
}
