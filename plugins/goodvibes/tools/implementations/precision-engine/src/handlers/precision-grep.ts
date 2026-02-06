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

import * as fs from 'fs/promises';
import * as path from 'path';
import { startTimer } from '../logging.js';
import type { OutputMode } from '../types.js';
import { successResult, errorResult, parseOutputMode, toCallToolResult, ToolHandler, resolveStringField, parseJsonField } from '../utils/index.js';
import { createErrorResult, formatMissingParamError } from '../utils/errors.js';
import { DEFAULT_EXCLUDES } from '../config.js';
import { RipgrepCore, RipgrepSearchResult } from '../core/ripgrep.js';
import { TreeSitterCore } from '../core/tree-sitter.js';
import { validateDirectoryPath } from '../utils/path-validation.js';

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
  // Standardized names (preferred)
  max_results?: number;
  max_per_item?: number;
  // Deprecated names (backward compatibility)
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

// === Singleton Instances ===

const ripgrepCore = new RipgrepCore();
const treeSitterCore = new TreeSitterCore();

// === Helper Functions ===


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

/**
 * Transform RipgrepSearchResult to GrepResult format with expand_to support
 */
async function transformRipgrepResult(
  ripgrepResult: RipgrepSearchResult,
  output: GrepOutput,
  workDir: string,
  maxFiles: number,
  maxTotalMatches: number,
  maxTokens: number
): Promise<GrepResult> {
  const fileMap = new Map<string, GrepFileResult>();
  let totalMatches = 0;
  let totalTokens = 0;
  let truncated = ripgrepResult.truncated;
  let linesTruncated = 0;

  // Group matches by file
  for (const match of ripgrepResult.matches) {
    if (fileMap.size >= maxFiles || totalMatches >= maxTotalMatches || totalTokens >= maxTokens) {
      truncated = true;
      break;
    }

    const relativePath = path.relative(workDir, match.file);
    let fileResult = fileMap.get(relativePath);

    if (!fileResult) {
      fileResult = {
        file: relativePath,
        matches: [],
        match_count: 0,
      };
      fileMap.set(relativePath, fileResult);
    }

    totalMatches++;
    fileResult.match_count!++;

    const grepMatch: GrepMatch = {
      line: match.line,
    };

    // Add column for locations mode and above
    if (output.mode !== 'count_only' && output.mode !== 'files_only') {
      grepMatch.column = match.column;
    }

    // Add content and highlight for matches mode and above
    if (output.mode === 'matches' || output.mode === 'context') {
      const originalLine = match.lineContent;
      grepMatch.content = truncateLine(match.lineContent, output.max_line_length);
      if (grepMatch.content !== originalLine) {
        linesTruncated++;
      }

      // Calculate highlight position
      const matchStart = match.column - 1; // Convert to 0-indexed
      const matchEnd = matchStart + match.matchText.length;
      grepMatch.highlight = [matchStart, matchEnd];
      totalTokens += estimateTokens(grepMatch.content);
    }

    // Add context for context mode
    if (output.mode === 'context') {
      // Handle expand_to with tree-sitter for function/class
      if (output.expand_to === 'function' || output.expand_to === 'class') {
        try {
          const fileContent = await fs.readFile(path.join(workDir, relativePath), 'utf-8');
          const tree = await treeSitterCore.parse(fileContent, relativePath);
          const range = output.expand_to === 'function'
            ? treeSitterCore.getEnclosingFunction(tree, match.line)
            : treeSitterCore.getEnclosingClass(tree, match.line);

          if (range) {
            const lines = fileContent.split('\n');
            const start = range.start.line - 1; // Convert to 0-indexed
            const end = range.end.line - 1;
            const matchLineIndex = match.line - 1;

            if (start < matchLineIndex) {
              const beforeLines = lines.slice(start, matchLineIndex);
              grepMatch.before = beforeLines.map(l => {
                const truncated = truncateLine(l, output.max_line_length);
                if (truncated !== l) linesTruncated++;
                return truncated;
              });
              totalTokens += estimateTokens(grepMatch.before.join('\n'));
            }

            if (end > matchLineIndex) {
              const afterLines = lines.slice(matchLineIndex + 1, end + 1);
              grepMatch.after = afterLines.map(l => {
                const truncated = truncateLine(l, output.max_line_length);
                if (truncated !== l) linesTruncated++;
                return truncated;
              });
              totalTokens += estimateTokens(grepMatch.after.join('\n'));
            }
          }
        } catch {
          // Fall back to ripgrep context if tree-sitter fails
          if (match.contextBefore) {
            grepMatch.before = match.contextBefore.map(l => {
              const truncated = truncateLine(l, output.max_line_length);
              if (truncated !== l) linesTruncated++;
              return truncated;
            });
            totalTokens += estimateTokens(grepMatch.before.join('\n'));
          }
          if (match.contextAfter) {
            grepMatch.after = match.contextAfter.map(l => {
              const truncated = truncateLine(l, output.max_line_length);
              if (truncated !== l) linesTruncated++;
              return truncated;
            });
            totalTokens += estimateTokens(grepMatch.after.join('\n'));
          }
        }
      } else {
        // Use ripgrep context for line/block or no expand_to
        if (match.contextBefore) {
          grepMatch.before = match.contextBefore.map(l => {
            const truncated = truncateLine(l, output.max_line_length);
            if (truncated !== l) linesTruncated++;
            return truncated;
          });
          totalTokens += estimateTokens(grepMatch.before.join('\n'));
        }
        if (match.contextAfter) {
          grepMatch.after = match.contextAfter.map(l => {
            const truncated = truncateLine(l, output.max_line_length);
            if (truncated !== l) linesTruncated++;
            return truncated;
          });
          totalTokens += estimateTokens(grepMatch.after.join('\n'));
        }
      }
    }

    fileResult.matches!.push(grepMatch);
  }

  const files = Array.from(fileMap.values());

  // Build result based on output mode
  const result: GrepResult = {
    truncated,
  };

  switch (output.mode) {
    case 'count_only':
      result.file_count = files.length;
      result.match_count = totalMatches;
      break;
    case 'files_only':
      result.files = files.map(r => ({ file: r.file, match_count: r.match_count }));
      result.file_count = files.length;
      result.match_count = totalMatches;
      break;
    default:
      result.files = files;
      result.file_count = files.length;
      result.match_count = totalMatches;
  }

  // Add truncation info if lines were truncated
  if (linesTruncated > 0) {
    result.lines_truncated = linesTruncated;
    result.note = `${linesTruncated} lines truncated to ${output.max_line_length} chars. Use max_line_length: null for full content.`;
  }

  return result;
}

async function executeQuery(
  query: GrepQuery,
  output: GrepOutput,
  workDir: string
): Promise<GrepResult> {
  // Support both new (max_results) and old (max_files) parameter names
  const maxFiles = output.max_results ?? output.max_files ?? 100;
  // Support both new (max_per_item) and old (max_matches_per_file) parameter names
  const maxMatchesPerFile = output.max_per_item ?? output.max_matches_per_file ?? 10;
  const maxTotalMatches = output.max_total_matches ?? 100;
  const maxTokens = output.max_tokens ?? Infinity;
  const contextBefore = output.context_before ?? 0;
  const contextAfter = output.context_after ?? 0;

  // Resolve pattern (support base64-encoded patterns)
  const patternStr = resolveStringField(query as unknown as Record<string, unknown>, 'pattern', {
    allowFile: true,
    basePath: process.cwd(),
    required: true,
    fieldName: 'pattern'
  });

  // Map query options to RipgrepSearchOptions
  const searchPath = query.path
    ? await validateDirectoryPath(query.path, workDir)
    : workDir;
  const excludePatterns = [...DEFAULT_EXCLUDES, ...(query.exclude ?? [])];

  const ripgrepOptions: import('../core/ripgrep.js').RipgrepSearchOptions = {
    pattern: patternStr,
    path: searchPath,
    glob: query.glob,
    exclude: excludePatterns,
    caseInsensitive: query.case_sensitive === false,
    wholeWord: query.whole_word,
    multiline: query.multiline,
    includeBinary: query.include_binary,
    contextBefore,
    contextAfter,
    maxCount: maxMatchesPerFile,
    maxColumns: output.max_line_length,
  };

  // Use RipgrepCore for search (50-100x faster than fast-glob + JS RegExp)
  const ripgrepResult = await ripgrepCore.search(ripgrepOptions);

  // Transform RipgrepSearchResult to GrepResult format
  return transformRipgrepResult(ripgrepResult, output, workDir, maxFiles, maxTotalMatches, maxTokens);
}

// === Main Handler ===

export const handlePrecisionGrep: ToolHandler = async (args: unknown) => {
  const getElapsed = startTimer();
  const rawInput = args as PrecisionGrepInput;
  const input = { ...rawInput, queries: parseJsonField(rawInput.queries) } as PrecisionGrepInput;
  const outputMode = parseOutputMode(args, "precision_grep");
  const workDir = process.cwd();

  try {
    // Validate input
    if (!input.queries || !Array.isArray(input.queries) || input.queries.length === 0) {
      return toCallToolResult(createErrorResult(formatMissingParamError('precision_grep', 'queries', 'array of search queries'), { output_mode: outputMode, execution_ms: getElapsed() }));
    }

    // Apply defaults per schema (handlers must apply defaults, not just define them in schema)
    const output: GrepOutput = {
      mode: input.output?.format ?? input.output?.mode ?? 'files_only',
      context_before: input.output?.context_before ?? 0,
      context_after: input.output?.context_after ?? 0,
      // Support both new and old parameter names
      max_results: input.output?.max_results ?? input.output?.max_files ?? 100,
      max_files: input.output?.max_files ?? 100,
      max_per_item: input.output?.max_per_item ?? input.output?.max_matches_per_file ?? 10,
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
