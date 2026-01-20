/**
 * Batch Read Handler
 *
 * Reads multiple files in a single call with configurable output verbosity.
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
 * Arguments for the batch_read tool.
 */
export interface BatchReadArgs {
  /** Array of file paths (relative to project root or absolute) */
  files: string[];
  /** Output verbosity (default: standard) */
  output_mode?: OutputMode;
}

/**
 * Result for a single file read.
 */
interface FileReadResult {
  /** File path (relative to project root) */
  file: string;
  /** Whether the file exists */
  exists: boolean;
  /** Line count (if file exists) */
  line_count?: number;
  /** File size in bytes (if file exists) */
  size?: number;
  /** Content (based on output_mode) */
  content?: string;
  /** Error message if read failed */
  error?: string;
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
 * Read a single file with the given output mode
 */
async function readFile(
  filePath: string,
  outputMode: OutputMode
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
    const lineCount = lines.length;

    // Format result based on output mode
    if (outputMode === 'minimal') {
      return {
        file: relativePath,
        exists: true,
        line_count: lineCount,
        size: stats.size,
      };
    }

    if (outputMode === 'standard') {
      // Return first N lines
      const truncatedContent = lines.slice(0, STANDARD_LINE_LIMIT).join('\n');
      const truncated = lineCount > STANDARD_LINE_LIMIT;
      return {
        file: relativePath,
        exists: true,
        line_count: lineCount,
        size: stats.size,
        content: truncated
          ? `${truncatedContent}\n... (${lineCount - STANDARD_LINE_LIMIT} more lines)`
          : truncatedContent,
      };
    }

    // Verbose mode - return full content
    return {
      file: relativePath,
      exists: true,
      line_count: lineCount,
      size: stats.size,
      content,
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
 * Handle batch_read MCP tool call.
 *
 * Reads multiple files in a single call with configurable output verbosity.
 *
 * @param args - The tool arguments
 * @returns MCP tool response with file contents
 *
 * @example
 * ```typescript
 * const result = await handleBatchRead({
 *   files: ['src/index.ts', 'src/utils.ts'],
 *   output_mode: 'standard'
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

  // Read all files in parallel
  const fileResults = await Promise.all(
    args.files.map(file => readFile(file, outputMode))
  );

  // Calculate summary stats
  const successCount = fileResults.filter(r => r.exists && !r.error).length;
  const errorCount = fileResults.filter(r => !r.exists || r.error).length;
  const totalLines = fileResults.reduce(
    (sum, r) => sum + (r.line_count ?? 0),
    0
  );

  const result: BatchReadResult = {
    files: fileResults,
    success_count: successCount,
    error_count: errorCount,
    total_lines: outputMode !== 'minimal' ? totalLines : undefined,
  };

  // Include total_lines for minimal mode too
  if (outputMode === 'minimal') {
    result.total_lines = totalLines;
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
