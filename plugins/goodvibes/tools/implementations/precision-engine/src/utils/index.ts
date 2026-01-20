/**
 * Utility functions for precision-engine.
 */

import { OutputMode, PrecisionResult } from '../types.js';
import { TOKEN_MULTIPLIERS } from '../config.js';
import { estimateTokens } from '../logging.js';

/**
 * Create a successful precision result.
 */
export function successResult<T>(
  data: T,
  outputMode: OutputMode,
  executionMs: number
): PrecisionResult<T> {
  const jsonStr = JSON.stringify(data);
  const baseTokens = estimateTokens(jsonStr);
  const adjustedTokens = Math.ceil(baseTokens * TOKEN_MULTIPLIERS[outputMode]);

  return {
    success: true,
    data,
    meta: {
      output_mode: outputMode,
      token_estimate: adjustedTokens,
      execution_ms: executionMs,
    },
  };
}

/**
 * Create an error precision result.
 */
export function errorResult(
  error: string,
  outputMode: OutputMode,
  executionMs: number
): PrecisionResult<never> {
  return {
    success: false,
    error,
    meta: {
      output_mode: outputMode,
      token_estimate: estimateTokens(error),
      execution_ms: executionMs,
    },
  };
}

/**
 * Parse output mode from arguments, defaulting to "standard".
 */
export function parseOutputMode(args: unknown): OutputMode {
  if (
    typeof args === 'object' &&
    args !== null &&
    'output_mode' in args &&
    typeof (args as Record<string, unknown>).output_mode === 'string'
  ) {
    const mode = (args as Record<string, unknown>).output_mode as string;
    if (['count_only', 'minimal', 'standard', 'verbose'].includes(mode)) {
      return mode as OutputMode;
    }
  }
  return 'standard';
}

/**
 * Normalize a file path for consistent handling.
 */
export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * Extract lines from content with offset and limit.
 */
export function extractLines(
  content: string,
  offset = 0,
  limit?: number
): { lines: string[]; totalLines: number; truncated: boolean } {
  const allLines = content.split('\n');
  const totalLines = allLines.length;

  const startIndex = Math.min(offset, totalLines);
  const endIndex = limit !== undefined ? Math.min(startIndex + limit, totalLines) : totalLines;

  const lines = allLines.slice(startIndex, endIndex);
  const truncated = endIndex < totalLines;

  return { lines, totalLines, truncated };
}

/**
 * Check if a file extension is a text file.
 */
export function isTextFile(filePath: string): boolean {
  const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
  const textExtensions = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.json', '.yaml', '.yml', '.toml', '.xml',
    '.md', '.mdx', '.txt', '.rst',
    '.html', '.css', '.scss', '.sass', '.less',
    '.py', '.rb', '.go', '.rs', '.java', '.kt',
    '.c', '.cpp', '.h', '.hpp', '.sh', '.sql',
  ]);
  return textExtensions.has(ext);
}
