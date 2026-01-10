/**
 * Watch for Errors Handler
 *
 * Monitors logs or process output for errors and warnings.
 * Supports:
 * - File source: Reads last N lines from a log file
 * - Command source: Spawns command and captures output
 * - Custom error patterns via regex
 * - Stack trace extraction
 * - Error deduplication by message similarity
 * - Error type classification
 *
 * @module handlers/process/watch-for-errors
 */

import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import { ToolResponse } from '../../types.js';
import { PROJECT_ROOT } from '../../config.js';
import { fileExists } from '../../utils.js';

/**
 * Arguments for watch_for_errors tool
 */
export interface WatchForErrorsArgs {
  /** Source type: file or command */
  source: 'file' | 'command';
  /** Log file path to tail (for file source) */
  file_path?: string;
  /** Command to run and watch (for command source) */
  command?: string;
  /** Custom error patterns as regex strings */
  patterns?: string[];
  /** Duration to watch in ms (default: 5000 for snapshot) */
  duration?: number;
  /** Number of lines to read from file (default: 100) */
  tail_lines?: number;
  /** Working directory */
  cwd?: string;
}

/**
 * A single detected error
 */
export interface DetectedError {
  /** ISO timestamp when error was detected */
  timestamp: string;
  /** Error type classification */
  type: ErrorType;
  /** Error message text */
  message: string;
  /** Stack trace if available */
  stack?: string;
  /** Line number in source file (if from file) */
  line_number?: number;
  /** Number of occurrences (after deduplication) */
  count: number;
}

/**
 * A single detected warning
 */
export interface DetectedWarning {
  /** ISO timestamp when warning was detected */
  timestamp: string;
  /** Warning message text */
  message: string;
  /** Number of occurrences (after deduplication) */
  count: number;
}

/**
 * Source information for the analysis
 */
export interface SourceInfo {
  /** Type of source analyzed */
  type: 'file' | 'command';
  /** File path or command that was analyzed */
  path_or_command: string;
  /** Number of lines analyzed */
  lines_analyzed: number;
}

/**
 * Result of watching for errors
 */
export interface WatchForErrorsResult {
  /** Detected errors */
  errors: DetectedError[];
  /** Detected warnings */
  warnings: DetectedWarning[];
  /** Total error count (including duplicates) */
  total_errors: number;
  /** Unique error count (after deduplication) */
  unique_errors: number;
  /** Total warning count */
  total_warnings: number;
  /** Source information */
  source_info: SourceInfo;
}

/**
 * Error type classification
 */
export type ErrorType =
  | 'syntax'
  | 'type'
  | 'reference'
  | 'module'
  | 'permission'
  | 'network'
  | 'assertion'
  | 'runtime'
  | 'unknown';

/**
 * Default error patterns to detect
 */
const DEFAULT_ERROR_PATTERNS: RegExp[] = [
  /\berror\b/i,
  /\bexception\b/i,
  /\bfailed\b/i,
  /\bfatal\b/i,
  /\bENOENT\b/,
  /\bEACCES\b/,
  /\bEPERM\b/,
  /\bECONNREFUSED\b/,
  /\bETIMEDOUT\b/,
  /\bENOTFOUND\b/,
  /\bTypeError\b/,
  /\bReferenceError\b/,
  /\bSyntaxError\b/,
  /\bRangeError\b/,
  /\bURIError\b/,
  /\bEvalError\b/,
  /\bAssertionError\b/,
  /\bCannot find module\b/,
  /\bModule not found\b/,
  /\bUnhandledPromiseRejection\b/,
  /\bUnhandled Promise Rejection\b/,
  /\bUncaught\b/,
];

/**
 * Warning patterns to detect
 */
const WARNING_PATTERNS: RegExp[] = [
  /\bWARN\b/i,
  /\bWARNING\b/i,
  /\bDeprecation\b/i,
  /\bDeprecated\b/i,
];

/**
 * Patterns for classifying error types
 */
const ERROR_TYPE_PATTERNS: Array<{ pattern: RegExp; type: ErrorType }> = [
  { pattern: /SyntaxError/i, type: 'syntax' },
  { pattern: /TypeError/i, type: 'type' },
  { pattern: /ReferenceError/i, type: 'reference' },
  { pattern: /Cannot find module|Module not found|ENOENT.*module/i, type: 'module' },
  { pattern: /EACCES|EPERM|Permission denied/i, type: 'permission' },
  { pattern: /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|network|socket/i, type: 'network' },
  { pattern: /AssertionError|assertion failed/i, type: 'assertion' },
  { pattern: /RangeError|URIError|EvalError/i, type: 'runtime' },
];

/**
 * Stack trace line pattern (V8 format)
 */
const STACK_LINE_PATTERN = /^\s+at\s+/;

/**
 * Classifies an error message into a type
 *
 * @param message - Error message to classify
 * @returns Classified error type
 */
function classifyErrorType(message: string): ErrorType {
  for (const { pattern, type } of ERROR_TYPE_PATTERNS) {
    if (pattern.test(message)) {
      return type;
    }
  }
  return 'unknown';
}

/**
 * Extracts a normalized message for deduplication
 *
 * @param message - Full error message
 * @returns Normalized message for comparison
 */
function normalizeMessage(message: string): string {
  return message
    // Remove file paths with line numbers
    .replace(/(?:\/[\w./\\-]+|\w:\\[\w./\\-]+):\d+:\d+/g, '<path>')
    // Remove memory addresses
    .replace(/0x[a-fA-F0-9]+/g, '<addr>')
    // Remove timestamps
    .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g, '<time>')
    // Remove UUIDs
    .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '<uuid>')
    // Remove varying numbers (but keep error codes)
    .replace(/\b\d{4,}\b/g, '<num>')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculates similarity between two strings (Jaccard index on word sets)
 *
 * @param a - First string
 * @param b - Second string
 * @returns Similarity score between 0 and 1
 */
function calculateSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));

  const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);

  return intersection.size / union.size;
}

/**
 * Parses lines and extracts errors with stack traces
 *
 * @param lines - Array of log lines
 * @param errorPatterns - Patterns to match errors
 * @param isFromFile - Whether lines are from a file (for line numbers)
 * @returns Parsed errors and warnings
 */
function parseLines(
  lines: string[],
  errorPatterns: RegExp[],
  isFromFile: boolean,
): { errors: DetectedError[]; warnings: DetectedWarning[] } {
  const errors: DetectedError[] = [];
  const warnings: DetectedWarning[] = [];
  const errorMap = new Map<string, DetectedError>();
  const warningMap = new Map<string, DetectedWarning>();
  const timestamp = new Date().toISOString();

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const lineNumber = isFromFile ? i + 1 : undefined;

    // Check for warnings first (to avoid treating "WARNING" as error)
    const isWarning = WARNING_PATTERNS.some(p => p.test(line));
    if (isWarning && !errorPatterns.some(p => p.test(line) && !WARNING_PATTERNS.some(w => w.test(line)))) {
      const normalizedMsg = normalizeMessage(line);

      // Deduplicate warnings
      let matched = false;
      for (const [key, existing] of warningMap) {
        if (calculateSimilarity(normalizedMsg, key) > 0.8) {
          existing.count++;
          matched = true;
          break;
        }
      }

      if (!matched) {
        warningMap.set(normalizedMsg, {
          timestamp,
          message: line.trim(),
          count: 1,
        });
      }

      i++;
      continue;
    }

    // Check for errors
    const isError = errorPatterns.some(p => p.test(line));
    if (isError) {
      // Extract stack trace if present
      let stack: string | undefined;
      const stackLines: string[] = [];
      let j = i + 1;
      while (j < lines.length && STACK_LINE_PATTERN.test(lines[j])) {
        stackLines.push(lines[j].trim());
        j++;
      }
      if (stackLines.length > 0) {
        stack = stackLines.join('\n');
      }

      const errorType = classifyErrorType(line);
      const normalizedMsg = normalizeMessage(line);

      // Deduplicate errors
      let matched = false;
      for (const [key, existing] of errorMap) {
        if (calculateSimilarity(normalizedMsg, key) > 0.8) {
          existing.count++;
          matched = true;
          break;
        }
      }

      if (!matched) {
        errorMap.set(normalizedMsg, {
          timestamp,
          type: errorType,
          message: line.trim(),
          stack,
          line_number: lineNumber,
          count: 1,
        });
      }

      // Skip the stack trace lines we already processed
      i = j;
      continue;
    }

    i++;
  }

  return {
    errors: Array.from(errorMap.values()),
    warnings: Array.from(warningMap.values()),
  };
}

/**
 * Reads the last N lines from a file
 *
 * @param filePath - Path to the file
 * @param lineCount - Number of lines to read
 * @returns Array of lines
 */
async function tailFile(filePath: string, lineCount: number): Promise<string[]> {
  try {
    const content = await fsPromises.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const startIndex = Math.max(0, lines.length - lineCount);
    return lines.slice(startIndex);
  } catch (error) {
    throw new Error(`Failed to read file: ${filePath} - ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Runs a command and captures output for a specified duration
 *
 * @param command - Command to run
 * @param cwd - Working directory
 * @param duration - Duration to capture in ms
 * @returns Combined stdout and stderr lines
 */
async function captureCommandOutput(
  command: string,
  cwd: string,
  duration: number,
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const lines: string[] = [];

    // Parse command (handle quoted arguments)
    const parts = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
    if (parts.length === 0) {
      reject(new Error('Empty command provided'));
      return;
    }

    const cmd = parts[0] as string;
    const args = parts.slice(1).map(arg => arg.replace(/^["']|["']$/g, ''));

    const child = spawn(cmd, args, {
      cwd,
      shell: process.platform === 'win32',
    });

    let killed = false;

    const processLine = (line: string) => {
      if (line.trim()) {
        lines.push(line);
      }
    };

    if (child.stdout) {
      child.stdout.on('data', (data: Buffer) => {
        data.toString().split('\n').forEach(processLine);
      });
    }

    if (child.stderr) {
      child.stderr.on('data', (data: Buffer) => {
        data.toString().split('\n').forEach(processLine);
      });
    }

    child.on('error', (error: Error) => {
      if (!killed) {
        reject(new Error(`Failed to spawn command: ${error.message}`));
      }
    });

    child.on('close', (code: number | null) => {
      if (!killed && code !== 0 && code !== null) {
        // Process exited with error, but we still have output
        resolve(lines);
      } else {
        resolve(lines);
      }
    });

    // Set timeout to kill the process
    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
      // Give it a moment to die gracefully
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
        resolve(lines);
      }, 500);
    }, duration);

    // If process ends before timeout, clear the timer
    child.on('close', () => {
      clearTimeout(timer);
    });
  });
}

/**
 * Compiles custom pattern strings to RegExp objects
 *
 * @param patterns - Array of regex pattern strings
 * @returns Array of RegExp objects
 */
function compilePatterns(patterns: string[]): RegExp[] {
  return patterns.map(p => {
    try {
      return new RegExp(p, 'i');
    } catch {
      // Invalid regex, treat as literal string
      return new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }
  });
}

/**
 * Formats the result as readable markdown
 *
 * @param result - The analysis result
 * @returns Formatted markdown string
 */
function formatResult(result: WatchForErrorsResult): string {
  const lines: string[] = [];

  lines.push('## Error Watch Results');
  lines.push('');
  lines.push(`**Source:** ${result.source_info.type === 'file' ? 'File' : 'Command'} - \`${result.source_info.path_or_command}\``);
  lines.push(`**Lines Analyzed:** ${result.source_info.lines_analyzed}`);
  lines.push('');

  // Summary
  lines.push('### Summary');
  lines.push(`- **Total Errors:** ${result.total_errors} (${result.unique_errors} unique)`);
  lines.push(`- **Total Warnings:** ${result.total_warnings}`);
  lines.push('');

  // Errors
  if (result.errors.length > 0) {
    lines.push('### Errors');
    lines.push('');

    for (const error of result.errors) {
      const countSuffix = error.count > 1 ? ` (x${error.count})` : '';
      const lineSuffix = error.line_number ? ` [line ${error.line_number}]` : '';
      lines.push(`#### [${error.type.toUpperCase()}]${lineSuffix}${countSuffix}`);
      lines.push('```');
      lines.push(error.message);
      if (error.stack) {
        lines.push('');
        lines.push(error.stack);
      }
      lines.push('```');
      lines.push('');
    }
  }

  // Warnings
  if (result.warnings.length > 0) {
    lines.push('### Warnings');
    lines.push('');

    for (const warning of result.warnings) {
      const countSuffix = warning.count > 1 ? ` (x${warning.count})` : '';
      lines.push(`- ${warning.message}${countSuffix}`);
    }
    lines.push('');
  }

  // No issues found
  if (result.errors.length === 0 && result.warnings.length === 0) {
    lines.push('### No Issues Found');
    lines.push('');
    lines.push('No errors or warnings were detected in the analyzed output.');
    lines.push('');
  }

  // Raw JSON
  lines.push('---');
  lines.push('');
  lines.push('<details>');
  lines.push('<summary>Raw JSON</summary>');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(result, null, 2));
  lines.push('```');
  lines.push('</details>');

  return lines.join('\n');
}

/**
 * Handles the watch_for_errors MCP tool call.
 *
 * Monitors logs or process output for errors and warnings.
 * For file source: reads the last N lines from a log file.
 * For command source: spawns command and captures output for duration.
 *
 * @param args - The watch_for_errors tool arguments
 * @param args.source - Source type: 'file' or 'command'
 * @param args.file_path - Log file path (for file source)
 * @param args.command - Command to run (for command source)
 * @param args.patterns - Custom error patterns as regex strings
 * @param args.duration - Duration to watch in ms (default: 5000)
 * @param args.tail_lines - Lines to read from file (default: 100)
 * @param args.cwd - Working directory
 * @returns MCP tool response with errors, warnings, and summary
 *
 * @example
 * // Watch a log file
 * await handleWatchForErrors({
 *   source: 'file',
 *   file_path: 'logs/app.log',
 *   tail_lines: 200,
 * });
 *
 * @example
 * // Watch a command output
 * await handleWatchForErrors({
 *   source: 'command',
 *   command: 'npm run dev',
 *   duration: 10000,
 * });
 */
export async function handleWatchForErrors(args: WatchForErrorsArgs): Promise<ToolResponse> {
  const {
    source,
    file_path,
    command,
    patterns: customPatterns,
    duration = 5000,
    tail_lines = 100,
    cwd,
  } = args;

  const workingDir = cwd ? path.resolve(PROJECT_ROOT, cwd) : PROJECT_ROOT;

  // Validate arguments
  if (source === 'file' && !file_path) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'file_path is required when source is "file"',
        }, null, 2),
      }],
      isError: true,
    };
  }

  if (source === 'command' && !command) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'command is required when source is "command"',
        }, null, 2),
      }],
      isError: true,
    };
  }

  // Build error patterns
  const errorPatterns = [...DEFAULT_ERROR_PATTERNS];
  if (customPatterns && customPatterns.length > 0) {
    errorPatterns.push(...compilePatterns(customPatterns));
  }

  let lines: string[] = [];
  let pathOrCommand = '';

  try {
    if (source === 'file') {
      const filePath = path.resolve(workingDir, file_path!);

      if (!await fileExists(filePath)) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: `File not found: ${file_path}`,
            }, null, 2),
          }],
          isError: true,
        };
      }

      lines = await tailFile(filePath, tail_lines);
      pathOrCommand = file_path!;
    } else {
      lines = await captureCommandOutput(command!, workingDir, duration);
      pathOrCommand = command!;
    }

    // Parse the lines for errors and warnings
    const { errors, warnings } = parseLines(lines, errorPatterns, source === 'file');

    // Calculate totals
    const totalErrors = errors.reduce((sum, e) => sum + e.count, 0);
    const totalWarnings = warnings.reduce((sum, w) => sum + w.count, 0);

    // Sort errors by count (most frequent first), then by type severity
    const typeSeverity: Record<ErrorType, number> = {
      syntax: 0,
      type: 1,
      reference: 2,
      module: 3,
      permission: 4,
      network: 5,
      assertion: 6,
      runtime: 7,
      unknown: 8,
    };

    errors.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return typeSeverity[a.type] - typeSeverity[b.type];
    });

    warnings.sort((a, b) => b.count - a.count);

    const result: WatchForErrorsResult = {
      errors,
      warnings,
      total_errors: totalErrors,
      unique_errors: errors.length,
      total_warnings: totalWarnings,
      source_info: {
        type: source,
        path_or_command: pathOrCommand,
        lines_analyzed: lines.length,
      },
    };

    return {
      content: [{
        type: 'text',
        text: formatResult(result),
      }],
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        }, null, 2),
      }],
      isError: true,
    };
  }
}
