/**
 * Log Analyzer Handler
 *
 * Analyzes log files or process output for patterns and anomalies:
 * - Parses structured (JSON) and unstructured (text) logs
 * - Groups and deduplicates errors/warnings
 * - Detects anomalies (spikes, gaps, rate changes, new errors)
 * - Calculates log rate statistics
 * - Supports time window filtering
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

import { success, error } from '../../utils.js';
import { PROJECT_ROOT } from '../../config.js';

/**
 * Arguments for the log_analyzer tool
 */
export interface LogAnalyzerArgs {
  /** Source type: file or command */
  source: 'file' | 'command';
  /** Log file path (required when source is "file") */
  path?: string;
  /** Command to run and capture output (required when source is "command") */
  command?: string;
  /** Duration in seconds for command source (default: 10) */
  duration_seconds?: number;
  /** Number of lines to read from file source (default: 1000) */
  tail_lines?: number;
  /** Expect JSON logs (default: auto-detect) */
  structured?: boolean;
  /** Custom patterns to detect */
  patterns?: Array<{
    name: string;
    regex: string;
    level: 'debug' | 'info' | 'warn' | 'error';
  }>;
  /** Time window filter (e.g., "5m", "1h", "24h") */
  time_window?: string;
  /** Working directory */
  cwd?: string;
}

/**
 * Parsed log entry
 */
interface ParsedLogEntry {
  raw: string;
  timestamp?: Date;
  level?: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  metadata?: Record<string, unknown>;
  lineNumber: number;
}

/**
 * Grouped error/warning
 */
interface GroupedMessage {
  message: string;
  count: number;
  first_seen: string;
  last_seen: string;
  sample_stack?: string;
}

/**
 * Detected anomaly
 */
interface Anomaly {
  type: 'spike' | 'gap' | 'new_error' | 'rate_change';
  description: string;
  timestamp?: string;
  severity: 'high' | 'medium' | 'low';
}

/**
 * Rate analysis result
 */
interface RateAnalysis {
  entries_per_minute: number;
  errors_per_minute: number;
  peak_period: string;
}

/**
 * Result of log analysis
 */
export interface LogAnalyzerResult {
  entries_analyzed: number;
  time_range: {
    start: string | null;
    end: string | null;
    duration_ms: number | null;
  };
  format_detected: 'json' | 'text' | 'mixed';
  levels: {
    debug: number;
    info: number;
    warn: number;
    error: number;
    unknown: number;
  };
  errors: GroupedMessage[];
  warnings: GroupedMessage[];
  patterns_matched: Record<string, number>;
  anomalies: Anomaly[];
  rate_analysis?: RateAnalysis;
  source_info: {
    type: 'file' | 'command';
    path_or_command: string;
    lines_read: number;
  };
}

/**
 * Parse time window string to milliseconds
 */
function parseTimeWindow(window: string): number | null {
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

  return value * (multipliers[unit] || 0);
}

/**
 * Detect log level from string
 */
function detectLevel(
  levelStr?: string
): 'debug' | 'info' | 'warn' | 'error' | undefined {
  if (!levelStr) return undefined;
  const lower = levelStr.toLowerCase();

  if (lower.includes('debug') || lower.includes('trace') || lower === 'verbose')
    return 'debug';
  if (lower.includes('info') || lower === 'log') return 'info';
  if (lower.includes('warn') || lower === 'warning') return 'warn';
  if (
    lower.includes('error') ||
    lower.includes('fatal') ||
    lower.includes('critical') ||
    lower === 'err'
  )
    return 'error';

  return undefined;
}

/**
 * Common timestamp patterns
 */
const TIMESTAMP_PATTERNS = [
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

/**
 * Common log line patterns
 */
const LOG_LINE_PATTERNS = [
  // [timestamp] LEVEL: message
  /^\[?(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)\]?\s*[-:]?\s*(DEBUG|INFO|WARN|WARNING|ERROR|FATAL|TRACE|LOG)[-:]\s*(.+)/i,
  // LEVEL [timestamp] message
  /^(DEBUG|INFO|WARN|WARNING|ERROR|FATAL|TRACE|LOG)\s*\[?(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)\]?\s*[-:]?\s*(.+)/i,
  // timestamp LEVEL message
  /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)\s+(DEBUG|INFO|WARN|WARNING|ERROR|FATAL|TRACE|LOG)\s+(.+)/i,
  // Just LEVEL: message
  /^(DEBUG|INFO|WARN|WARNING|ERROR|FATAL|TRACE|LOG)[-:\s]+(.+)/i,
];

/**
 * Parse a timestamp string to Date
 */
function parseTimestamp(str: string): Date | undefined {
  // Try direct parse first
  const direct = new Date(str);
  if (!isNaN(direct.getTime())) return direct;

  // Try unix timestamp (ms)
  if (/^\d{13}$/.test(str)) {
    return new Date(parseInt(str, 10));
  }

  // Try unix timestamp (s)
  if (/^\d{10}$/.test(str)) {
    return new Date(parseInt(str, 10) * 1000);
  }

  return undefined;
}

/**
 * Extract timestamp from log line
 */
function extractTimestamp(line: string): Date | undefined {
  for (const pattern of TIMESTAMP_PATTERNS) {
    const match = pattern.exec(line);
    if (match) {
      const ts = parseTimestamp(match[1]);
      if (ts) return ts;
    }
  }
  return undefined;
}

/**
 * Detect if content is JSON structured logs
 */
function detectStructured(lines: string[]): boolean {
  // Sample first 10 non-empty lines
  const sample = lines.filter((l) => l.trim()).slice(0, 10);
  if (sample.length === 0) return false;

  let jsonCount = 0;
  for (const line of sample) {
    try {
      JSON.parse(line);
      jsonCount++;
    } catch {
      // Not JSON
    }
  }

  // If more than 70% are JSON, treat as structured
  return jsonCount / sample.length > 0.7;
}

/**
 * Parse a single log line
 */
function parseLogLine(
  line: string,
  lineNumber: number,
  isStructured: boolean
): ParsedLogEntry {
  const trimmed = line.trim();

  if (isStructured) {
    try {
      const json = JSON.parse(trimmed) as Record<string, unknown>;
      const timestamp =
        typeof json.timestamp === 'string' || typeof json.timestamp === 'number'
          ? new Date(json.timestamp)
          : typeof json.time === 'string' || typeof json.time === 'number'
            ? new Date(json.time)
            : typeof json.ts === 'string' || typeof json.ts === 'number'
              ? new Date(json.ts)
              : undefined;

      const levelField =
        (json.level as string) ||
        (json.severity as string) ||
        (json.lvl as string);
      const messageField =
        (json.message as string) || (json.msg as string) || trimmed;

      return {
        raw: trimmed,
        timestamp: timestamp && !isNaN(timestamp.getTime()) ? timestamp : undefined,
        level: detectLevel(levelField),
        message: messageField,
        metadata: json,
        lineNumber,
      };
    } catch {
      // Fall through to text parsing
    }
  }

  // Text log parsing
  for (const pattern of LOG_LINE_PATTERNS) {
    const match = pattern.exec(trimmed);
    if (match) {
      // Pattern 1 & 3: timestamp first
      // Pattern 2: level first
      // Pattern 4: level only
      let timestamp: Date | undefined;
      let level: 'debug' | 'info' | 'warn' | 'error' | undefined;
      let message: string;

      if (match.length === 4) {
        // Has timestamp, level, and message
        const first = match[1];
        const second = match[2];

        if (
          /^\d{4}/.test(first) ||
          /^\[?\d{4}/.test(first) ||
          first.includes('T')
        ) {
          // Timestamp first (patterns 1 & 3)
          timestamp = parseTimestamp(first);
          level = detectLevel(second);
          message = match[3];
        } else {
          // Level first (pattern 2)
          level = detectLevel(first);
          timestamp = parseTimestamp(second);
          message = match[3];
        }
      } else if (match.length === 3) {
        // Just level and message (pattern 4)
        level = detectLevel(match[1]);
        message = match[2];
      } else {
        message = trimmed;
      }

      return {
        raw: trimmed,
        timestamp: timestamp || extractTimestamp(trimmed),
        level,
        message: message!,
        lineNumber,
      };
    }
  }

  // Fallback: just the raw line
  return {
    raw: trimmed,
    timestamp: extractTimestamp(trimmed),
    message: trimmed,
    lineNumber,
  };
}

/**
 * Normalize error message for grouping
 */
function normalizeMessage(message: string): string {
  return message
    // Remove timestamps
    .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g, '<TIME>')
    // Remove file paths with line numbers
    .replace(/[^\s:]+\.(ts|js|tsx|jsx):\d+:\d+/g, '<FILE>')
    // Remove hex addresses/pointers
    .replace(/0x[0-9a-fA-F]+/g, '<ADDR>')
    // Remove UUIDs
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      '<UUID>'
    )
    // Remove large numbers
    .replace(/\b\d{6,}\b/g, '<NUM>')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Group messages by normalized content
 */
function groupMessages(entries: ParsedLogEntry[]): GroupedMessage[] {
  const groups = new Map<string, GroupedMessage & { entries: ParsedLogEntry[] }>();

  for (const entry of entries) {
    const key = normalizeMessage(entry.message);
    const existing = groups.get(key);

    if (existing) {
      existing.count++;
      if (entry.timestamp) {
        const ts = entry.timestamp.toISOString();
        if (ts > existing.last_seen) existing.last_seen = ts;
      }
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

/**
 * Detect anomalies in log entries
 */
function detectAnomalies(entries: ParsedLogEntry[]): Anomaly[] {
  const anomalies: Anomaly[] = [];
  if (entries.length < 10) return anomalies;

  // Get entries with timestamps
  const timedEntries = entries.filter((e) => e.timestamp);
  if (timedEntries.length < 10) return anomalies;

  // Sort by timestamp
  timedEntries.sort(
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
  if (errorEntries.length > 5) {
    // Split into first half and second half
    const midpoint = Math.floor(entries.length / 2);
    const firstHalfErrors = errorEntries.filter(
      (e) => entries.indexOf(e) < midpoint
    ).length;
    const secondHalfErrors = errorEntries.filter(
      (e) => entries.indexOf(e) >= midpoint
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
  const firstHalfErrorMessages = new Set(
    errorEntries
      .filter((e) => entries.indexOf(e) < entries.length / 2)
      .map((e) => normalizeMessage(e.message))
  );

  const newErrors = errorEntries
    .filter((e) => entries.indexOf(e) >= entries.length / 2)
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

    if (firstQuarter.length > 2 && lastQuarter.length > 2) {
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
 * Calculate rate analysis
 */
function calculateRateAnalysis(
  entries: ParsedLogEntry[]
): RateAnalysis | undefined {
  const timedEntries = entries.filter((e) => e.timestamp);
  if (timedEntries.length < 2) return undefined;

  timedEntries.sort(
    (a, b) => (a.timestamp?.getTime() || 0) - (b.timestamp?.getTime() || 0)
  );

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
 * Read last N lines from a file
 */
function tailFile(filePath: string, lines: number): string[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const allLines = content.split('\n');
    return allLines.slice(-lines);
  } catch (err) {
    throw new Error(`Failed to read file: ${(err as Error).message}`);
  }
}

/**
 * Run a command and capture output for a duration
 */
async function captureCommand(
  command: string,
  durationSeconds: number,
  cwd: string
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const lines: string[] = [];
    const parts = command.split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    const proc = spawn(cmd, args, {
      cwd,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const timeout = setTimeout(() => {
      proc.kill('SIGTERM');
    }, durationSeconds * 1000);

    proc.stdout.on('data', (data: Buffer) => {
      lines.push(...data.toString().split('\n').filter((l) => l.trim()));
    });

    proc.stderr.on('data', (data: Buffer) => {
      lines.push(...data.toString().split('\n').filter((l) => l.trim()));
    });

    proc.on('close', () => {
      clearTimeout(timeout);
      resolve(lines);
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to run command: ${err.message}`));
    });
  });
}

/**
 * Match custom patterns against entries
 */
function matchPatterns(
  entries: ParsedLogEntry[],
  patterns: LogAnalyzerArgs['patterns']
): Record<string, number> {
  if (!patterns || patterns.length === 0) return {};

  const results: Record<string, number> = {};

  for (const pattern of patterns) {
    results[pattern.name] = 0;
    try {
      const regex = new RegExp(pattern.regex, 'i');
      for (const entry of entries) {
        if (regex.test(entry.raw)) {
          results[pattern.name]++;
          // Optionally set level if not already set
          if (!entry.level) {
            entry.level = pattern.level;
          }
        }
      }
    } catch {
      // Invalid regex, skip
    }
  }

  return results;
}

/**
 * Format results as markdown
 */
function formatResult(result: LogAnalyzerResult): string {
  const lines: string[] = [];

  lines.push('## Log Analysis Results');
  lines.push('');
  lines.push(`**Entries Analyzed:** ${result.entries_analyzed}`);
  lines.push(`**Format Detected:** ${result.format_detected}`);
  lines.push(
    `**Source:** ${result.source_info.type} (${result.source_info.path_or_command})`
  );
  lines.push(`**Lines Read:** ${result.source_info.lines_read}`);
  lines.push('');

  if (result.time_range.start) {
    lines.push('### Time Range');
    lines.push(`- Start: ${result.time_range.start}`);
    lines.push(`- End: ${result.time_range.end}`);
    if (result.time_range.duration_ms) {
      const durationMin = Math.round(result.time_range.duration_ms / 60000);
      lines.push(`- Duration: ${durationMin} minutes`);
    }
    lines.push('');
  }

  lines.push('### Log Level Distribution');
  lines.push(`- Debug: ${result.levels.debug}`);
  lines.push(`- Info: ${result.levels.info}`);
  lines.push(`- Warn: ${result.levels.warn}`);
  lines.push(`- Error: ${result.levels.error}`);
  lines.push(`- Unknown: ${result.levels.unknown}`);
  lines.push('');

  if (result.anomalies.length > 0) {
    lines.push('### Anomalies Detected');
    for (const anomaly of result.anomalies) {
      const severity = anomaly.severity.toUpperCase();
      lines.push(`- **[${severity}]** ${anomaly.type}: ${anomaly.description}`);
    }
    lines.push('');
  }

  if (result.errors.length > 0) {
    lines.push('### Top Errors');
    for (const err of result.errors.slice(0, 10)) {
      lines.push(`- **${err.count}x** ${err.message.slice(0, 100)}`);
      lines.push(`  - First: ${err.first_seen}, Last: ${err.last_seen}`);
    }
    lines.push('');
  }

  if (result.warnings.length > 0) {
    lines.push('### Top Warnings');
    for (const warn of result.warnings.slice(0, 5)) {
      lines.push(`- **${warn.count}x** ${warn.message.slice(0, 100)}`);
    }
    lines.push('');
  }

  if (Object.keys(result.patterns_matched).length > 0) {
    lines.push('### Custom Pattern Matches');
    for (const [name, count] of Object.entries(result.patterns_matched)) {
      lines.push(`- ${name}: ${count}`);
    }
    lines.push('');
  }

  if (result.rate_analysis) {
    lines.push('### Rate Analysis');
    lines.push(`- Entries/min: ${result.rate_analysis.entries_per_minute}`);
    lines.push(`- Errors/min: ${result.rate_analysis.errors_per_minute}`);
    lines.push(`- Peak period: ${result.rate_analysis.peak_period}`);
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(result, null, 2));
  lines.push('```');

  return lines.join('\n');
}

/**
 * Handles the log_analyzer MCP tool call.
 *
 * Analyzes log files or process output for patterns and anomalies:
 * - Parses structured (JSON) and unstructured (text) logs
 * - Groups and deduplicates errors and warnings
 * - Detects anomalies (spikes, gaps, rate changes, new errors)
 * - Calculates log rate statistics
 * - Supports custom pattern matching
 * - Filters by time window
 *
 * @param args - The log_analyzer tool arguments
 * @returns MCP tool response with log analysis results
 */
export async function handleLogAnalyzer(
  args: LogAnalyzerArgs
): Promise<ReturnType<typeof success> | ReturnType<typeof error>> {
  const cwd = args.cwd ? path.resolve(args.cwd) : PROJECT_ROOT;

  // Validate args
  if (args.source === 'file' && !args.path) {
    return error('path is required when source is "file"');
  }
  if (args.source === 'command' && !args.command) {
    return error('command is required when source is "command"');
  }

  let rawLines: string[];
  let sourceDescription: string;

  try {
    if (args.source === 'file') {
      const filePath = path.isAbsolute(args.path!)
        ? args.path!
        : path.resolve(cwd, args.path!);

      if (!fs.existsSync(filePath)) {
        return error(`File not found: ${filePath}`);
      }

      rawLines = tailFile(filePath, args.tail_lines || 1000);
      sourceDescription = filePath;
    } else {
      const duration = args.duration_seconds || 10;
      rawLines = await captureCommand(args.command!, duration, cwd);
      sourceDescription = args.command!;
    }
  } catch (err) {
    return error((err as Error).message);
  }

  // Filter empty lines
  const nonEmptyLines = rawLines.filter((l) => l.trim());

  if (nonEmptyLines.length === 0) {
    return error('No log entries found in source');
  }

  // Auto-detect structured vs text
  const isStructured =
    args.structured !== undefined
      ? args.structured
      : detectStructured(nonEmptyLines);

  // Parse all entries
  let entries: ParsedLogEntry[] = nonEmptyLines.map((line, idx) =>
    parseLogLine(line, idx + 1, isStructured)
  );

  // Apply time window filter
  if (args.time_window) {
    const windowMs = parseTimeWindow(args.time_window);
    if (windowMs) {
      const cutoff = Date.now() - windowMs;
      entries = entries.filter(
        (e) => !e.timestamp || e.timestamp.getTime() >= cutoff
      );
    }
  }

  // Count levels
  const levels = {
    debug: 0,
    info: 0,
    warn: 0,
    error: 0,
    unknown: 0,
  };

  for (const entry of entries) {
    if (entry.level) {
      levels[entry.level]++;
    } else {
      levels.unknown++;
    }
  }

  // Detect format
  let jsonCount = 0;
  let textCount = 0;
  for (const entry of entries) {
    if (entry.metadata) {
      jsonCount++;
    } else {
      textCount++;
    }
  }

  const formatDetected: 'json' | 'text' | 'mixed' =
    jsonCount === 0
      ? 'text'
      : textCount === 0
        ? 'json'
        : 'mixed';

  // Group errors and warnings
  const errorEntries = entries.filter((e) => e.level === 'error');
  const warnEntries = entries.filter((e) => e.level === 'warn');

  const errors = groupMessages(errorEntries);
  const warnings = groupMessages(warnEntries);

  // Match custom patterns
  const patternsMatched = matchPatterns(entries, args.patterns);

  // Detect anomalies
  const anomalies = detectAnomalies(entries);

  // Calculate time range
  const timedEntries = entries
    .filter((e) => e.timestamp)
    .sort(
      (a, b) => (a.timestamp?.getTime() || 0) - (b.timestamp?.getTime() || 0)
    );

  const timeRange: LogAnalyzerResult['time_range'] = {
    start: timedEntries[0]?.timestamp?.toISOString() || null,
    end:
      timedEntries[timedEntries.length - 1]?.timestamp?.toISOString() || null,
    duration_ms:
      timedEntries.length >= 2
        ? timedEntries[timedEntries.length - 1].timestamp!.getTime() -
          timedEntries[0].timestamp!.getTime()
        : null,
  };

  // Calculate rate analysis
  const rateAnalysis = calculateRateAnalysis(entries);

  const result: LogAnalyzerResult = {
    entries_analyzed: entries.length,
    time_range: timeRange,
    format_detected: formatDetected,
    levels,
    errors,
    warnings,
    patterns_matched: patternsMatched,
    anomalies,
    rate_analysis: rateAnalysis,
    source_info: {
      type: args.source,
      path_or_command: sourceDescription,
      lines_read: rawLines.length,
    },
  };

  return success(formatResult(result));
}
