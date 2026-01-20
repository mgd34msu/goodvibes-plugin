/**
 * Batch Read Handler
 *
 * Reads multiple files in a single call with configurable output verbosity.
 * Supports per-file precision reading with offset/limit for exact line ranges.
 * Useful for efficiently reading multiple files without multiple tool calls.
 *
 * @module handlers/batch/batch-read
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { PROJECT_ROOT } from '../../config.js';
import { fileExists } from '../../utils.js';

// =============================================================================
// Types
// =============================================================================

/** Output mode for controlling response verbosity */
export type OutputMode = 'minimal' | 'standard' | 'verbose';

/**
 * Request for a single file with optional range specification.
 * Enables precision reading of exact line ranges.
 */
export interface FileReadRequest {
  /** File path (relative to project root or absolute) */
  path: string;
  /** Start line (1-based). Omit to start from line 1 */
  offset?: number;
  /** Maximum lines to read. Omit to read to end */
  limit?: number;
}

/**
 * Arguments for the batch_read tool.
 */
export interface BatchReadArgs {
  /** Mixed array: simple paths OR detailed specs with offset/limit */
  files: (string | FileReadRequest)[];
  /** Output verbosity (default: standard) */
  output_mode?: OutputMode;
}

/**
 * Range metadata for the returned content.
 * Tells the agent exactly what was returned.
 */
export interface FileReadRange {
  /** Actual start line (1-based) */
  start: number;
  /** Actual end line (inclusive) */
  end: number;
  /** Number of lines returned */
  lines_returned: number;
  /** Content exists before start */
  has_more_before: boolean;
  /** Content exists after end */
  has_more_after: boolean;
}

/**
 * Result for a single file read.
 */
export interface FileReadResult {
  /** File path (relative to project root) */
  file: string;
  /** Whether the file exists */
  exists: boolean;
  /** Total lines in file (always returned if file exists) */
  total_lines?: number;
  /** File size in bytes (if file exists) */
  size?: number;
  /** Content (based on output_mode) */
  content?: string;
  /** Error message if read failed */
  error?: string;
  /** Range metadata - tells agent exactly what was returned */
  range?: FileReadRange;
}

/**
 * Result of the batch_read tool.
 */
interface BatchReadResult {
  /** Array of file read results */
  files: FileReadResult[];
  /** Number of files successfully read */
  success_count: number;
  /** Number of files that failed to read */
  error_count: number;
  /** Total line count across all files */
  total_lines?: number;
}

/** MCP tool response format */
interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Default number of lines to return in standard mode */
const STANDARD_LINE_LIMIT = 50;

/** Maximum file size to read (5MB) */
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// =============================================================================
// Helpers
// =============================================================================

/**
 * Resolve file path to absolute
 */
function resolveFilePath(filePath: string): string {
  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(PROJECT_ROOT, filePath);
}

/**
 * Make path relative to project root
 */
function makeRelativePath(absolutePath: string): string {
  return path.relative(PROJECT_ROOT, absolutePath).replace(/\\/g, '/');
}

/**
 * Options for reading a file with precision
 */
interface ReadFileOptions {
  /** Start line (1-based). Defaults to 1 */
  offset?: number;
  /** Maximum lines to read. Omit to read to end */
  limit?: number;
  /** Whether explicit offset/limit was provided (affects standard mode behavior) */
  hasExplicitRange: boolean;
}

/**
 * Read a single file with the given output mode and optional line range
 */
async function readFile(
  filePath: string,
  outputMode: OutputMode,
  options: ReadFileOptions = { hasExplicitRange: false }
): Promise<FileReadResult> {
  const absolutePath = resolveFilePath(filePath);
  const relativePath = makeRelativePath(absolutePath);

  // Check if file exists
  if (!(await fileExists(absolutePath))) {
    return {
      file: relativePath,
      exists: false,
      error: 'File not found',
    };
  }

  try {
    // Get file stats first
    const stats = await fs.stat(absolutePath);

    // Check file size
    if (stats.size > MAX_FILE_SIZE) {
      return {
        file: relativePath,
        exists: true,
        size: stats.size,
        error: `File too large: ${(stats.size / 1024 / 1024).toFixed(2)}MB exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`,
      };
    }

    // Read file content
    const content = await fs.readFile(absolutePath, 'utf-8');
    const lines = content.split('\n');
    const totalLines = lines.length;

    // Determine the line range to return
    let startLine: number; // 1-based
    let endLine: number;   // 1-based, inclusive
    let slicedLines: string[];

    if (outputMode === 'minimal') {
      // Minimal mode: no content, but still provide range metadata if explicit range was given
      const result: FileReadResult = {
        file: relativePath,
        exists: true,
        total_lines: totalLines,
        size: stats.size,
      };

      // Add range metadata even in minimal mode if explicit range was requested
      if (options.hasExplicitRange) {
        startLine = Math.max(1, options.offset ?? 1);
        const startIndex = startLine - 1;
        const endIndex = options.limit
          ? Math.min(startIndex + options.limit, totalLines)
          : totalLines;
        endLine = endIndex;

        result.range = {
          start: startLine,
          end: endLine,
          lines_returned: 0, // No content in minimal mode
          has_more_before: startLine > 1,
          has_more_after: endLine < totalLines,
        };
      }

      return result;
    }

    // Determine range based on options and output mode
    if (options.hasExplicitRange) {
      // User specified explicit offset/limit - use exactly that
      startLine = Math.max(1, options.offset ?? 1);
      const startIndex = startLine - 1;

      if (options.limit !== undefined) {
        // Both offset and limit specified
        const endIndex = Math.min(startIndex + options.limit, totalLines);
        slicedLines = lines.slice(startIndex, endIndex);
        endLine = startIndex + slicedLines.length;
      } else {
        // Only offset specified - read to end
        slicedLines = lines.slice(startIndex);
        endLine = totalLines;
      }
    } else if (outputMode === 'standard') {
      // Standard mode without explicit range: default to first 50 lines
      startLine = 1;
      slicedLines = lines.slice(0, STANDARD_LINE_LIMIT);
      endLine = Math.min(STANDARD_LINE_LIMIT, totalLines);
    } else {
      // Verbose mode without explicit range: return full file
      startLine = 1;
      slicedLines = lines;
      endLine = totalLines;
    }

    // Build range metadata
    const range: FileReadRange = {
      start: startLine,
      end: endLine,
      lines_returned: slicedLines.length,
      has_more_before: startLine > 1,
      has_more_after: endLine < totalLines,
    };

    return {
      file: relativePath,
      exists: true,
      total_lines: totalLines,
      size: stats.size,
      content: slicedLines.join('\n'),
      range,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      file: relativePath,
      exists: true,
      error: message,
    };
  }
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Normalize a file entry to extract path and options.
 * Handles both string paths and FileReadRequest objects.
 */
function normalizeFileEntry(entry: string | FileReadRequest): {
  path: string;
  options: ReadFileOptions;
} {
  if (typeof entry === 'string') {
    return {
      path: entry,
      options: { hasExplicitRange: false },
    };
  }

  // It's a FileReadRequest object
  const hasExplicitRange =
    entry.offset !== undefined || entry.limit !== undefined;

  return {
    path: entry.path,
    options: {
      offset: entry.offset,
      limit: entry.limit,
      hasExplicitRange,
    },
  };
}

/**
 * Handle batch_read MCP tool call.
 *
 * Reads multiple files in a single call with configurable output verbosity.
 * Supports per-file precision reading with offset/limit for exact line ranges.
 *
 * @param args - The tool arguments
 * @returns MCP tool response with file contents
 *
 * @example
 * ```typescript
 * // Simple usage with string paths
 * const result = await handleBatchRead({
 *   files: ['src/index.ts', 'src/utils.ts'],
 *   output_mode: 'standard'
 * });
 *
 * // Precision reading with per-file ranges
 * const result = await handleBatchRead({
 *   files: [
 *     { path: 'src/auth.ts', offset: 150, limit: 30 },  // Lines 150-179
 *     { path: 'src/db.ts', offset: 1, limit: 50 },      // First 50 lines
 *     { path: 'src/utils.ts' },                          // Whole file
 *     'config.json'                                      // Simple path
 *   ],
 *   output_mode: 'verbose'
 * });
 * ```
 */
export async function handleBatchRead(
  args: BatchReadArgs
): Promise<ToolResponse> {
  // Validate input
  if (!args.files || args.files.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: 'No files provided' }, null, 2),
        },
      ],
      isError: true,
    };
  }

  const outputMode = args.output_mode ?? 'standard';

  // Normalize entries and read all files in parallel
  const fileResults = await Promise.all(
    args.files.map(entry => {
      const { path: filePath, options } = normalizeFileEntry(entry);
      return readFile(filePath, outputMode, options);
    })
  );

  // Calculate summary stats
  const successCount = fileResults.filter(r => r.exists && !r.error).length;
  const errorCount = fileResults.filter(r => !r.exists || r.error).length;
  const totalLines = fileResults.reduce(
    (sum, r) => sum + (r.total_lines ?? 0),
    0
  );

  const result: BatchReadResult = {
    files: fileResults,
    success_count: successCount,
    error_count: errorCount,
    total_lines: totalLines,
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
