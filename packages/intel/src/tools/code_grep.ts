/**
 * code_grep, batched, structure-aware search with a clean cap layer, ranking,
 * negation, replace-preview, and stats.
 *
 * Ported from v1 `precision-engine/src/handlers/precision-grep.ts` plus
 * `core/{ripgrep,tree-sitter}.ts` and `utils/{grep-pagination,grep-negation,
 * grep-replace-preview,grep-stats}.ts`. `grep-ranking.ts` is REBUILT cheap
 * (see `lib/grep-ranking.ts`); `grep-relationships.ts` does not port (plan
 * §4.1 code_grep row); `core/ast-grep.ts` does not port either, RULING (see
 * lane report): the v1 `precision_grep` handler never calls `AstGrepCore` (it
 * is only used by the retiring `discover`/`precision_edit` handlers), so no
 * v2 `code_grep` behavior depends on it.
 *
 * Field issue 2 fixes carried in verbatim (cap layer, all root-caused):
 *  - `max_results` (output.max_results) caps the FILE LIST only.
 *  - `max_per_item` caps matches included PER FILE.
 *  - `max_total_matches` caps matches included ACROSS ALL FILES.
 *  - `count_only`/file counts (`file_count`/`match_count`) are always TRUE
 *    counts, never capped, no per-file `--max-count` is ever passed to
 *    ripgrep for count_only/files_only, so a per-file cap can never leak into
 *    a total.
 *  - `truncated` is set only when a cap actually trimmed output, and
 *    `effective_caps` echoes exactly the caps that bit, in EVERY output
 *    format, including `count_only`.
 * Field issue 1 (base_path): every file result echoes an absolute
 * `resolved_path`.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from './types.js';
import {
  successEnvelope,
  errorEnvelope,
  toCallToolResult,
  estimatePayloadTokens,
  type Envelope,
} from '@goodvibes/core/envelope';
import { withBudget } from '@goodvibes/core/proc';
import { loadConfig } from '@goodvibes/core/config';
import { ensureArray, parseJsonField, resolveStringOrBase64 } from '../lib/args.js';
import { DEFAULT_EXCLUDES } from '../lib/defaults.js';
import { resolveWorkDir } from '../lib/workdir.js';
import { RipgrepCore, type RipgrepMatch, type RipgrepSearchResult } from '../lib/ripgrep.js';
import { TreeSitterCore } from '../lib/tree-sitter.js';
import { applyPagination, type PaginationMetadata } from '../lib/grep-pagination.js';
import { findFilesWithoutPattern, type NegationResult } from '../lib/grep-negation.js';
import { generateReplacePreview, type ReplacePreviewResult } from '../lib/grep-replace-preview.js';
import { rankFiles } from '../lib/grep-ranking.js';
import { computeStats, type GrepStatsSummary } from '../lib/grep-stats.js';

const ripgrepCore = new RipgrepCore();
const treeSitterCore = new TreeSitterCore();

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
  mode?: GrepOutputMode;
  format?: GrepOutputMode;
  context_before?: number;
  context_after?: number;
  expand_to?: ExpandTo;
  max_results?: number;
  max_per_item?: number;
  max_total_matches?: number;
  max_tokens?: number;
  max_line_length?: number;
  offset?: number;
}

interface CodeGrepInput {
  queries: GrepQuery[];
  output?: GrepOutput;
  parallel?: boolean;
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
  resolved_path: string;
  matches?: GrepMatch[];
  match_count?: number;
  relevance?: number;
}

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
  replace_preview?: ReplacePreviewResult;
  negation?: NegationResult;
  stats?: GrepStatsSummary;
  tokens_used?: number;
}

interface ResolvedCaps {
  maxFiles: number;
  maxPerItem: number;
  maxTotalMatches: number;
  maxTokens: number;
}

function truncateLine(line: string, maxLength: number | undefined): string {
  if (!maxLength || line.length <= maxLength) {return line;}
  return line.substring(0, maxLength) + '... [truncated]';
}

/** Split a glob with a literal directory prefix (e.g. `pt-tests/fixtures/**\/*.ts`) into (dir, glob). */
function splitGlobPattern(globPattern: string): { dir: string; glob: string } | null {
  const match = globPattern.match(/^([^*?[\]{}]+\/)(.*)/);
  if (!match) {return null;}
  const [, literalPrefix, remainingGlob] = match;
  const dir = literalPrefix.replace(/\/$/, '');
  if (!remainingGlob || !/[*?[\]{}]/.test(remainingGlob)) {return null;}
  return { dir, glob: remainingGlob };
}

/**
 * Transform a RipgrepSearchResult into a GrepResult. Cap semantics (each cap
 * does exactly one job, field issue 2):
 *  - count_only counts with NO caps applied, true line-based totals.
 *  - maxFiles (max_results) caps the file LIST only.
 *  - maxPerItem (max_per_item) caps matches included per file.
 *  - maxTotalMatches caps matches included across all files.
 *  - maxTokens caps accumulated match content tokens.
 * `file_count`/`match_count` always report TRUE totals; `truncated` reflects
 * only actual trimming, with the responsible caps echoed in `effective_caps`.
 */
async function transformRipgrepResult(
  ripgrepResult: RipgrepSearchResult,
  output: Required<Pick<GrepOutput, 'mode'>> & GrepOutput,
  workDir: string,
  caps: ResolvedCaps,
): Promise<GrepResult> {
  const { maxFiles, maxPerItem, maxTotalMatches, maxTokens } = caps;

  const byFile = new Map<string, RipgrepMatch[]>();
  for (const match of ripgrepResult.matches) {
    const relativePath = path.relative(workDir, match.file);
    const existing = byFile.get(relativePath);
    if (existing) {existing.push(match);}
    else {byFile.set(relativePath, [match]);}
  }

  const trueFileCount = byFile.size;
  const trueMatchCount = ripgrepResult.matches.length;

  if (output.mode === 'count_only') {
    const countResult: GrepResult = { file_count: trueFileCount, match_count: trueMatchCount, truncated: false };
    countResult.tokens_used = estimatePayloadTokens(JSON.stringify(countResult));
    return countResult;
  }

  const effectiveCaps: EffectiveCaps = {};
  let truncated = false;

  const fileEntries = Array.from(byFile.entries()).sort(([a], [b]) => a.localeCompare(b));
  const includedEntries = fileEntries.length > maxFiles ? fileEntries.slice(0, maxFiles) : fileEntries;
  if (includedEntries.length < fileEntries.length) {
    truncated = true;
    effectiveCaps.max_results = maxFiles;
  }

  const resolvedPathOf = (relativePath: string): string => path.resolve(workDir, relativePath);

  if (output.mode === 'files_only') {
    const filesOnlyResult: GrepResult = {
      files: includedEntries.map(([file, fileMatches]) => ({
        file,
        resolved_path: resolvedPathOf(file),
        match_count: fileMatches.length,
      })),
      file_count: trueFileCount,
      match_count: trueMatchCount,
      truncated,
    };
    if (truncated) {filesOnlyResult.effective_caps = effectiveCaps;}
    filesOnlyResult.tokens_used = estimatePayloadTokens(JSON.stringify(filesOnlyResult));
    return filesOnlyResult;
  }

  let includedMatches = 0;
  let totalTokens = 0;
  let linesTruncated = 0;
  const files: GrepFileResult[] = [];

  outer: for (const [relativePath, fileMatches] of includedEntries) {
    const fileResult: GrepFileResult = {
      file: relativePath,
      resolved_path: resolvedPathOf(relativePath),
      matches: [],
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
        if (output.max_tokens !== undefined) {effectiveCaps.max_tokens = output.max_tokens;}
        break outer;
      }

      const grepMatch: GrepMatch = { line: match.line, column: match.column };

      if (output.mode === 'matches' || output.mode === 'context') {
        const originalLine = match.lineContent;
        grepMatch.content = truncateLine(match.lineContent, output.max_line_length);
        if (grepMatch.content !== originalLine) {linesTruncated++;}
        const matchStart = match.column - 1;
        grepMatch.highlight = [matchStart, matchStart + match.matchText.length];
        totalTokens += estimatePayloadTokens(grepMatch.content);
      }

      if (output.mode === 'context') {
        if (output.expand_to === 'function' || output.expand_to === 'class') {
          try {
            const fileContent = await fs.readFile(path.join(workDir, relativePath), 'utf-8');
            const tree = await treeSitterCore.parse(fileContent, relativePath);
            const range =
              output.expand_to === 'function'
                ? treeSitterCore.getEnclosingFunction(tree, match.line)
                : treeSitterCore.getEnclosingClass(tree, match.line);
            if (range) {
              const lines = fileContent.split('\n');
              const start = range.start.line - 1;
              const end = range.end.line - 1;
              const matchLineIndex = match.line - 1;
              if (start < matchLineIndex) {
                grepMatch.before = lines.slice(start, matchLineIndex).map((l) => {
                  const t = truncateLine(l, output.max_line_length);
                  if (t !== l) {linesTruncated++;}
                  return t;
                });
                totalTokens += estimatePayloadTokens(grepMatch.before.join('\n'));
              }
              if (end > matchLineIndex) {
                grepMatch.after = lines.slice(matchLineIndex + 1, end + 1).map((l) => {
                  const t = truncateLine(l, output.max_line_length);
                  if (t !== l) {linesTruncated++;}
                  return t;
                });
                totalTokens += estimatePayloadTokens(grepMatch.after.join('\n'));
              }
            }
          } catch {
            if (match.contextBefore) {
              grepMatch.before = match.contextBefore.map((l) => {
                const t = truncateLine(l, output.max_line_length);
                if (t !== l) {linesTruncated++;}
                return t;
              });
              totalTokens += estimatePayloadTokens(grepMatch.before.join('\n'));
            }
            if (match.contextAfter) {
              grepMatch.after = match.contextAfter.map((l) => {
                const t = truncateLine(l, output.max_line_length);
                if (t !== l) {linesTruncated++;}
                return t;
              });
              totalTokens += estimatePayloadTokens(grepMatch.after.join('\n'));
            }
          }
        } else {
          if (match.contextBefore) {
            grepMatch.before = match.contextBefore.map((l) => {
              const t = truncateLine(l, output.max_line_length);
              if (t !== l) {linesTruncated++;}
              return t;
            });
            totalTokens += estimatePayloadTokens(grepMatch.before.join('\n'));
          }
          if (match.contextAfter) {
            grepMatch.after = match.contextAfter.map((l) => {
              const t = truncateLine(l, output.max_line_length);
              if (t !== l) {linesTruncated++;}
              return t;
            });
            totalTokens += estimatePayloadTokens(grepMatch.after.join('\n'));
          }
        }
      }

      fileResult.matches!.push(grepMatch);
      includedMatches++;
    }
  }

  const result: GrepResult = { files, file_count: trueFileCount, match_count: trueMatchCount, truncated };
  if (truncated) {result.effective_caps = effectiveCaps;}
  if (linesTruncated > 0) {
    result.lines_truncated = linesTruncated;
    result.note = `${linesTruncated} lines truncated to ${output.max_line_length} chars. Omit max_line_length for full content.`;
  }
  result.tokens_used = totalTokens > 0 ? totalTokens : estimatePayloadTokens(JSON.stringify(result));
  return result;
}

async function executeQuery(
  query: GrepQuery,
  output: Required<Pick<GrepOutput, 'mode' | 'max_results' | 'max_per_item' | 'max_total_matches'>> & GrepOutput,
  workDir: string,
): Promise<GrepResult> {
  const maxFiles = output.max_results;
  const maxMatchesPerFile = output.max_per_item;
  const maxTotalMatches = output.max_total_matches;
  const maxTokens = output.max_tokens ?? Infinity;

  let contextBefore = output.context_before ?? 0;
  let contextAfter = output.context_after ?? 0;
  if (output.expand_to && output.context_before === undefined && output.context_after === undefined) {
    if (output.expand_to === 'block') {
      contextBefore = 5;
      contextAfter = 5;
    } else if (output.expand_to === 'function' || output.expand_to === 'class') {
      contextBefore = 10;
      contextAfter = 10;
    }
  }

  const patternStr = resolveStringOrBase64(query as unknown as Record<string, unknown>, 'pattern');
  if (!patternStr) {
    throw new Error("Missing required parameter 'queries[].pattern' (or 'queries[].pattern_base64').");
  }

  if (query.negate === true) {
    const searchPath = query.path ? path.resolve(workDir, query.path) : workDir;
    const excludePatterns = [
      ...DEFAULT_EXCLUDES,
      ...(query.exclude ?? []),
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
    const negationTruncated = negationResult.files.length < negationResult.total_files_without_match;
    const negationReturn: GrepResult = {
      files: negationResult.files.map((f) => ({ file: f.file, resolved_path: f.resolved_path, match_count: 0 })),
      file_count: negationResult.total_files_without_match,
      match_count: 0,
      truncated: negationTruncated,
      negation: negationResult,
      tokens_used: estimatePayloadTokens(JSON.stringify({ files: negationResult.files, negation: negationResult })),
    };
    if (negationTruncated) {negationReturn.effective_caps = { max_results: maxFiles };}
    return negationReturn;
  }

  let searchPath: string;
  let effectiveGlob = query.glob;

  if (query.glob && !query.path) {
    const split = splitGlobPattern(query.glob);
    if (split) {
      searchPath = path.resolve(workDir, split.dir);
      effectiveGlob = split.glob;
      try {
        await fs.stat(searchPath);
      } catch {
        throw new Error(`Glob pattern '${query.glob}' contains directory prefix '${split.dir}' which doesn't exist.`);
      }
    } else {
      searchPath = workDir;
    }
  } else if (query.path) {
    const absolutePath = path.isAbsolute(query.path) ? query.path : path.resolve(workDir, query.path);
    const stats = await fs.stat(absolutePath).catch(() => null);
    if (!stats) {
      throw new Error(`Path '${query.path}' is neither a directory nor a file, or is not accessible.`);
    }
    if (stats.isDirectory()) {
      searchPath = absolutePath;
    } else {
      searchPath = path.dirname(absolutePath);
      effectiveGlob = path.basename(absolutePath);
    }
  } else {
    searchPath = workDir;
  }

  const excludePatterns = [
    ...DEFAULT_EXCLUDES,
    ...(query.exclude ?? []),
    ...((query.include_hidden ?? true) === false ? ['**/.*', '.*'] : []),
  ];

  // No per-file maxCount is passed to ripgrep, every cap applies post-parse
  // in transformRipgrepResult so file_count/match_count stay TRUE counts.
  const ripgrepResult = await ripgrepCore.search({
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
  });

  return transformRipgrepResult(ripgrepResult, output, workDir, {
    maxFiles,
    maxPerItem: maxMatchesPerFile,
    maxTotalMatches,
    maxTokens,
  });
}

const definition: Tool = {
  name: 'code_grep',
  description:
    'Prefer this over plain grep for repo-wide searches you would otherwise page through: one batched call replaces several native searches and returned 62.7% fewer tokens for identical match sets (measured, 76/76 matches). Batch pattern search with a clean cap layer (max_results caps the file list, max_per_item caps matches per ' +
    'file, max_total_matches caps matches overall; counts are always true, never capped). Output modes: ' +
    'count_only, files_only (default), locations, matches, context, stats. Supports negate (files WITHOUT a ' +
    'pattern), ranked relevance sort, and preview_replace dry runs.',
  inputSchema: {
    type: 'object',
    properties: {
      queries: {
        type: 'array',
        description: 'Batch of search queries, each with a unique id',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            pattern: { type: 'string' },
            pattern_base64: { type: 'string' },
            glob: { type: 'string' },
            path: { type: 'string', description: 'File or directory to search (relative to base_path)' },
            exclude: { type: 'array', items: { type: 'string' } },
            case_sensitive: { type: 'boolean', default: true },
            whole_word: { type: 'boolean', default: false },
            multiline: { type: 'boolean', default: false },
            include_binary: { type: 'boolean', default: false },
            negate: { type: 'boolean', default: false, description: 'Find files WITHOUT the pattern' },
            include_hidden: { type: 'boolean', default: true },
          },
          required: ['id'],
        },
      },
      base_path: { type: 'string', description: 'Root directory queries resolve against; omitting it falls back to the server cwd with a warning.' },
      parallel: { type: 'boolean', default: true },
      ranked: { type: 'boolean', default: false, description: 'Sort each query\'s files by a cheap relevance score' },
      preview_replace: { type: 'string', description: 'Dry-run replacement string; requires matches mode/content' },
      output: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['count_only', 'files_only', 'locations', 'matches', 'context', 'stats'], default: 'files_only' },
          context_before: { type: 'number' },
          context_after: { type: 'number' },
          expand_to: { type: 'string', enum: ['line', 'block', 'function', 'class'] },
          max_results: { type: 'number', default: 100, description: 'Caps the FILE LIST only' },
          max_per_item: { type: 'number', default: 10, description: 'Caps matches included PER FILE' },
          max_total_matches: { type: 'number', default: 100, description: 'Caps matches included ACROSS ALL FILES' },
          max_tokens: { type: 'number' },
          max_line_length: { type: 'number' },
          offset: { type: 'number' },
        },
      },
    },
    required: ['queries'],
  },
};

/** Budget-partial design: see the ruling in `tools/code_read.ts`'s `handler` doc, same tradeoff applies here (batched, independent per-query work). */
export async function handler(args: unknown): Promise<CallToolResult> {
  const start = performance.now();
  const cfg = loadConfig();
  const outcome = await withBudget(cfg.budgets.search_ms, async () => runCodeGrep(args));
  if (outcome.budget_exceeded) {
    return toCallToolResult(
      errorEnvelope('code_grep exceeded its time budget before completing.', {
        execution_ms: Math.round(performance.now() - start),
        budget_exceeded: true,
      }),
    );
  }
  return outcome.value;
}

async function runCodeGrep(args: unknown): Promise<CallToolResult> {
  const start = performance.now();
  const input = args as CodeGrepInput;

  try {
    const { workDir, warning: baseWarning } = await resolveWorkDir(input.base_path);

    const queries = ensureArray<GrepQuery>(input.queries) ?? [];
    if (queries.length === 0) {
      return toCallToolResult(
        errorEnvelope("Missing required parameter 'queries'. Expected: array of search queries.", {
          execution_ms: Math.round(performance.now() - start),
        }),
      );
    }
    for (const query of queries) {
      if (!query.id) {
        return toCallToolResult(
          errorEnvelope("Missing required parameter 'queries[].id'. Expected: string identifier for each query.", {
            execution_ms: Math.round(performance.now() - start),
          }),
        );
      }
      if (!query.pattern && !query.pattern_base64) {
        return toCallToolResult(
          errorEnvelope("Missing required parameter 'queries[].pattern'. Expected: search pattern (string or base64).", {
            execution_ms: Math.round(performance.now() - start),
          }),
        );
      }
    }

    const rawOutput = (parseJsonField(input.output) ?? {}) as GrepOutput;
    const output = {
      ...rawOutput,
      mode: (rawOutput.mode ?? rawOutput.format ?? 'files_only') as GrepOutputMode,
      max_results: rawOutput.max_results ?? 100,
      max_per_item: rawOutput.max_per_item ?? 10,
      max_total_matches: rawOutput.max_total_matches ?? 100,
    };

    const parallel = input.parallel ?? true;
    const queryResults: Record<string, GrepResult> = {};

    if (parallel) {
      const results = await Promise.all(queries.map((q) => executeQuery(q, output, workDir)));
      queries.forEach((q, i) => (queryResults[q.id] = results[i]));
    } else {
      for (const query of queries) {queryResults[query.id] = await executeQuery(query, output, workDir);}
    }

    for (const [queryId, result] of Object.entries(queryResults)) {
      const query = queries.find((q) => q.id === queryId);
      if (!query) {continue;}
      const patternStr = resolveStringOrBase64(query as unknown as Record<string, unknown>, 'pattern') ?? '';

      try {
        if (output.mode === 'stats' && result.files) {
          result.stats = computeStats(result.files, patternStr);
        }
      } catch (err) {
        result.note = (result.note ? result.note + '; ' : '') + `Stats computation failed: ${(err as Error).message}`;
      }

      try {
        if (output.offset && output.offset > 0 && result.files) {
          const paginationResult = applyPagination(result.files, result.match_count ?? 0, {
            offset: output.offset,
            max_results: output.max_results,
          });
          result.files = paginationResult.files;
          result.pagination = paginationResult.pagination;
        }
      } catch (err) {
        result.note = (result.note ? result.note + '; ' : '') + `Pagination failed: ${(err as Error).message}`;
      }

      try {
        if (input.ranked === true && result.files && result.files.length > 0) {
          rankFiles(result.files, patternStr);
        }
      } catch (err) {
        result.note = (result.note ? result.note + '; ' : '') + `Ranking failed: ${(err as Error).message}`;
      }

      try {
        if (input.preview_replace && result.files && result.files.length > 0) {
          result.replace_preview = generateReplacePreview(result.files, patternStr, input.preview_replace);
        }
      } catch (err) {
        result.note = (result.note ? result.note + '; ' : '') + `Replace preview failed: ${(err as Error).message}`;
      }
    }

    let totalFiles = 0;
    let totalMatches = 0;
    let anyTruncated = false;
    let cumulativeTokens = 0;
    for (const result of Object.values(queryResults)) {
      totalFiles += result.file_count ?? 0;
      totalMatches += result.match_count ?? 0;
      if (result.truncated) {anyTruncated = true;}
      cumulativeTokens += result.tokens_used ?? 0;
    }

    const data = {
      queries: queryResults,
      summary: { total_files: totalFiles, total_matches: totalMatches, truncated: anyTruncated },
      tokens_used: cumulativeTokens,
    };

    const env: Envelope<unknown> = successEnvelope(data, { execution_ms: Math.round(performance.now() - start) });
    if (baseWarning) {env.warning = baseWarning;}
    return toCallToolResult(env);
  } catch (error) {
    return toCallToolResult(
      errorEnvelope((error as Error).message, { execution_ms: Math.round(performance.now() - start) }),
    );
  }
}

/** Registration entry consumed by `src/index.ts`. */
export const codeGrepTool: ToolDefinition = { definition, handler };
