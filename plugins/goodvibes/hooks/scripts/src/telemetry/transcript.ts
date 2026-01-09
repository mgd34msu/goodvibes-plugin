/**
 * Transcript Parsing
 *
 * Provides transcript parsing, keyword extraction, and content analysis.
 */

import * as fs from 'fs/promises';

import { debug, logError, fileExists } from '../shared/index.js';
import {
  TRANSCRIPT_KEYWORD_CATEGORIES,
  extractTranscriptKeywords,
} from '../shared/keywords.js';

// ============================================================================
// Constants
// ============================================================================

/** Maximum length for truncated output text. */
export const MAX_OUTPUT_LENGTH = 500;

/** Regex patterns for detecting tool usage in plain text lines. */
const TOOL_PATTERNS = [
  /using\s+(\w+)\s+tool/i,
  /calling\s+(\w+)/i,
  /<tool_use\s+name="(\w+)"/i,
  /invoke\s+name="(\w+)"/i,
] as const;

// ============================================================================
// Types
// ============================================================================

/** Parsed transcript data extracted from session logs. */
export interface ParsedTranscript {
  files_modified: string[];
  tools_used: string[];
  final_output?: string;
  error_count: number;
  success_indicators: string[];
}

// ============================================================================
// Keyword Categories (Re-export from consolidated module)
// ============================================================================

/**
 * Keyword categories for classifying agent tasks and transcript content.
 * Re-exported from the consolidated keywords module for backwards compatibility.
 */
export const KEYWORD_CATEGORIES = TRANSCRIPT_KEYWORD_CATEGORIES;

// ============================================================================
// Transcript Parsing
// ============================================================================

/**
 * Parses a transcript file to extract useful information.
 * Handles both JSON and plain text formats.
 *
 * @param transcriptPath - Path to the transcript file
 * @returns Promise resolving to ParsedTranscript with extracted data
 *
 * @example
 * const transcript = await parseTranscript('/path/to/transcript.jsonl');
 * console.log(`Modified ${transcript.files_modified.length} files`);
 */
export async function parseTranscript(
  transcriptPath: string
): Promise<ParsedTranscript> {
  const result: ParsedTranscript = {
    files_modified: [],
    tools_used: [],
    error_count: 0,
    success_indicators: [],
  };

  if (!transcriptPath || !(await fileExists(transcriptPath))) {
    debug('Transcript file not found: ' + transcriptPath);
    return result;
  }

  try {
    const content = await fs.readFile(transcriptPath, 'utf-8');

    // Try to parse as JSONL (each line is a JSON object)
    const lines = content.split('\n').filter((line) => line.trim());

    for (const line of lines) {
      try {
        const entry: unknown = JSON.parse(line);
        if (typeof entry === 'object' && entry !== null) {
          processTranscriptEntry(entry as Record<string, unknown>, result);
        }
      } catch {
        // Not JSON, try to parse as plain text
        debug('Line not JSON, parsing as plain text');
        processPlainTextLine(line, result);
      }
    }

    // Extract final output (last assistant message)
    const lastOutput = extractLastOutput(content);
    if (lastOutput) {
      result.final_output = lastOutput;
    }
  } catch (error: unknown) {
    logError('parseTranscript', error);
  }

  // Deduplicate arrays
  result.files_modified = [...new Set(result.files_modified)];
  result.tools_used = [...new Set(result.tools_used)];
  result.success_indicators = [...new Set(result.success_indicators)];

  return result;
}

/**
 * Processes a single transcript entry (JSON format).
 * Extracts tool usage, errors, and success indicators.
 *
 * @param entry - The parsed JSON entry object
 * @param result - The ParsedTranscript to populate
 */
function processTranscriptEntry(
  entry: Record<string, unknown>,
  result: ParsedTranscript
): void {
  processToolUsage(entry, result);
  processErrors(entry, result);
  processSuccessIndicators(entry, result);
}

/**
 * Extracts and processes tool usage from a transcript entry.
 * Identifies tool calls and tracks file modifications.
 *
 * @param entry - The transcript entry to process
 * @param result - The ParsedTranscript to populate
 */
function processToolUsage(
  entry: Record<string, unknown>,
  result: ParsedTranscript
): void {
  const isToolUse = entry.type === 'tool_use' || Boolean(entry.tool_name ?? entry.name);
  if (!isToolUse) {
    return;
  }

  const toolName = (entry.tool_name ?? entry.name) as string;
  if (!toolName) {
    return;
  }

  result.tools_used.push(toolName);

  // Check for file modifications
  const isFileModificationTool =
    toolName === 'Write' ||
    toolName === 'Edit' ||
    toolName === 'write_file' ||
    toolName === 'edit_file';

  if (isFileModificationTool) {
    const filePath = extractFilePathFromEntry(entry);
    if (filePath) {
      result.files_modified.push(filePath);
    }
  }
}

/**
 * Extracts file path from a tool entry.
 * Checks common parameter names for file paths.
 *
 * @param entry - The tool entry to extract from
 * @returns File path string, or null if not found
 */
function extractFilePathFromEntry(
  entry: Record<string, unknown>
): string | null {
  const input = entry.tool_input ?? entry.input ?? entry.parameters;
  if (!input || typeof input !== 'object') {
    return null;
  }

  const inputObj = input as Record<string, unknown>;
  const filePath = inputObj.file_path ?? inputObj.path ?? inputObj.file;

  return typeof filePath === 'string' ? filePath : null;
}

/**
 * Processes error indicators from a transcript entry.
 * Increments error count when errors are detected.
 *
 * @param entry - The transcript entry to check
 * @param result - The ParsedTranscript to update
 */
function processErrors(
  entry: Record<string, unknown>,
  result: ParsedTranscript
): void {
  if (entry.type === 'error' || entry.error) {
    result.error_count++;
  }
}

/**
 * Processes success indicators from a transcript entry.
 * Looks for keywords like 'successfully', 'completed', 'done'.
 *
 * @param entry - The transcript entry to check
 * @param result - The ParsedTranscript to update
 */
function processSuccessIndicators(
  entry: Record<string, unknown>,
  result: ParsedTranscript
): void {
  const text = String(
    entry.content ?? entry.text ?? entry.message ?? ''
  ).toLowerCase();
  const hasSuccessIndicator =
    text.includes('successfully') ||
    text.includes('completed') ||
    text.includes('done');

  if (hasSuccessIndicator) {
    result.success_indicators.push(text.substring(0, 100));
  }
}

/**
 * Processes a plain text line from transcript.
 * Extracts tool usage, file modifications, and errors from non-JSON content.
 *
 * @param line - The plain text line to process
 * @param result - The ParsedTranscript to update
 */
function processPlainTextLine(line: string, result: ParsedTranscript): void {
  const lowerLine = line.toLowerCase();

  // Look for tool usage patterns
  for (const pattern of TOOL_PATTERNS) {
    const match = line.match(pattern);
    if (match) {
      result.tools_used.push(match[1]);
    }
  }

  // Look for file paths being modified
  const filePatterns = [
    /(?:writing|editing|creating|modifying)\s+["']?([^\s"']+\.[a-z]{1,4})["']?/i,
    /file[_\s]path["']?\s*[:=]\s*["']([^"']+)["']/i,
  ];

  for (const pattern of filePatterns) {
    const match = line.match(pattern);
    if (match) {
      result.files_modified.push(match[1]);
    }
  }

  // Count errors
  if (
    lowerLine.includes('error:') ||
    lowerLine.includes('failed:') ||
    lowerLine.includes('exception')
  ) {
    result.error_count++;
  }
}

/**
 * Extracts the last assistant output from transcript.
 * Searches for the final assistant message in various formats.
 *
 * @param content - The full transcript content
 * @returns Last output text (truncated to MAX_OUTPUT_LENGTH), or undefined
 */
function extractLastOutput(content: string): string | undefined {
  // Try to find the last assistant message in various formats
  const patterns = [
    /"role"\s*:\s*"assistant"[^}]*"content"\s*:\s*"([^"]+)"/g,
    /Assistant:\s*(.+?)(?=\n\n|Human:|$)/gs,
  ];

  let lastOutput: string | undefined;

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      lastOutput = match[1];
    }
  }

  // Truncate if too long
  if (lastOutput && lastOutput.length > MAX_OUTPUT_LENGTH) {
    lastOutput = lastOutput.substring(0, MAX_OUTPUT_LENGTH) + '...';
  }

  return lastOutput;
}

// ============================================================================
// Keyword Extraction
// ============================================================================

/**
 * Extracts keywords from task description and transcript content.
 * Delegates to the consolidated keywords module.
 *
 * @param taskDescription - Optional task description to extract keywords from
 * @param transcriptContent - Optional transcript content to scan
 * @param agentType - Optional agent type for categorization
 * @returns Array of extracted keyword strings
 *
 * @example
 * const keywords = extractKeywords('Build authentication API', content, 'backend-engineer');
 * // Returns: ['backend', 'api', 'authentication', ...]
 */
export function extractKeywords(
  taskDescription?: string,
  transcriptContent?: string,
  agentType?: string
): string[] {
  return extractTranscriptKeywords(
    taskDescription,
    transcriptContent,
    agentType
  );
}
