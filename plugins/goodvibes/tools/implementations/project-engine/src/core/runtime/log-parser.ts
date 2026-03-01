/**
 * Log line parsing utilities for the runtime domain.
 *
 * Provides functions to detect log levels, parse timestamps, and parse
 * individual log lines in both structured (JSON) and unstructured (text) formats.
 *
 * @module core/runtime/log-parser
 */

import { TIMESTAMP_PATTERNS } from './constants.js';

/** A parsed log entry extracted from a single log line */
export interface ParsedLogEntry {
  raw: string;
  timestamp?: Date;
  level?: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  metadata?: Record<string, unknown>;
  lineNumber: number;
}

/** Common log line patterns for text-format logs */
const LOG_LINE_PATTERNS: RegExp[] = [
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
 * Detects log level from a level string.
 *
 * Handles common aliases: trace/verbose -> debug, log -> info,
 * warning -> warn, fatal/critical/err -> error.
 *
 * @param levelStr - Level string from the log entry (e.g., 'ERROR', 'WARN')
 * @returns Normalized level or undefined if not recognized
 */
export function detectLevel(
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
 * Parses a timestamp string to a Date object.
 *
 * Supports ISO strings, Unix ms (13-digit), and Unix s (10-digit) formats.
 *
 * @param str - Timestamp string to parse
 * @returns Parsed Date or undefined if unparseable
 */
export function parseTimestamp(str: string): Date | undefined {
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
 * Extracts a timestamp from an arbitrary log line by trying all known patterns.
 *
 * @param line - Raw log line text
 * @returns Parsed Date or undefined if no timestamp found
 */
export function extractTimestamp(line: string): Date | undefined {
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
 * Detects whether a sample of log lines appears to be JSON-structured.
 *
 * Returns true if more than 70% of sampled (up to 10) non-empty lines
 * are valid JSON.
 *
 * @param lines - Array of raw log lines to sample
 * @returns True if the majority of lines are valid JSON
 */
export function detectStructured(lines: string[]): boolean {
  // Sample first 10 non-empty lines
  const sample = lines.filter((l) => l.trim()).slice(0, 10);
  /* v8 ignore next -- defensive check for empty input */
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
 * Parses a single log line into a structured ParsedLogEntry.
 *
 * Handles both JSON-structured and plain text log formats.
 * Falls back to treating the raw line as the message if no pattern matches.
 *
 * @param line - Raw log line text
 * @param lineNumber - Line number within the source (1-indexed)
 * @param isStructured - Whether to attempt JSON parsing first
 * @returns Parsed log entry
 */
export function parseLogLine(
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
      /* v8 ignore start */
    } catch {
      // Fall through to text parsing
    }
    /* v8 ignore stop */
  }

  // Text log parsing
  for (const pattern of LOG_LINE_PATTERNS) {
    const match = pattern.exec(trimmed);
    if (match) {
      let timestamp: Date | undefined;
      let level: 'debug' | 'info' | 'warn' | 'error' | undefined;
      let message: string;

      // Default message to the trimmed line before conditional branches
      message = trimmed;

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
      } else {
        // match.length === 3: Just level and message (pattern 4)
        level = detectLevel(match[1]);
        message = match[2];
      }

      return {
        raw: trimmed,
        timestamp: timestamp || extractTimestamp(trimmed),
        level,
        message,
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
 * Normalizes an error message for grouping by removing variable parts.
 *
 * Strips timestamps, file paths with line numbers, hex addresses,
 * UUIDs, and large numbers to produce a stable grouping key.
 *
 * @param message - Raw log message string
 * @returns Normalized string suitable for use as a grouping key
 */
export function normalizeMessage(message: string): string {
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
