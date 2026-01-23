/**
 * precision_grep handler - Token-efficient search with precise output control
 * SPEC-v2 Section 13.1.1
 *
 * Features:
 * - Batch multiple queries
 * - Output modes: count_only, files_only, locations, matches, context
 * - Context expansion: line, block, function, class
 * - Max caps for files, matches, tokens
 * - Parallel query execution
 */

import fg from 'fast-glob';
import * as fs from 'fs/promises';
import * as path from 'path';
import { startTimer } from '../logging.js';
import type { OutputMode } from '../types.js';
import { successResult, errorResult, parseOutputMode, toCallToolResult, ToolHandler } from '../utils/index.js';
import { DEFAULT_EXCLUDES } from '../config.js';

// === Interfaces per SPEC-v2 ===

type GrepOutputMode = 'count_only' | 'files_only' | 'locations' | 'matches' | 'context';
type ExpandTo = 'line' | 'block' | 'function' | 'class';

interface GrepQuery {
  id: string;
  pattern?: string;
  pattern_base64?: string;
  glob?: string;
  path?: string;
  exclude?: string[];
  case_sensitive?: boolean;
  whole_word?: boolean;
  multiline?: boolean;
  include_binary?: boolean;
}

interface GrepOutput {
  mode: GrepOutputMode;
  context_before?: number;
  context_after?: number;
  expand_to?: ExpandTo;
  max_files?: number;
  max_matches_per_file?: number;
  max_total_matches?: number;
  max_tokens?: number;
  max_line_length?: number;
}

interface PrecisionGrepInput {
  queries: GrepQuery[];
  output: GrepOutput;
  parallel?: boolean;
  output_mode?: OutputMode;
}

interface GrepMatch {
  line: number;
  column?: number;
  content?: string;
  before?: string[];
  after?: string[];
  highlight?: [number, number];
}

interface GrepFileResult {
  file: string;
  matches?: GrepMatch[];
  match_count?: number;
}

interface GrepResult {
  files?: GrepFileResult[];
  file_count?: number;
  match_count?: number;
  truncated?: boolean;
  lines_truncated?: number;
  note?: string;
}

// === Helper Functions ===

function decodePattern(query: GrepQuery): string {
  if (query.pattern && query.pattern_base64) {
    throw new Error("Cannot specify both 'pattern' and 'pattern_base64'. Use one or the other.");
  }
  if (query.pattern_base64) {
    try {
      return Buffer.from(query.pattern_base64, 'base64').toString('utf-8');
    } catch (e) {
      throw new Error(`Invalid base64 in pattern_base64: ${(e as Error).message}`);
    }
  }
  if (!query.pattern) {
    throw new Error("Either 'pattern' or 'pattern_base64' is required.");
  }
  return query.pattern;
}

function estimateTokens(str: string): number {
  // Rough estimate: ~4 chars per token
  return Math.ceil(str.length / 4);
}

function truncateLine(line: string, maxLength: number | undefined): string {
  if (!maxLength || line.length <= maxLength) {
    return line;
  }
  return line.substring(0, maxLength) + '... [truncated]';
}

function isBinaryContent(buffer: Buffer): boolean {
  // Check for null bytes in first 8KB - indicates binary
  const checkLength = Math.min(buffer.length, 8192);
  for (let i = 0; i < checkLength; i++) {
    if (buffer[i] === 0) {
      return true;
    }
  }
  return false;
}

function expandToBlock(lines: string[], lineIndex: number): { start: number; end: number } {
  // Find block boundaries (empty lines or significant indentation changes)
  let start = lineIndex;
  let end = lineIndex;

  // Search backward for block start
  while (start > 0) {
    const line = lines[start - 1];
    if (line.trim() === '' || (line.length > 0 && line[0] !== ' ' && line[0] !== '\t')) {
      break;
    }
    start--;
  }

  // Search forward for block end
  while (end < lines.length - 1) {
    const line = lines[end + 1];
    if (line.trim() === '') {
      break;
    }
    end++;
  }

  return { start, end };
}

function expandToFunction(lines: string[], lineIndex: number): { start: number; end: number } {
  // Find function boundaries using common patterns
  let start = lineIndex;
  let end = lineIndex;

  // Search backward for function declaration
  const funcPattern = /^[\s]*(export\s+)?(async\s+)?function\s+\w+|^[\s]*(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?\(|^[\s]*\w+\s*\([^)]*\)\s*{|^[\s]*(public|private|protected)?\s*(async\s+)?\w+\s*\(/;

  while (start > 0) {
    if (funcPattern.test(lines[start])) {
      break;
    }
    start--;
  }

  // Search forward for matching closing brace
  let braceCount = 0;
  let foundOpen = false;

  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    for (const char of line) {
      if (char === '{') {
        braceCount++;
        foundOpen = true;
      } else if (char === '}') {
        braceCount--;
        if (foundOpen && braceCount === 0) {
          end = i;
          return { start, end };
        }
      }
    }
  }

  return { start, end: Math.min(lineIndex + 20, lines.length - 1) };
}

function expandToClass(lines: string[], lineIndex: number): { start: number; end: number } {
  // Find class boundaries
  let start = lineIndex;
  let end = lineIndex;

  // Search backward for class declaration
  const classPattern = /^[\s]*(export\s+)?(abstract\s+)?class\s+\w+|^[\s]*interface\s+\w+|^[\s]*type\s+\w+\s*=/;

  while (start > 0) {
    if (classPattern.test(lines[start])) {
      break;
    }
    start--;
  }

  // Search forward for matching closing brace
  let braceCount = 0;
  let foundOpen = false;

  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    for (const char of line) {
      if (char === '{') {
        braceCount++;
        foundOpen = true;
      } else if (char === '}') {
        braceCount--;
        if (foundOpen && braceCount === 0) {
          end = i;
          return { start, end };
        }
      }
    }
  }

  return { start, end: Math.min(lineIndex + 50, lines.length - 1) };
}

async function executeQuery(
  query: GrepQuery,
  output: GrepOutput,
  workDir: string
): Promise<GrepResult> {
  const maxFiles = output.max_files ?? 100;
  const maxMatchesPerFile = output.max_matches_per_file ?? 10;
  const maxTotalMatches = output.max_total_matches ?? 100;
  const maxTokens = output.max_tokens ?? Infinity;
  const contextBefore = output.context_before ?? 0;
  const contextAfter = output.context_after ?? 0;
  const includeBinary = query.include_binary ?? false;

  // Build regex with multiline support
  let patternStr = decodePattern(query);
  if (query.whole_word) {
    patternStr = `\\b${patternStr}\\b`;
  }
  let flags = query.case_sensitive === false ? 'gi' : 'g';
  if (query.multiline) {
    flags += 'm'; // Add multiline flag
  }
  const regex = new RegExp(patternStr, flags);

  // Get files
  const searchPath = query.path ? path.resolve(workDir, query.path) : workDir;
  const globPattern = query.glob ?? '**/*';
  const excludePatterns = [...DEFAULT_EXCLUDES, ...(query.exclude ?? [])];

  const files = await fg(globPattern, {
    cwd: searchPath,
    ignore: excludePatterns,
    absolute: true,
    onlyFiles: true,
  });

  const results: GrepFileResult[] = [];
  let totalMatches = 0;
  let totalTokens = 0;
  let truncated = false;
  let linesTruncated = 0;

  for (const filePath of files) {
    if (results.length >= maxFiles || totalMatches >= maxTotalMatches || totalTokens >= maxTokens) {
      truncated = true;
      break;
    }

    try {
      // Read file as buffer first to check for binary content
      const buffer = await fs.readFile(filePath);

      // Skip binary files unless include_binary is true
      if (!includeBinary && isBinaryContent(buffer)) {
        continue;
      }

      const content = buffer.toString('utf-8');
      const lines = content.split('\n');
      const relativePath = path.relative(workDir, filePath);

      const fileMatches: GrepMatch[] = [];
      let fileMatchCount = 0;

      for (let i = 0; i < lines.length; i++) {
        if (fileMatchCount >= maxMatchesPerFile || totalMatches >= maxTotalMatches || totalTokens >= maxTokens) {
          truncated = true;
          break;
        }

        const line = lines[i];
        regex.lastIndex = 0;

        let match: RegExpExecArray | null;
        while ((match = regex.exec(line)) !== null) {
          if (fileMatchCount >= maxMatchesPerFile || totalMatches >= maxTotalMatches || totalTokens >= maxTokens) {
            truncated = true;
            break;
          }

          totalMatches++;
          fileMatchCount++;

          const grepMatch: GrepMatch = {
            line: i + 1,
          };

          // Add column for locations mode and above
          if (output.mode !== 'count_only' && output.mode !== 'files_only') {
            grepMatch.column = match.index + 1;
          }

          // Add content and highlight for matches mode and above
          if (output.mode === 'matches' || output.mode === 'context') {
            const originalLine = line;
            grepMatch.content = truncateLine(line, output.max_line_length);
            if (grepMatch.content !== originalLine) {
              linesTruncated++;
            }
            // highlight: [start, end] position of match within content
            grepMatch.highlight = [match.index, match.index + match[0].length];
            totalTokens += estimateTokens(grepMatch.content);
          }

          // Add context for context mode
          if (output.mode === 'context') {
            let start: number, end: number;

            if (output.expand_to) {
              switch (output.expand_to) {
                case 'block':
                  ({ start, end } = expandToBlock(lines, i));
                  break;
                case 'function':
                  ({ start, end } = expandToFunction(lines, i));
                  break;
                case 'class':
                  ({ start, end } = expandToClass(lines, i));
                  break;
                default:
                  start = Math.max(0, i - contextBefore);
                  end = Math.min(lines.length - 1, i + contextAfter);
              }
            } else {
              start = Math.max(0, i - contextBefore);
              end = Math.min(lines.length - 1, i + contextAfter);
            }

            if (start < i) {
              const beforeLines = lines.slice(start, i);
              grepMatch.before = beforeLines.map(l => {
                const truncated = truncateLine(l, output.max_line_length);
                if (truncated !== l) linesTruncated++;
                return truncated;
              });
              totalTokens += estimateTokens(grepMatch.before.join('\n'));
            }
            if (end > i) {
              const afterLines = lines.slice(i + 1, end + 1);
              grepMatch.after = afterLines.map(l => {
                const truncated = truncateLine(l, output.max_line_length);
                if (truncated !== l) linesTruncated++;
                return truncated;
              });
              totalTokens += estimateTokens(grepMatch.after.join('\n'));
            }
          }

          fileMatches.push(grepMatch);

          // Prevent infinite loop on zero-length matches
          if (match[0].length === 0) regex.lastIndex++;
        }
      }

      if (fileMatchCount > 0) {
        const fileResult: GrepFileResult = {
          file: relativePath,
        };

        if (output.mode !== 'count_only' && output.mode !== 'files_only') {
          fileResult.matches = fileMatches;
        }

        fileResult.match_count = fileMatchCount;
        results.push(fileResult);
      }
    } catch {
      // Skip unreadable files
    }
  }

  // Build result based on output mode
  const result: GrepResult = {
    truncated,
  };

  switch (output.mode) {
    case 'count_only':
      result.file_count = results.length;
      result.match_count = totalMatches;
      break;
    case 'files_only':
      result.files = results.map(r => ({ file: r.file, match_count: r.match_count }));
      result.file_count = results.length;
      result.match_count = totalMatches;
      break;
    default:
      result.files = results;
      result.file_count = results.length;
      result.match_count = totalMatches;
  }

  // Add truncation info if lines were truncated
  if (linesTruncated > 0) {
    result.lines_truncated = linesTruncated;
    result.note = `${linesTruncated} lines truncated to ${output.max_line_length} chars. Use max_line_length: null for full content.`;
  }

  return result;
}

// === Main Handler ===

export const handlePrecisionGrep: ToolHandler = async (args: unknown) => {
  const getElapsed = startTimer();
  const input = args as PrecisionGrepInput;
  const outputMode = parseOutputMode(args, "precision_grep");
  const workDir = process.cwd();

  try {
    // Validate input
    if (!input.queries || !Array.isArray(input.queries) || input.queries.length === 0) {
      return toCallToolResult(createErrorResult(formatMissingParamError('precision_grep', 'queries', 'array of search queries'), { output_mode: outputMode, execution_ms: getElapsed() }));
    }

    // Apply defaults per schema (handlers must apply defaults, not just define them in schema)
    const output: GrepOutput = {
      mode: input.output?.mode ?? 'files_only',
      context_before: input.output?.context_before ?? 0,
      context_after: input.output?.context_after ?? 0,
      max_files: input.output?.max_files ?? 100,
      max_matches_per_file: input.output?.max_matches_per_file ?? 10,
      max_total_matches: input.output?.max_total_matches ?? 100,
      ...input.output
    };

    // Validate each query
    for (const query of input.queries) {
      if (!query.id) {
        return toCallToolResult(createErrorResult(formatMissingParamError('precision_grep', 'queries[].id', 'string identifier for each query'), { output_mode: outputMode, execution_ms: getElapsed() }));
      }
      if (!query.pattern && !query.pattern_base64) {
        return toCallToolResult(createErrorResult(formatMissingParamError('precision_grep', 'queries[].pattern', 'search pattern (string or base64)'), { output_mode: outputMode, execution_ms: getElapsed() }));
      }
    }

    // Execute queries
    const parallel = input.parallel ?? true;
    const queryResults: { [id: string]: GrepResult } = {};

    if (parallel) {
      const results = await Promise.all(
        input.queries.map(q => executeQuery(q, output, workDir))
      );
      input.queries.forEach((q, i) => {
        queryResults[q.id] = results[i];
      });
    } else {
      for (const query of input.queries) {
        queryResults[query.id] = await executeQuery(query, output, workDir);
      }
    }

    // Build summary
    let totalFiles = 0;
    let totalMatches = 0;
    let anyTruncated = false;

    for (const result of Object.values(queryResults)) {
      totalFiles += result.file_count ?? 0;
      totalMatches += result.match_count ?? 0;
      if (result.truncated) anyTruncated = true;
    }

    const data = {
      queries: queryResults,
      summary: {
        total_files: totalFiles,
        total_matches: totalMatches,
        truncated: anyTruncated,
      },
      tokens_used: estimateTokens(JSON.stringify(queryResults)),
    };

    return toCallToolResult(successResult(data, outputMode, getElapsed()));
  } catch (error) {
    return toCallToolResult(errorResult((error as Error).message, outputMode, getElapsed()));
  }
};
