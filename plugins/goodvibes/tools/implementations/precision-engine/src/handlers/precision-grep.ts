/**
 * precision_grep handler - Token-efficient search with precise output control
 * SPEC-v2 Section 13.1.1
 *
 * Features:
 * - Batch multiple queries
 * - Output modes: count_only, files_only, locations, matches, context
 * - Context expansion: line, block, function, class
 * - Clean cap layer (each cap does exactly one job):
 *   - max_results caps the FILE LIST
 *   - max_per_item caps matches INCLUDED PER FILE
 *   - max_total_matches caps matches INCLUDED ACROSS ALL FILES
 *   Counts (file_count / match_count) are always TRUE counts — never capped.
 *   count_only counts with no caps applied at all.
 * - Truthful truncation: `truncated` is set only when output was actually
 *   trimmed, and `effective_caps` names exactly the caps that bit.
 * - Parallel query execution
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { startTimer } from '../logging.js';
import type { OutputMode } from '../types.js';
import { successResult, errorResult, parseOutputMode, toCallToolResult, ToolHandler, resolveStringField, parseJsonField, ensureArray } from '../utils/index.js';
import { createErrorResult, formatMissingParamError } from '../utils/errors.js';
import { DEFAULT_EXCLUDES } from '../config.js';
import { RipgrepCore, RipgrepSearchResult } from '../core/ripgrep.js';
import { TreeSitterCore } from '../core/tree-sitter.js';
import { validateDirectoryPath } from '../utils/path-validation.js';
import { applyPagination, type PaginationParams, type PaginationMetadata } from '../utils/grep-pagination.js';
import { findFilesWithoutPattern, type NegationResult } from '../utils/grep-negation.js';
import { generateReplacePreview, type ReplacePreviewResult } from '../utils/grep-replace-preview.js';
import { rankResults, type RankedFile } from '../utils/grep-ranking.js';
import { computeStats, type GrepStatsSummary } from '../utils/grep-stats.js';
import { findRelatedFiles, type RelationshipResult } from '../utils/grep-relationships.js';
import { SearchCache } from '../state/search-cache.js';
import { warnDeprecatedParam } from '../utils/deprecation.js';

// === Interfaces per SPEC-v2 ===

type GrepOutputMode = 'count_only' | 'files_only' | 'locations' | 'matches' | 'context' | 'stats';
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
  negate?: boolean;
  include_hidden?: boolean;
}

interface GrepOutput {
  mode: GrepOutputMode;
  format?: string;
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
  offset?: number;
}

interface PrecisionGrepInput {
  queries: GrepQuery[];
  output: GrepOutput;
  parallel?: boolean;
  output_mode?: OutputMode;
  relationships?: boolean;
  preview_replace?: string;
  ranked?: boolean;
  base_path?: string;
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

/**
 * Names exactly the caps that actually trimmed output. Only present on a
 * query result when `truncated` is true, and only the caps that bit are set.
 */
interface EffectiveCaps {
  max_results?: number;
  max_per_item?: number;
  max_total_matches?: number;
  max_tokens?: number;
}

interface GrepResult {
  files?: GrepFileResult[];
  file_count?: number;
  match_count?: number;
  truncated?: boolean;
  effective_caps?: EffectiveCaps;
  lines_truncated?: number;
  note?: string;
  pagination?: PaginationMetadata;
  relationships?: RelationshipResult[];
  replace_preview?: ReplacePreviewResult;
  negation?: NegationResult;
  ranked_files?: RankedFile[];
  stats?: GrepStatsSummary;
  tokens_used?: number;
}

interface ResolvedCaps {
  maxFiles: number;
  maxPerItem: number;
  maxTotalMatches: number;
  maxTokens: number;
}

// === Singleton Instances ===

const ripgrepCore = new RipgrepCore();
const treeSitterCore = new TreeSitterCore();
const searchCache = SearchCache.getInstance();

// === Helper Functions ===

/**
 * Split a glob pattern with literal path prefix into (directory, pattern).
 * Extracts literal directory prefix from glob patterns for ripgrep compatibility.
 * Returns null if no literal prefix found.
 */
function splitGlobPattern(globPattern: string): { dir: string; glob: string } | null {
  // Match literal path prefix (no wildcards) followed by glob pattern
  const match = globPattern.match(/^([^*?\[\]{}]+\/)(.*)/)
  if (!match) return null
  
  const [, literalPrefix, remainingGlob] = match
  // Remove trailing slash from prefix
  const dir = literalPrefix.replace(/\/$/, '')
  
  // If remaining glob is empty or doesn't have wildcards, return null (not a glob pattern)
  if (!remainingGlob || !/[*?\[\]{}]/.test(remainingGlob)) {
    return null
  }
  
  return { dir, glob: remainingGlob }
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

/**
 * Transform RipgrepSearchResult to GrepResult format with expand_to support.
 *
 * Cap semantics (each cap does exactly one job):
 * - count_only counts with NO caps applied — the true line-based totals.
 * - maxFiles (max_results) caps the file LIST only.
 * - maxPerItem (max_per_item) caps matches included per file (detail modes).
 * - maxTotalMatches caps matches included across all files (detail modes).
 * - maxTokens caps accumulated match content tokens (matches/context modes).
 *
 * `file_count` and `match_count` always report TRUE totals (matched lines);
 * `truncated` reflects only actual output trimming, with the responsible caps
 * echoed in `effective_caps`.
 */
async function transformRipgrepResult(
  ripgrepResult: RipgrepSearchResult,
  output: GrepOutput,
  workDir: string,
  caps: ResolvedCaps
): Promise<GrepResult> {
  const { maxFiles, maxPerItem, maxTotalMatches, maxTokens } = caps;

  // Group matches by file (the core emits one match per matched line),
  // preserving ripgrep's emission order.
  const byFile = new Map<string, import('../core/ripgrep.js').RipgrepMatch[]>();
  for (const match of ripgrepResult.matches) {
    const relativePath = path.relative(workDir, match.file);
    const existing = byFile.get(relativePath);
    if (existing) {
      existing.push(match);
    } else {
      byFile.set(relativePath, [match]);
    }
  }

  const trueFileCount = byFile.size;
  const trueMatchCount = ripgrepResult.matches.length;

  // count_only: pure counting — no caps apply, nothing is trimmed.
  if (output.mode === 'count_only') {
    const countResult: GrepResult = {
      file_count: trueFileCount,
      match_count: trueMatchCount,
      truncated: false,
    };
    countResult.tokens_used = estimateTokens(JSON.stringify(countResult));
    return countResult;
  }

  const effectiveCaps: EffectiveCaps = {};
  let truncated = false;

  // max_results caps the file list (and ONLY the file list). Entries are
  // sorted by path so that capped list membership is deterministic across
  // identical runs (the ripgrep parallel walk emits files in nondeterministic
  // order) and offset pagination sees a stable ordering.
  const fileEntries = Array.from(byFile.entries())
    .sort(([a], [b]) => a.localeCompare(b));
  const includedEntries = fileEntries.length > maxFiles
    ? fileEntries.slice(0, maxFiles)
    : fileEntries;
  if (includedEntries.length < fileEntries.length) {
    truncated = true;
    effectiveCaps.max_results = maxFiles;
  }

  if (output.mode === 'files_only') {
    const filesOnlyResult: GrepResult = {
      files: includedEntries.map(([file, fileMatches]) => ({
        file,
        match_count: fileMatches.length,
      })),
      file_count: trueFileCount,
      match_count: trueMatchCount,
      truncated,
    };
    if (truncated) {
      filesOnlyResult.effective_caps = effectiveCaps;
    }
    filesOnlyResult.tokens_used = estimateTokens(JSON.stringify(filesOnlyResult));
    return filesOnlyResult;
  }

  // Detail modes: locations / matches / context / stats.
  let includedMatches = 0;
  let totalTokens = 0;
  let linesTruncated = 0;
  const files: GrepFileResult[] = [];

  outer:
  for (const [relativePath, fileMatches] of includedEntries) {
    const fileResult: GrepFileResult = {
      file: relativePath,
      matches: [],
      // True matched-line count for this file (the matches array may be shorter).
      match_count: fileMatches.length,
    };
    files.push(fileResult);

    for (const match of fileMatches) {
      if (fileResult.matches!.length >= maxPerItem) {
        truncated = true;
        effectiveCaps.max_per_item = maxPerItem;
        break;
      }
      if (includedMatches >= maxTotalMatches) {
        truncated = true;
        effectiveCaps.max_total_matches = maxTotalMatches;
        break outer;
      }
      if (totalTokens >= maxTokens) {
        truncated = true;
        if (output.max_tokens !== undefined) {
          effectiveCaps.max_tokens = output.max_tokens;
        }
        break outer;
      }

      const grepMatch: GrepMatch = {
        line: match.line,
        column: match.column,
      };

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
                  const truncatedLine = truncateLine(l, output.max_line_length);
                  if (truncatedLine !== l) linesTruncated++;
                  return truncatedLine;
                });
                totalTokens += estimateTokens(grepMatch.before.join('\n'));
              }

              if (end > matchLineIndex) {
                const afterLines = lines.slice(matchLineIndex + 1, end + 1);
                grepMatch.after = afterLines.map(l => {
                  const truncatedLine = truncateLine(l, output.max_line_length);
                  if (truncatedLine !== l) linesTruncated++;
                  return truncatedLine;
                });
                totalTokens += estimateTokens(grepMatch.after.join('\n'));
              }
            }
          } catch {
            // Fall back to ripgrep context if tree-sitter fails
            if (match.contextBefore) {
              grepMatch.before = match.contextBefore.map(l => {
                const truncatedLine = truncateLine(l, output.max_line_length);
                if (truncatedLine !== l) linesTruncated++;
                return truncatedLine;
              });
              totalTokens += estimateTokens(grepMatch.before.join('\n'));
            }
            if (match.contextAfter) {
              grepMatch.after = match.contextAfter.map(l => {
                const truncatedLine = truncateLine(l, output.max_line_length);
                if (truncatedLine !== l) linesTruncated++;
                return truncatedLine;
              });
              totalTokens += estimateTokens(grepMatch.after.join('\n'));
            }
          }
        } else {
          // Use ripgrep context for line/block or no expand_to
          if (match.contextBefore) {
            grepMatch.before = match.contextBefore.map(l => {
              const truncatedLine = truncateLine(l, output.max_line_length);
              if (truncatedLine !== l) linesTruncated++;
              return truncatedLine;
            });
            totalTokens += estimateTokens(grepMatch.before.join('\n'));
          }
          if (match.contextAfter) {
            grepMatch.after = match.contextAfter.map(l => {
              const truncatedLine = truncateLine(l, output.max_line_length);
              if (truncatedLine !== l) linesTruncated++;
              return truncatedLine;
            });
            totalTokens += estimateTokens(grepMatch.after.join('\n'));
          }
        }
      }

      fileResult.matches!.push(grepMatch);
      includedMatches++;
    }
  }

  const result: GrepResult = {
    files,
    file_count: trueFileCount,
    match_count: trueMatchCount,
    truncated,
  };
  if (truncated) {
    result.effective_caps = effectiveCaps;
  }

  // Add truncation info if lines were truncated
  if (linesTruncated > 0) {
    result.lines_truncated = linesTruncated;
    result.note = `${linesTruncated} lines truncated to ${output.max_line_length} chars. Use max_line_length: null for full content.`;
  }

  // Include token count for cumulative tracking
  // Content-level tracking for matches/context; fall back to structure estimate for other modes
  result.tokens_used = totalTokens > 0 ? totalTokens : estimateTokens(JSON.stringify(result));

  return result;
}

async function executeQuery(
  query: GrepQuery,
  output: GrepOutput,
  workDir: string
): Promise<GrepResult> {
  // Warn about deprecated parameters
  if (output.max_files !== undefined && output.max_results === undefined) {
    warnDeprecatedParam('output.max_files', 'output.max_results', 'precision_grep');
  }
  if (output.max_matches_per_file !== undefined && output.max_per_item === undefined) {
    warnDeprecatedParam('output.max_matches_per_file', 'output.max_per_item', 'precision_grep');
  }

  // Support both new (max_results) and old (max_files) parameter names
  const maxFiles = output.max_results ?? output.max_files ?? 100;
  // Support both new (max_per_item) and old (max_matches_per_file) parameter names
  const maxMatchesPerFile = output.max_per_item ?? output.max_matches_per_file ?? 10;
  const maxTotalMatches = output.max_total_matches ?? 100;
  const maxTokens = output.max_tokens ?? Infinity;
  
  // Set default context based on expand_to if not explicitly provided
  let contextBefore = output.context_before ?? 0;
  let contextAfter = output.context_after ?? 0;
  
  // If expand_to is set but no explicit context was provided, use reasonable defaults
  if (output.expand_to && output.context_before === undefined && output.context_after === undefined) {
    switch (output.expand_to) {
      case 'block':
        contextBefore = 5;
        contextAfter = 5;
        break;
      case 'function':
      case 'class':
        // These use tree-sitter, but still need fallback context
        contextBefore = 10;
        contextAfter = 10;
        break;
      case 'line':
        // No additional context needed
        break;
    }
  }

  // Resolve pattern (support base64-encoded patterns)
  const patternStr = resolveStringField(query as unknown as Record<string, unknown>, 'pattern', {
    allowFile: true,
    basePath: workDir,
    required: true,
    fieldName: 'pattern'
  });

  // Handle negation search (files WITHOUT pattern)
  if (query.negate === true) {
    const searchPath = query.path
      ? await validateDirectoryPath(query.path, workDir)
      : workDir;
    const excludePatterns = [
      ...DEFAULT_EXCLUDES,
      ...(query.exclude ?? []),
      // Exclude hidden files/dirs when include_hidden is explicitly false
      ...((query.include_hidden ?? true) === false ? ['**/.*', '.*'] : []),
    ];
    
    const negationResult = await findFilesWithoutPattern(patternStr, searchPath, {
      glob: query.glob,
      exclude: excludePatterns,
      caseInsensitive: query.case_sensitive === false,
      wholeWord: query.whole_word,
      maxResults: maxFiles,
      hidden: query.include_hidden ?? true,
    });

    // Honest truncation: the file list is capped by max_results while
    // file_count reports the true number of files without the pattern.
    const negationTruncated =
      negationResult.files.length < negationResult.total_files_without_match;

    const negationReturn: GrepResult = {
      files: negationResult.files.map(f => ({
        file: f.file,
        match_count: 0,
      })),
      file_count: negationResult.total_files_without_match,
      match_count: 0,
      truncated: negationTruncated,
      negation: negationResult,
      tokens_used: estimateTokens(JSON.stringify({ files: negationResult.files, negation: negationResult })),
    };
    if (negationTruncated) {
      negationReturn.effective_caps = { max_results: maxFiles };
    }
    return negationReturn;
  }

  // Map query options to RipgrepSearchOptions
  let searchPath: string;
  let effectiveGlob = query.glob;
  
  // Bug 3 fix: Handle glob patterns with literal directory prefixes
  // Example: "pt-tests/fixtures/**/*.ts" needs to be split into path + glob
  if (query.glob && !query.path) {
    const split = splitGlobPattern(query.glob);
    if (split) {
      // Glob has literal prefix - use it as the search path
      searchPath = path.resolve(workDir, split.dir);
      effectiveGlob = split.glob;
      
      // Validate the extracted directory exists
      try {
        await validateDirectoryPath(searchPath, workDir);
      } catch (error) {
        throw new Error(
          `Glob pattern '${query.glob}' contains directory prefix '${split.dir}' which doesn't exist. ` +
          `Error: ${(error as Error).message}`
        );
      }
    } else {
      searchPath = workDir;
    }
  } else {
    // Bug 11 fix: Support file paths in addition to directories
    if (query.path) {
      const absolutePath = path.isAbsolute(query.path)
        ? query.path
        : path.resolve(workDir, query.path);
      
      try {
        // Try as directory first
        searchPath = await validateDirectoryPath(query.path, workDir);
      } catch (error) {
        // Not a directory - check if it's a file
        try {
          const stats = await fs.stat(absolutePath);
          if (stats.isFile()) {
            // It's a file - search within this specific file
            // We'll use the parent directory as search path and force ripgrep to only search this file
            searchPath = path.dirname(absolutePath);
            // Override glob to match only this specific file (relative to parent dir)
            effectiveGlob = path.basename(absolutePath);
          } else {
            throw error; // Re-throw original directory validation error
          }
        } catch {
          throw new Error(
            `Path '${query.path}' is neither a directory nor a file, or is not accessible.`
          );
        }
      }
    } else {
      searchPath = workDir;
    }
  }
  
  const excludePatterns = [
    ...DEFAULT_EXCLUDES,
    ...(query.exclude ?? []),
    // Exclude hidden files/dirs when include_hidden is explicitly false
    ...((query.include_hidden ?? true) === false ? ['**/.*', '.*'] : []),
  ];

  // NOTE: no per-file maxCount is passed to ripgrep. All caps are applied
  // post-parse in transformRipgrepResult so that file_count/match_count stay
  // TRUE counts (a per-file --max-count would silently leak into totals).
  const ripgrepOptions: import('../core/ripgrep.js').RipgrepSearchOptions = {
    pattern: patternStr,
    path: searchPath,
    glob: effectiveGlob,
    exclude: excludePatterns,
    caseInsensitive: query.case_sensitive === false,
    wholeWord: query.whole_word,
    multiline: query.multiline,
    includeBinary: query.include_binary,
    contextBefore,
    contextAfter,
    maxColumns: output.max_line_length,
    hidden: query.include_hidden ?? true,
  };

  // Use RipgrepCore for search (50-100x faster than fast-glob + JS RegExp)
  const ripgrepResult = await ripgrepCore.search(ripgrepOptions);

  // Transform RipgrepSearchResult to GrepResult format
  return transformRipgrepResult(ripgrepResult, output, workDir, {
    maxFiles,
    maxPerItem: maxMatchesPerFile,
    maxTotalMatches,
    maxTokens,
  });
}

// === Main Handler ===

export const handlePrecisionGrep: ToolHandler = async (args: unknown) => {
  const getElapsed = startTimer();
  const rawInput = args as PrecisionGrepInput;
  const input = { ...rawInput, queries: ensureArray(rawInput.queries) ?? parseJsonField(rawInput.queries) } as PrecisionGrepInput;
  const outputMode = parseOutputMode(args, "precision_grep");

  try {
    // Resolve the base directory for relative query paths.
    // Default remains process.cwd(); an explicit base_path is validated first.
    const workDir = input.base_path
      ? await validateDirectoryPath(input.base_path, process.cwd())
      : process.cwd();

    // Validate input
    if (!input.queries || !Array.isArray(input.queries) || input.queries.length === 0) {
      return toCallToolResult(createErrorResult(formatMissingParamError('precision_grep', 'queries', 'array of search queries'), { output_mode: outputMode, execution_ms: getElapsed() }));
    }

    // Apply defaults per schema (handlers must apply defaults, not just define them in schema)
    const rawOutput = (parseJsonField(input.output) ?? {}) as GrepOutput;
    const resolvedMode = rawOutput.format ?? rawOutput.mode ?? 'files_only';
    const output: GrepOutput = {
      ...rawOutput,
      mode: resolvedMode as GrepOutputMode,
      context_before: rawOutput.context_before,
      context_after: rawOutput.context_after,
      // Support both new and old parameter names
      max_results: rawOutput.max_results ?? rawOutput.max_files ?? 100,
      max_per_item: rawOutput.max_per_item ?? rawOutput.max_matches_per_file ?? 10,
      max_total_matches: rawOutput.max_total_matches ?? 100,
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

    // === POST-PROCESSING PIPELINE ===
    // Apply enhancements to query results

    for (const [queryId, result] of Object.entries(queryResults)) {
      const query = input.queries.find(q => q.id === queryId);
      if (!query) continue;

      // Resolve pattern once at the top of the loop for reuse
      const patternStr = resolveStringField(query as unknown as Record<string, unknown>, 'pattern', {
        allowFile: true,
        basePath: workDir,
        required: true,
        fieldName: 'pattern'
      });

      try {
        // 1. SearchCache: Store results for caching
        if (result.files && result.files.length > 0) {
          const filePaths = result.files.map(f => path.join(workDir, f.file));
          searchCache.store(queryId, filePaths, patternStr);
        }
      } catch (err) {
        // Non-critical: cache failures shouldn't break the search
        result.note = (result.note ? result.note + '; ' : '') + 
          `Cache storage failed: ${(err as Error).message}`;
      }

      try {
        // 2. Stats mode: Compute statistics
        if (output.mode === 'stats' && result.files) {
          result.stats = computeStats(result.files, patternStr);
        }
      } catch (err) {
        // Non-critical: stats failures shouldn't break the search
        result.note = (result.note ? result.note + '; ' : '') + 
          `Stats computation failed: ${(err as Error).message}`;
      }

      try {
        // 3. Pagination: Apply offset and limit
        if (output.offset && output.offset > 0 && result.files) {
          const paginationParams: PaginationParams = {
            offset: output.offset,
            max_results: output.max_results,
          };
          const paginationResult = applyPagination(
            result.files,
            result.match_count ?? 0,
            paginationParams
          );
          result.files = paginationResult.files;
          result.pagination = paginationResult.pagination;
        }
      } catch (err) {
        // Non-critical: pagination failures shouldn't break the search
        result.note = (result.note ? result.note + '; ' : '') + 
          `Pagination failed: ${(err as Error).message}`;
      }

      try {
        // 4. Ranking: Rank results by relevance
        if (input.ranked === true && result.files && result.files.length > 0) {
          result.ranked_files = await rankResults(result.files, patternStr, workDir);
          // Sort files by relevance (descending)
          result.files = result.ranked_files.map(rf => ({
            file: rf.file,
            matches: rf.matches,
            match_count: rf.match_count,
          }));
        }
      } catch (err) {
        // Non-critical: ranking failures shouldn't break the search
        result.note = (result.note ? result.note + '; ' : '') + 
          `Ranking failed: ${(err as Error).message}`;
      }

      try {
        // 5. Replace preview: Generate replacement previews
        if (input.preview_replace && result.files && result.files.length > 0) {
          result.replace_preview = generateReplacePreview(
            result.files,
            patternStr,
            input.preview_replace
          );
        }
      } catch (err) {
        // Non-critical: preview failures shouldn't break the search
        result.note = (result.note ? result.note + '; ' : '') + 
          `Replace preview failed: ${(err as Error).message}`;
      }

      try {
        // 6. Relationships: Find related files (bounded)
        if (input.relationships === true && result.files && result.files.length > 0) {
          const relationshipResults: RelationshipResult[] = [];
          
          // Limit to first 5 files to avoid excessive processing
          const filesToProcess = result.files.slice(0, 5);
          
          for (const fileResult of filesToProcess) {
            if (!fileResult.matches || fileResult.matches.length === 0) continue;
            
            // Limit to first 3 matches per file
            const matchesToProcess = fileResult.matches.slice(0, 3);
            
            for (const match of matchesToProcess) {
              if (!match.content) continue;
              
              // Extract symbol from match content (simple heuristic: first word)
              const symbolMatch = match.content.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/);
              if (!symbolMatch) continue;
              
              const symbol = symbolMatch[0];
              const absolutePath = path.join(workDir, fileResult.file);
              
              const relationships = await findRelatedFiles(absolutePath, symbol, workDir);
              relationshipResults.push(relationships);
            }
          }
          
          result.relationships = relationshipResults;
        }
      } catch (err) {
        // Non-critical: relationship failures shouldn't break the search
        result.note = (result.note ? result.note + '; ' : '') + 
          `Relationships analysis failed: ${(err as Error).message}`;
      }
    }

    // Build summary
    let totalFiles = 0;
    let totalMatches = 0;
    let anyTruncated = false;
    let cumulativeTokens = 0;

    for (const result of Object.values(queryResults)) {
      totalFiles += result.file_count ?? 0;
      totalMatches += result.match_count ?? 0;
      if (result.truncated) anyTruncated = true;
      cumulativeTokens += result.tokens_used ?? 0;
    }

    const data = {
      queries: queryResults,
      summary: {
        total_files: totalFiles,
        total_matches: totalMatches,
        truncated: anyTruncated,
      },
      tokens_used: cumulativeTokens,
    };

    return toCallToolResult(successResult(data, outputMode, getElapsed()));
  } catch (error) {
    return toCallToolResult(errorResult((error as Error).message, outputMode, getElapsed()));
  }
};
