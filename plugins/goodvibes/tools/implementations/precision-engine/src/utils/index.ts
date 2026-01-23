/**
 * Utility functions for precision-engine.
 */

import { CallToolResult, TextContent } from '@modelcontextprotocol/sdk/types.js';
import { OutputMode, PrecisionResult } from '../types.js';

/**
 * Handler function type.
 */
export type ToolHandler = (args: unknown) => Promise<CallToolResult>;

/**
 * Convert a PrecisionResult to MCP CallToolResult format.
 */
export function toCallToolResult<T>(result: PrecisionResult<T>): CallToolResult {
  const content: TextContent = {
    type: 'text',
    text: JSON.stringify(result, null, 2),
  };

  return {
    content: [content],
    isError: !result.success,
  };
}
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
 * Standard defaults for most tools.
 */
export const STANDARD_DEFAULTS = {
  output_mode: 'standard' as OutputMode,
  extract: 'content' as const,
};

/**
 * Tool-specific defaults that override standard defaults.
 */
export const TOOL_SPECIFIC_DEFAULTS: Record<string, Partial<typeof STANDARD_DEFAULTS & { output_mode: string }>> = {
  discover: { output_mode: 'files_only' },
  precision_symbols: { output_mode: 'signatures' },
  precision_edit: { output_mode: 'with_diff' },
  precision_glob: { output_mode: 'paths_only' },
  precision_grep: { output_mode: 'files_only' },
};

/**
 * Apply defaults to input, with optional tool-specific overrides.
 * @param input - The input object to apply defaults to
 * @param defaults - The defaults to apply
 * @returns Input with defaults applied (defaults do not override existing values)
 */
export function applyDefaults<T extends Record<string, unknown>>(
  input: T,
  defaults: Partial<T>
): T {
  return { ...defaults, ...input };
}

/**
 * Parse output mode from arguments, with optional tool-specific defaults.
 * @param args - The arguments object containing output_mode or output.mode
 * @param toolName - Optional tool name for tool-specific defaults
 * @returns The output mode to use
 */
export function parseOutputMode(args: unknown, toolName?: string): OutputMode {
  if (
    typeof args === 'object' &&
    args !== null &&
    'output_mode' in args &&
    typeof (args as Record<string, unknown>).output_mode === 'string'
  ) {
    const mode = (args as Record<string, unknown>).output_mode as string;
    if (['count_only', 'exit_codes', 'minimal', 'standard', 'with_preview', 'verbose', 'paths_only', 'files_only', 'with_diff', 'signatures', 'locations', 'matches', 'context'].includes(mode)) {
      return mode as OutputMode;
    }
  }
  // Check for output.mode nested structure (SPEC-v2 format)
  if (
    typeof args === 'object' &&
    args !== null &&
    'output' in args &&
    typeof (args as Record<string, unknown>).output === 'object' &&
    (args as Record<string, unknown>).output !== null
  ) {
    const output = (args as Record<string, { mode?: string }>).output;
    if (output.mode && ['count_only', 'exit_codes', 'minimal', 'standard', 'with_preview', 'verbose'].includes(output.mode)) {
      return output.mode as OutputMode;
    }
  }
  // Apply tool-specific default if provided
  if (toolName && TOOL_SPECIFIC_DEFAULTS[toolName]?.output_mode) {
    return TOOL_SPECIFIC_DEFAULTS[toolName].output_mode as OutputMode;
  }

  // Fall back to standard default
  return STANDARD_DEFAULTS.output_mode;
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

// Export error formatting utilities
export * from './errors.js';

// === String Field Resolution Utilities ===

import { readFileSync } from 'fs';
import { resolve as resolvePath } from 'path';
import { formatMutualExclusivityError } from './errors.js';

export interface ResolveStringFieldOptions {
  allowFile?: boolean;
  basePath?: string;
  required?: boolean;
  fieldName: string;
}

/**
 * Resolve a string field that can be provided as:
 * - Direct value: { fieldName: "value" }
 * - Base64-encoded: { fieldName_base64: "base64string" }
 * - File path: { fieldName_file: "/path/to/file.txt" }
 *
 * Ensures mutual exclusivity and handles all three sources.
 */
export function resolveStringField(
  obj: Record<string, unknown>,
  fieldName: string,
  options: ResolveStringFieldOptions
): string {
  const { allowFile = false, basePath = process.cwd(), required = false } = options;

  const directValue = obj[fieldName];
  const base64Value = obj[`${fieldName}_base64`];
  const fileValue = obj[`${fieldName}_file`];

  // Check mutual exclusivity
  const providedSources: string[] = [];
  if (directValue !== undefined) providedSources.push(fieldName);
  if (base64Value !== undefined) providedSources.push(`${fieldName}_base64`);
  if (fileValue !== undefined) providedSources.push(`${fieldName}_file`);

  if (providedSources.length > 1) {
    throw new Error(formatMutualExclusivityError(fieldName, providedSources));
  }

  // Handle base64
  if (base64Value !== undefined) {
    if (typeof base64Value !== 'string') {
      throw new Error(`${fieldName}_base64 must be a string, got ${typeof base64Value}`);
    }
    try {
      return Buffer.from(base64Value, 'base64').toString('utf-8');
    } catch (e) {
      throw new Error(`Invalid base64 in ${fieldName}_base64: ${(e as Error).message}`);
    }
  }

  // Handle file
  if (fileValue !== undefined) {
    if (!allowFile) {
      throw new Error(`${fieldName}_file is not supported for this field`);
    }
    if (typeof fileValue !== 'string') {
      throw new Error(`${fieldName}_file must be a string path, got ${typeof fileValue}`);
    }
    const filePath = resolvePath(basePath, fileValue);
    try {
      return readFileSync(filePath, 'utf-8');
    } catch (e) {
      throw new Error(`Failed to read ${fieldName}_file at '${filePath}': ${(e as Error).message}`);
    }
  }

  // Handle direct value
  if (directValue !== undefined) {
    if (typeof directValue !== 'string') {
      throw new Error(`${fieldName} must be a string, got ${typeof directValue}`);
    }
    return directValue;
  }

  // No value provided
  if (required) {
    throw new Error(`Missing required field: '${fieldName}'. Provide one of: ${fieldName}, ${fieldName}_base64${allowFile ? `, ${fieldName}_file` : ''}`);
  }

  return '';
}

/**
 * Async version of resolveStringField for use in async contexts.
 * Currently uses sync file reading, but structured for future async file operations.
 */
export async function resolveStringFieldAsync(
  obj: Record<string, unknown>,
  fieldName: string,
  options: ResolveStringFieldOptions
): Promise<string> {
  // For now, just call the sync version
  // In the future, this could use fs.promises.readFile for true async
  return resolveStringField(obj, fieldName, options);
}
