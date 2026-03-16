/**
 * Utility functions for precision-engine.
 */

import { readFileSync } from 'fs';
import { resolve as resolvePath } from 'path';
import { CallToolResult, TextContent, ImageContent } from '@modelcontextprotocol/sdk/types.js';
import { OutputMode, PrecisionResult } from '../types.js';
import { getToolVerbosityDefault } from '../runtime-config.js';
import { estimateTokens } from '../logging.js';
import { formatMutualExclusivityError } from './errors.js';
import { warnDeprecatedParam } from './deprecation.js';

/**
 * Handler function type for precision-engine MCP tools.
 * Takes unknown args (validated internally) and returns an MCP CallToolResult.
 */
export type ToolHandler = (args: unknown) => Promise<CallToolResult>;

/**
 * Convert a PrecisionResult to MCP CallToolResult format.
 * @param result - The precision result to convert
 * @returns MCP CallToolResult with JSON-serialized result
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

/**
 * Convert a PrecisionResult to MCP CallToolResult with additional content blocks.
 * Used when response includes image data alongside JSON metadata.
 * @param result - The precision result to convert
 * @param extraContent - Additional content blocks (images, etc.) to include
 * @returns MCP CallToolResult with JSON result plus extra content blocks
 */
export function toMixedCallToolResult<T>(
  result: PrecisionResult<T>,
  extraContent: (TextContent | ImageContent)[]
): CallToolResult {
  const textBlock: TextContent = {
    type: 'text',
    text: JSON.stringify(result, null, 2),
  };

  return {
    content: [textBlock, ...extraContent],
    isError: !result.success,
  };
}

/**
 * Create a successful precision result.
 * @param data - The result data payload
 * @param outputMode - The output mode used for this result
 * @param executionMs - Execution time in milliseconds
 * @returns A successful PrecisionResult with metadata
 */
export function successResult<T>(
  data: T,
  outputMode: OutputMode,
  executionMs: number
): PrecisionResult<T> {
  const jsonStr = JSON.stringify(data);
  const baseTokens = estimateTokens(jsonStr);

  return {
    success: true,
    data,
    meta: {
      output_mode: outputMode,
      token_estimate: baseTokens,
      execution_ms: executionMs,
    },
  };
}

/**
 * Create an error precision result.
 * @param error - The error message
 * @param outputMode - The output mode used for this result
 * @param executionMs - Execution time in milliseconds
 * @returns A failed PrecisionResult with error message and metadata
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
 * Standard defaults for most precision tools.
 * These apply unless overridden by tool-specific defaults or user arguments.
 */
export const STANDARD_DEFAULTS = {
  verbosity: 'standard' as OutputMode,
  extract: 'content' as const,
};

/**
 * Tool-specific defaults that override standard defaults.
 * Keys are tool names, values are default parameters for that tool.
 */
export const TOOL_SPECIFIC_DEFAULTS: Record<string, { verbosity?: OutputMode }> = {
  discover: { verbosity: 'files_only' },
  precision_symbols: { verbosity: 'signatures' },
  precision_edit: { verbosity: 'minimal' },     // was 'with_diff' — saves 1K-30K tokens per edit
  precision_write: { verbosity: 'minimal' },     // NEW — agent knows what it wrote
  precision_glob: { verbosity: 'paths_only' },
  precision_grep: { verbosity: 'files_only' },
};

/**
 * Merge defaults into input, with input values taking precedence.
 * Renamed from applyDefaults for clarity — distinct from ModeManager.applyDefaults()
 * which has different semantics (class method with per-tool dispatch logic).
 *
 * @public Generic utility for handlers and future external consumers.
 * @template T - The input type (must be a record)
 * @param input - The input object to apply defaults to
 * @param defaults - The defaults to apply (will not override existing values)
 * @returns Input with defaults merged (input values win)
 */
export function mergeDefaults<T extends Record<string, unknown>>(
  input: T,
  defaults: Partial<T>
): T {
  return { ...defaults, ...input };
}

/**
 * Valid output modes accepted by all precision tools.
 * Used for validating verbosity and output_mode parameters.
 */
const VALID_OUTPUT_MODES = new Set<OutputMode>([
  'count_only', 'exit_codes', 'minimal', 'standard', 'with_preview', 'verbose',
  'paths_only', 'files_only', 'with_diff', 'signatures', 'locations', 'matches', 'context', 'names_only'
]);

/**
 * Valid output format modes for nested output.format parameter.
 * Subset of VALID_OUTPUT_MODES for SPEC-v2 structured output.
 */
const VALID_FORMAT_MODES = new Set<OutputMode>([
  'count_only', 'exit_codes', 'minimal', 'standard', 'with_preview', 'verbose'
]);

/**
 * Parse output mode from arguments, with optional tool-specific defaults.
 * Supports both new (verbosity) and deprecated (output_mode) parameter names.
 * @param args - The arguments object containing verbosity or output_mode (deprecated)
 * @param toolName - Optional tool name for tool-specific defaults
 * @returns The output mode to use
 */
export function parseOutputMode(args: unknown, toolName?: string): OutputMode {
  // Check for new 'verbosity' parameter first
  if (
    typeof args === 'object' &&
    args !== null &&
    'verbosity' in args &&
    typeof (args as Record<string, unknown>).verbosity === 'string'
  ) {
    const mode = (args as Record<string, unknown>).verbosity as string;
    if (VALID_OUTPUT_MODES.has(mode as OutputMode)) {
      return mode as OutputMode;
    }
  }

  // Check for deprecated 'output_mode' parameter (backward compatibility)
  if (
    typeof args === 'object' &&
    args !== null &&
    'output_mode' in args &&
    typeof (args as Record<string, unknown>).output_mode === 'string'
  ) {
    warnDeprecatedParam('output_mode', 'verbosity', toolName ?? 'unknown');
    const mode = (args as Record<string, unknown>).output_mode as string;
    if (VALID_OUTPUT_MODES.has(mode as OutputMode)) {
      return mode as OutputMode;
    }
  }

  // Check for output.format nested structure (SPEC-v2 format)
  if (
    typeof args === 'object' &&
    args !== null &&
    'output' in args &&
    typeof (args as Record<string, unknown>).output === 'object' &&
    (args as Record<string, unknown>).output !== null
  ) {
    const output = (args as Record<string, { format?: string; mode?: string }>).output;

    // Check for new 'format' property first
    if (output.format && VALID_FORMAT_MODES.has(output.format as OutputMode)) {
      return output.format as OutputMode;
    }

    // Check for deprecated 'mode' property (backward compatibility)
    if (output.mode) {
      warnDeprecatedParam('output.mode', 'output.format', toolName ?? 'unknown');
      if (VALID_FORMAT_MODES.has(output.mode as OutputMode)) {
        return output.mode as OutputMode;
      }
    }
  }

  // Check goodvibes.json per-tool verbosity default
  if (toolName) {
    const configDefault = getToolVerbosityDefault(toolName);
    if (configDefault && VALID_OUTPUT_MODES.has(configDefault as OutputMode)) {
      return configDefault as OutputMode;
    }
  }

  // Apply tool-specific default if provided
  if (toolName && TOOL_SPECIFIC_DEFAULTS[toolName]?.verbosity) {
    return TOOL_SPECIFIC_DEFAULTS[toolName].verbosity;
  }

  // Fall back to standard default
  return STANDARD_DEFAULTS.verbosity;
}

/**
 * Normalize a file path for consistent handling.
 * Converts backslashes to forward slashes and removes trailing slashes.
 * @param filePath - The file path to normalize
 * @returns Normalized file path
 */
export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * Extract lines from content with offset and limit.
 * @param content - The content to extract lines from
 * @param offset - Starting line index (0-based, defaults to 0)
 * @param limit - Maximum number of lines to extract (optional)
 * @returns Object with extracted lines, total line count, and truncation flag
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
 * Set of file extensions that should be treated as text files.
 * Used by isTextFile() for fast lookup without repeated Set construction.
 */
const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.yaml', '.yml', '.toml', '.xml',
  '.md', '.mdx', '.txt', '.rst',
  '.html', '.css', '.scss', '.sass', '.less',
  '.py', '.rb', '.go', '.rs', '.java', '.kt',
  '.c', '.cpp', '.h', '.hpp', '.sh', '.sql',
]);

/**
 * Check if a file extension is a text file.
 * @param filePath - The file path to check
 * @returns True if the file extension indicates a text file, false otherwise
 */
export function isTextFile(filePath: string): boolean {
  const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
  return TEXT_EXTENSIONS.has(ext);
}

// Export error formatting utilities
export * from './errors.js';

// Export deprecation warning utilities
export * from './deprecation.js';

// === String Field Resolution Utilities ===

/**
 * Options for resolving string fields from multiple sources (direct, base64, or file).
 * Used by resolveStringField() to handle field value resolution.
 */
export interface ResolveStringFieldOptions {
  /** Allow resolution from file path (fieldName_file parameter). */
  allowFile?: boolean;
  /** Base directory for relative file path resolution. */
  basePath?: string;
  /** Whether the field is required (throw if missing). */
  required?: boolean;
  /** The base field name being resolved. */
  fieldName: string;
}

/**
 * Resolve a string field that can be provided as:
 * - Direct value: { fieldName: "value" }
 * - Base64-encoded: { fieldName_base64: "base64string" }
 * - File path: { fieldName_file: "/path/to/file.txt" }
 *
 * Ensures mutual exclusivity and handles all three sources.
 * @param obj - The object containing the field
 * @param fieldName - The base field name to resolve
 * @param options - Resolution options (file support, base path, required flag)
 * @returns The resolved string value
 * @throws Error if multiple sources provided or if required field is missing
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
 * @param obj - The object containing the field
 * @param fieldName - The base field name to resolve
 * @param options - Resolution options (file support, base path, required flag)
 * @returns Promise resolving to the resolved string value
 * @throws Error if multiple sources provided or if required field is missing
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

/**
 * Parse a field that might be a JSON string (from Claude Code) into its actual type.
 * @template T - The expected type of the parsed value
 * @param value - The value to parse (may already be the correct type or a JSON string)
 * @returns The parsed value or the original value if parsing fails
 */
export function parseJsonField<T>(value: T | string): T {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  }
  return value;
}

/**
 * Ensure a value is an array. Handles MCP serialization edge cases:
 * - If string, JSON.parse it
 * - If object with numeric keys (MCP array-as-object), convert to array
 * - If single object with at least one known spec key, wrap in array
 *   (handles common LLM mistake: files: {path, content} instead of files: [{path, content}])
 * - If already an array, return as-is
 * - Otherwise return null
 * @template T - The expected element type
 * @param value - The value to normalize to an array
 * @returns The value as an array, or null if it cannot be converted
 */
export function ensureArray<T>(value: unknown): T[] | null {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed as T[];
      // Parsed but not array — fall through to object check
      value = parsed;
    } catch { return null; }
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length > 0 && keys.every(k => /^\d+$/.test(k))) {
      return keys.sort((a, b) => Number(a) - Number(b)).map(k => (value as Record<string, unknown>)[k]) as T[];
    }
    // Single object passed instead of array — wrap it if it looks like a valid spec item
    // Handles common LLM mistake: files: {path, content} instead of files: [{path, content}]
    const KNOWN_SPEC_KEYS = new Set(['path', 'file', 'cmd', 'url', 'id', 'pattern', 'query', 'op', 'source']);
    if (keys.some(k => KNOWN_SPEC_KEYS.has(k))) {
      return [value] as T[];
    }
  }
  return null;
}

// Export fuzzy matching utilities
export { levenshteinDistance, calculateSimilarity, rankBySimilarity } from './fuzzy.js';

// Export path validation utilities
export { validateDirectoryPath, validateFilePath } from './path-validation.js';

// Export file type detection and context intelligence
export { detectFileType, type FileTypeInfo } from './file-type-detection.js';
export { getContextForFile, resetContextTracking, type ContextMetadata } from './context-intelligence.js';

// Export lock/error pattern detection utilities
export { detectIssue, isRetryable, type DetectedIssue, type IssueType } from './lock-detection.js';

// Export exit code interpretation utilities
export { interpretExitCode, type ExitInterpretation } from './exit-codes.js';

// Export overflow handling utilities
export { handleOverflow, cleanupOverflowFiles, type OverflowResult } from './overflow-handler.js';

// Export retry engine utilities
export { parseRetryConfig, shouldRetry, computeDelay, RETRY_CATEGORY_MAP, type RetryConfig, type RetryResult, type RetryCategory } from './retry-engine.js';

// Export progress reporting utilities
export { createProgressCollector, type ProgressMilestone, type ProgressConfig, type ProgressCollector } from './progress-collector.js';

// Export structured data extraction utilities (for precision_fetch)
export { extractStructuredData, type StructuredData } from './fetch/structured-data.js';

// Export grep negation utilities
export { findFilesWithoutPattern, type NegationResult, type NegationOptions } from './grep-negation.js';

// Export grep replace preview utilities
export { generateReplacePreview, type ReplacePreviewMatch, type ReplacePreviewResult } from './grep-replace-preview.js';

// Export grep pagination utilities
export { applyPagination, type PaginationParams, type PaginationMetadata } from './grep-pagination.js';

// Export grep relationship utilities
export { findRelatedFiles, type RelatedFile, type RelationshipResult } from './grep-relationships.js';

// Export grep ranking utilities
export { rankResults, type RankedFile } from './grep-ranking.js';

// Export grep statistics utilities
export { computeStats, type GrepStatsSummary, type DirectoryStats, type GrepFileData } from './grep-stats.js';

// Export safe-overwrite utilities
export { performSafeOverwrite, checkGitStatus, generateBackupPath as generateSafeBackupPath, createBackup, type SafeOverwriteResult, type GitStatus } from './safe-overwrite.js';
