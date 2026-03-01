/**
 * analyzeLogs — L2 extension for the runtime domain.
 *
 * Composes L1 core/runtime utilities to analyze log files or process output
 * for patterns and anomalies.
 *
 * @module extensions/runtime/logs
 */

import * as node_fs from 'node:fs';
import * as node_path from 'node:path';

import { PROJECT_ROOT } from '../../shared/config.js';
import { ok, fail } from '../../shared/response.js';
import type { McpResponse } from '../../shared/response.js';

import type { LogAnalyzerArgs, LogAnalyzerResult } from '../../core/runtime/types.js';
import { detectStructured, parseLogLine } from '../../core/runtime/log-parser.js';
import { spawnCommand } from '../../core/runtime/process-utils.js';
import { groupMessages, detectAnomalies, calculateRateAnalysis, matchPatterns } from '../../core/runtime/log-analysis.js';
import { parseTimeWindow } from '../../core/runtime/time-utils.js';
import { formatLogAnalysis } from '../../core/runtime/formatters.js';

/**
 * Reads the last N lines from a file asynchronously.
 *
 * @param filePath - Absolute path to the log file
 * @param lines - Maximum number of lines to return
 * @returns Array of line strings
 */
async function tailFile(filePath: string, lines: number): Promise<string[]> {
  try {
    const content = await node_fs.promises.readFile(filePath, 'utf-8');
    const allLines = content.split('\n');
    return allLines.slice(-lines);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read file: ${message}`);
  }
}

/**
 * Runs a command and captures stdout/stderr for a duration.
 *
 * @param command - Shell command to execute
 * @param durationSeconds - How many seconds to capture output
 * @param cwd - Working directory for the command
 * @returns Array of captured lines
 */
async function captureCommand(
  command: string,
  durationSeconds: number,
  cwd: string
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const lines: string[] = [];

    const proc = spawnCommand(command, cwd);

    const timeout = setTimeout(() => {
      proc.kill('SIGTERM');
    }, durationSeconds * 1000);

    // stdout/stderr are non-null because spawnCommand uses stdio: 'pipe'
    proc.stdout?.on('data', (data: Buffer) => {
      lines.push(...data.toString().split('\n').filter((l) => l.trim()));
    });

    proc.stderr?.on('data', (data: Buffer) => {
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
 * Analyzes log files or process output for patterns and anomalies.
 *
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
export async function analyzeLogs(args: LogAnalyzerArgs): Promise<McpResponse> {
  const cwd = args.cwd ? node_path.resolve(args.cwd) : PROJECT_ROOT;

  // Validate args
  if (args.source === 'file' && !args.path) {
    return fail('path is required when source is "file"');
  }
  if (args.source === 'command' && !args.command) {
    return fail('command is required when source is "command"');
  }

  let rawLines: string[];
  let sourceDescription: string;

  try {
    if (args.source === 'file') {
      const filePath = node_path.isAbsolute(args.path!)
        ? args.path!
        : node_path.resolve(cwd, args.path!);

      if (!node_fs.existsSync(filePath)) {
        return fail(`File not found: ${filePath}`);
      }

      rawLines = await tailFile(filePath, args.tail_lines || 1000);
      sourceDescription = filePath;
    } else {
      const duration = args.duration_seconds || 10;
      rawLines = await captureCommand(args.command!, duration, cwd);
      sourceDescription = args.command!;
    }
  } catch (err: unknown) {
    /* v8 ignore start */
    const message = err instanceof Error ? err.message : String(err);
    /* v8 ignore stop */
    return fail(message);
  }

  // Filter empty lines
  const nonEmptyLines = rawLines.filter((l) => l.trim());

  if (nonEmptyLines.length === 0) {
    return fail('No log entries found in source');
  }

  // Auto-detect structured vs text
  const isStructured =
    args.structured !== undefined
      ? args.structured
      : detectStructured(nonEmptyLines);

  // Parse all entries
  let entries = nonEmptyLines.map((line, idx) =>
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
      /* v8 ignore next */
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

  return ok(formatLogAnalysis(result));
}
