/**
 * code_read — outline and lines/range file reading, cache-aware, token-budget
 * paginated.
 *
 * Ported from v1 `precision-engine/src/handlers/precision-read.ts`, narrowed
 * per plan §4.1 code_read row to the outline + lines/range paths ONLY — the
 * content/symbols/ast/pdf/notebook/image branches retire (native tools and
 * WebFetch cover them; §4.1 gate 2 also deletes the stub-cache assumption
 * those paths leaned on).
 *
 * Fixes carried in:
 *  - Honest `exported` flags — the fix lives in `lib/tree-sitter.ts`
 *    (`getOutline` only sets `exported` on top-level entries).
 *  - `output.max_tokens` enforcement (v1 ignored it for outline/lines; a
 *    104KB context-bomb was observed) — trims the oversized `outline`/`lines`
 *    array and flags `truncated` instead of returning an oversized payload.
 *  - `include_line_numbers` honored in `lines` mode (numbers from the range
 *    start line, or line 1 with no range).
 *  - Batch results keyed by ENTRY, not path (field issue 3): two entries for
 *    the same path with different ranges both survive.
 *  - Extracts served from the session cache, never a stub (field issue 4 /
 *    §7.1 — `@goodvibes/core/cache`, F4's unit tests live there; this file
 *    carries the integration case: a real code_read call against a
 *    cache-registered file returns full content, not a stub).
 *  - `token_budget` pagination REBUILT to one representation per page (field
 *    issue 6): a paginated page only ever touches the array field the
 *    extract mode actually produced (`lines` or `outline`) — v1's pager
 *    unconditionally added BOTH a `content` string and a `lines` array to
 *    every page regardless of extract mode; that bug is structurally
 *    impossible here since `content` mode does not exist in v2 at all, and
 *    the rebuilt pager never invents a field the extract mode didn't produce.
 *  - UTF-8-safe pre-read size gate (never splits a multi-byte character or
 *    returns a partial final line).
 *  - `base_path` (issue 1): every file result echoes an absolute
 *    `resolved_path`; no `base_path` given falls back to the server cwd with
 *    an envelope `warning`. The v1 git-bash `normalizePath` rewrite is
 *    deleted per `@goodvibes/core/fsx`'s contract.
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
  nativeDepMessage,
  type Envelope,
} from '@goodvibes/core/envelope';
import { resolveInputPath } from '@goodvibes/core/fsx';
import { withBudget } from '@goodvibes/core/proc';
import { loadConfig } from '@goodvibes/core/config';
import { FileStateCache } from '@goodvibes/core/cache';
import { ensureArray, parseJsonField } from '../lib/args.js';
import { resolveWorkDir } from '../lib/workdir.js';
import { TreeSitterCore, TreeSitterUnavailableError, type OutlineNode as TSOutlineNode } from '../lib/tree-sitter.js';
import { isLanguageSupported } from '../lib/languages.js';
import { MAX_FILE_BYTES, MAX_TOKEN_ESTIMATE, PAGE_SIZE_LINES } from '../lib/defaults.js';

type ExtractMode = 'outline' | 'lines';
type ReadOutputMode = 'count_only' | 'minimal' | 'standard' | 'verbose';

interface LineRange {
  start: number;
  end: number;
}

interface FileReadSpec {
  path: string;
  extract?: ExtractMode;
  range?: LineRange;
  force?: boolean;
  probe?: boolean;
}

interface ReadOutput {
  mode?: ReadOutputMode;
  include_line_numbers?: boolean;
  include_metadata?: boolean;
  max_per_item?: number;
  max_tokens?: number;
}

interface CodeReadInput {
  files: Array<string | FileReadSpec>;
  extract?: ExtractMode;
  output?: ReadOutput;
  default_range?: LineRange;
  token_budget?: number;
  page?: number;
  force?: boolean;
  probe?: boolean;
  base_path?: string;
}

interface OutlineItem {
  name: string;
  kind: string;
  line: number;
  endLine?: number;
  signature?: string;
  exported?: boolean;
  children?: OutlineItem[];
}

interface FileMetadata {
  size: number;
  modified: string;
  created?: string;
}

interface FileReadResult {
  path: string;
  resolved_path: string;
  exists: boolean;
  lines?: string[];
  line_count?: number;
  outline?: OutlineItem[];
  metadata?: FileMetadata;
  error?: string;
  truncated?: boolean;
  status?: 'empty' | 'normal';
  size_bytes?: number;
  warning?: string;
  token_cost?: number;
  cache_hit?: boolean;
  probe?: boolean;
  result_key?: string;
  pagination?: {
    page: number;
    page_size?: number;
    total_lines?: number;
    total_pages: number;
    estimated_tokens?: number;
    hint?: string;
  };
  cache?: {
    status: 'unchanged' | 'modified' | 'new';
    unchanged_since_last_read?: boolean;
    last_read?: string;
    read_count?: number;
    hash?: string;
    previous_lines?: number;
    changes?: { added: number; removed: number; modifiedRanges: string[] };
    diff?: string;
    modified_by?: string;
  };
}

const MAX_BINARY_PROBE_BYTES = 8192;

function isBinaryFile(buffer: Buffer): boolean {
  const checkLength = Math.min(buffer.length, MAX_BINARY_PROBE_BYTES);
  for (let i = 0; i < checkLength; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

/** Decode a UTF-8 buffer that may end mid multi-byte sequence, trimming incomplete trailing bytes. */
function decodeUtf8Prefix(buf: Buffer): string {
  let end = buf.length;
  let i = buf.length - 1;
  let continuationBytes = 0;
  while (i >= 0 && (buf[i] & 0xc0) === 0x80 && continuationBytes < 3) {
    i--;
    continuationBytes++;
  }
  if (i >= 0) {
    const lead = buf[i];
    let seqLen = 0;
    if ((lead & 0x80) === 0x00) seqLen = 1;
    else if ((lead & 0xe0) === 0xc0) seqLen = 2;
    else if ((lead & 0xf0) === 0xe0) seqLen = 3;
    else if ((lead & 0xf8) === 0xf0) seqLen = 4;
    if (seqLen > 1 && continuationBytes + 1 < seqLen) end = i;
  }
  return buf.subarray(0, end).toString('utf-8');
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}

let treeSitterCore: TreeSitterCore | null = null;
function getTreeSitter(): TreeSitterCore {
  return (treeSitterCore ??= new TreeSitterCore());
}

function mapOutline(nodes: TSOutlineNode[]): OutlineItem[] {
  return nodes.map((n) => ({
    name: n.name,
    kind: n.kind,
    line: n.start.line,
    endLine: n.end.line,
    signature: n.signature,
    exported: n.exported,
    children: n.children ? mapOutline(n.children) : undefined,
  }));
}

async function readSingleFile(
  spec: FileReadSpec,
  globalExtract: ExtractMode,
  output: ReadOutput,
  defaultRange: LineRange | undefined,
  workDir: string,
): Promise<FileReadResult> {
  const { resolved_path } = resolveInputPath(spec.path, workDir);
  const relativePath = path.relative(workDir, resolved_path);
  const extract = spec.extract ?? globalExtract;
  const maxLinesPerFile = output.max_per_item ?? Infinity;

  const result: FileReadResult = { path: relativePath, resolved_path, exists: false };

  let stats;
  try {
    stats = await fs.stat(resolved_path);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    result.error = err.code === 'ENOENT' ? `File not found: ${resolved_path}` : err.message;
    return result;
  }

  result.exists = true;
  result.size_bytes = stats.size;
  if (output.include_metadata) {
    result.metadata = { size: stats.size, modified: stats.mtime.toISOString(), created: stats.birthtime?.toISOString() };
  }

  if (stats.size === 0) {
    result.status = 'empty';
    result.size_bytes = 0;
    result.line_count = 1;
    result.warning = 'File exists but is empty (0 bytes).';
    return result;
  }

  const cache = FileStateCache.getInstance();

  // Probe mode: freshness metadata only (hash, changed status) — never content.
  if (spec.probe) {
    const buffer = await fs.readFile(resolved_path);
    result.probe = true;
    if (isBinaryFile(buffer)) {
      result.error = 'Binary file — code_read only reads text content (outline/lines).';
      return result;
    }
    const content = buffer.toString('utf-8');
    result.line_count = content.split('\n').length;
    const lookup = cache.lookup(resolved_path, content, extract);
    result.cache_hit = lookup.status === 'unchanged';
    result.cache = {
      status: lookup.status === 'miss' ? 'new' : lookup.status,
      unchanged_since_last_read: lookup.status === 'unchanged',
      read_count: lookup.entry.readCount,
      hash: lookup.entry.contentHash.substring(0, 8),
    };
    if (lookup.previousReadAt !== undefined) result.cache.last_read = formatTimeAgo(lookup.previousReadAt);
    if (lookup.status === 'modified') {
      result.cache.previous_lines = lookup.previousLineCount;
      if (lookup.changes) result.cache.changes = lookup.changes;
      if (lookup.modifiedBy) result.cache.modified_by = lookup.modifiedBy;
    }
    return result;
  }

  // Pre-read size gate (extract:lines only — outline needs the whole file to
  // parse structurally; paging its input would not be meaningful). UTF-8-safe:
  // never splits a multi-byte character or returns a partial final line.
  const lineRange = spec.range ?? defaultRange;
  const hasRange = !!(lineRange && (lineRange.start !== undefined || lineRange.end !== undefined));
  const estimatedTokens = Math.ceil(stats.size / 4);
  if (extract === 'lines' && !spec.force && !hasRange && (stats.size > MAX_FILE_BYTES || estimatedTokens > MAX_TOKEN_ESTIMATE)) {
    const estimatedBytesPerLine = 80;
    const bytesToRead = Math.min(PAGE_SIZE_LINES * estimatedBytesPerLine * 2, stats.size);
    const fd = await fs.open(resolved_path, 'r');
    const buf = Buffer.alloc(bytesToRead);
    const { bytesRead } = await fd.read(buf, 0, bytesToRead, 0);
    await fd.close();

    const partialContent = decodeUtf8Prefix(buf.subarray(0, bytesRead));
    const allPartialLines = partialContent.split('\n');
    const readWholeFile = bytesRead >= stats.size;
    const completeLines = readWholeFile || allPartialLines.length <= 1 ? allPartialLines : allPartialLines.slice(0, -1);
    const firstPageLines = completeLines.slice(0, PAGE_SIZE_LINES);
    const avgBytesPerLine = bytesRead / Math.max(allPartialLines.length, 1);
    const estimatedTotalLines = Math.ceil(stats.size / avgBytesPerLine);

    result.lines = output.include_line_numbers
      ? firstPageLines.map((l, i) => `${String(i + 1).padStart(5)} | ${l}`)
      : firstPageLines;
    result.line_count = estimatedTotalLines;
    result.truncated = true;
    result.pagination = {
      page: 1,
      page_size: PAGE_SIZE_LINES,
      total_lines: estimatedTotalLines,
      total_pages: Math.ceil(estimatedTotalLines / PAGE_SIZE_LINES),
      estimated_tokens: estimatedTokens,
      hint: `Large file (${stats.size} bytes, ~${estimatedTokens} tokens). Showing first ${PAGE_SIZE_LINES} lines. Use range: {start: ${PAGE_SIZE_LINES + 1}, end: ${PAGE_SIZE_LINES * 2}} for the next page, or extract: "outline" for structure.`,
    };
    return result;
  }

  const buffer = await fs.readFile(resolved_path);
  if (isBinaryFile(buffer)) {
    result.error = 'Binary file — code_read only reads text content (outline/lines).';
    return result;
  }
  const content = buffer.toString('utf-8');
  const allLines = content.split('\n');
  result.line_count = allLines.length;

  // FileStateCache: content is ALWAYS served from the just-read disk state;
  // the cache only contributes freshness metadata (never a stub — issue 4).
  const lookup = cache.lookup(resolved_path, content, extract);
  if (!spec.force && lookup.status === 'unchanged') {
    result.cache_hit = true;
    result.cache = {
      status: 'unchanged',
      unchanged_since_last_read: true,
      read_count: lookup.entry.readCount,
      hash: lookup.entry.contentHash.substring(0, 8),
    };
    if (lookup.previousReadAt !== undefined) result.cache.last_read = formatTimeAgo(lookup.previousReadAt);
  } else if (!spec.force && lookup.status === 'modified') {
    result.cache = {
      status: 'modified',
      unchanged_since_last_read: false,
      previous_lines: lookup.previousLineCount,
      changes: lookup.changes,
      diff: lookup.diff,
      modified_by: lookup.modifiedBy,
      hash: lookup.entry.contentHash.substring(0, 8),
    };
  }

  let lines = allLines;
  let truncated = false;
  if (lineRange) {
    const start = Math.max(0, lineRange.start - 1);
    const end = Math.min(allLines.length, lineRange.end);
    lines = allLines.slice(start, end);
  }
  if (lines.length > maxLinesPerFile) {
    lines = lines.slice(0, maxLinesPerFile);
    truncated = true;
  }
  result.truncated = truncated;

  if (extract === 'lines') {
    result.lines = output.include_line_numbers
      ? lines.map((line, i) => `${String((lineRange?.start ?? 1) + i).padStart(5)} | ${line}`)
      : lines;
  } else {
    if (!isLanguageSupported(resolved_path)) {
      result.error = 'Outline extraction not supported for this file type.';
    } else {
      try {
        const treeSitter = getTreeSitter();
        const tree = await treeSitter.parse(content, resolved_path);
        result.outline = mapOutline(treeSitter.getOutline(tree, resolved_path));
      } catch (error) {
        // A missing native dep (web-tree-sitter not installed yet) degrades to
        // the standard setup-pointer message; any other parse failure keeps its
        // concrete reason. `lines` mode needs nothing native and is unaffected.
        result.error =
          error instanceof TreeSitterUnavailableError
            ? nativeDepMessage('code_read outline mode')
            : `Outline extraction failed: ${(error as Error).message}`;
      }
    }
  }

  return result;
}

/** Cost of a result for pagination bin-packing (excludes bookkeeping key). */
function resultCost(result: FileReadResult): number {
  const { result_key: _rk, ...rest } = result;
  return estimatePayloadTokens(JSON.stringify(rest));
}

/**
 * Split ONE oversized result's native array representation (`lines` or
 * `outline` — whichever the extract mode produced) into token-budgeted pages.
 * Never invents a field the extract mode didn't already produce (field issue
 * 6's one-representation rebuild).
 */
function paginateSingleResult(
  result: FileReadResult,
  tokenBudget: number,
  requestedPage: number,
): { page: FileReadResult; meta: { page: number; total_pages: number; tokens_used: number; warning?: string } } {
  const field: 'lines' | 'outline' | null = result.lines ? 'lines' : result.outline ? 'outline' : null;
  if (!field) {
    return { page: result, meta: { page: 1, total_pages: 1, tokens_used: resultCost(result) } };
  }
  const items = ((result as unknown as Record<string, unknown[]>)[field] as unknown[] | undefined) ?? [];
  const overheadEstimate = tokenBudget < 300 ? Math.floor(tokenBudget * 0.7) : Math.floor(tokenBudget * 0.6);
  const contentBudget = Math.max(tokenBudget - overheadEstimate, 5);

  const pages: unknown[][] = [];
  let current: unknown[] = [];
  let currentTokens = 0;
  for (const item of items) {
    const itemTokens = estimatePayloadTokens(typeof item === 'string' ? item : JSON.stringify(item));
    if (current.length === 0 || currentTokens + itemTokens <= contentBudget) {
      current.push(item);
      currentTokens += itemTokens;
    } else {
      pages.push(current);
      current = [item];
      currentTokens = itemTokens;
    }
  }
  if (current.length > 0) pages.push(current);

  const totalPages = Math.max(pages.length, 1);
  const pageIndex = Math.min(Math.max(requestedPage, 1), totalPages) - 1;
  const selected = pages[pageIndex] ?? [];

  const pageResult: FileReadResult = { ...result };
  (pageResult as unknown as Record<string, unknown[]>)[field] = selected;
  const tokensUsed = resultCost(pageResult);
  pageResult.token_cost = tokensUsed;

  let warning: string | undefined;
  if (requestedPage > totalPages) warning = `Requested page ${requestedPage} exceeds total pages (${totalPages}). Showing page ${totalPages} instead.`;
  else if (requestedPage < 1) warning = `Requested page ${requestedPage} is invalid. Showing page 1 instead.`;

  return { page: pageResult, meta: { page: pageIndex + 1, total_pages: totalPages, tokens_used: tokensUsed, warning } };
}

/** Bin-pack whole results across pages (first-fit), or split a lone oversized result. */
function paginateByTokenBudget(
  results: FileReadResult[],
  tokenBudget: number,
  requestedPage: number,
): {
  paginated: FileReadResult[];
  meta: { page: number; total_pages: number; pending_files: string[]; token_budget: number; tokens_used: number; budget_exceeded?: boolean; warning?: string };
} {
  if (results.length === 1) {
    const cost = resultCost(results[0]);
    if (cost > tokenBudget && (results[0].lines || results[0].outline)) {
      const { page, meta } = paginateSingleResult(results[0], tokenBudget, requestedPage);
      return {
        paginated: [page],
        meta: { page: meta.page, total_pages: meta.total_pages, pending_files: [], token_budget: tokenBudget, tokens_used: meta.tokens_used, warning: meta.warning },
      };
    }
  }

  const costs = results.map((r) => resultCost(r));
  results.forEach((r, i) => (r.token_cost = costs[i]));

  const pageGroups: number[][] = [];
  let current: number[] = [];
  let currentCost = 0;
  for (let i = 0; i < results.length; i++) {
    const cost = costs[i];
    if (current.length > 0 && currentCost + cost > tokenBudget) {
      pageGroups.push(current);
      current = [i];
      currentCost = cost;
    } else {
      current.push(i);
      currentCost += cost;
    }
  }
  if (current.length > 0) pageGroups.push(current);

  const totalPages = pageGroups.length || 1;
  const pageIndex = Math.min(requestedPage, totalPages) - 1;
  const selectedPage = pageGroups[pageIndex] ?? pageGroups[0] ?? [];
  const budgetExceeded = selectedPage.length === 1 && (costs[selectedPage[0]] ?? 0) > tokenBudget;

  let warning: string | undefined;
  if (requestedPage > totalPages) warning = `Requested page ${requestedPage} exceeds total pages (${totalPages}). Showing page ${totalPages} instead.`;

  const selectedSet = new Set(selectedPage);
  const pendingFiles = results.filter((_, i) => !selectedSet.has(i)).map((r) => r.path);
  const tokensUsed = selectedPage.reduce((sum, i) => sum + (costs[i] ?? 0), 0);

  return {
    paginated: selectedPage.map((i) => results[i]),
    meta: { page: pageIndex + 1, total_pages: totalPages, pending_files: pendingFiles, token_budget: tokenBudget, tokens_used: tokensUsed, budget_exceeded: budgetExceeded || undefined, warning },
  };
}

const definition: Tool = {
  name: 'code_read',
  description:
    'Read file structure (outline) or line ranges without pulling whole files into context. Batch-capable, ' +
    'cache-aware (a cache hit still returns the requested content), and token-budget paginated.',
  inputSchema: {
    type: 'object',
    properties: {
      files: {
        type: 'array',
        description: 'File paths, or specs for per-file extract/range/force/probe overrides',
        items: {
          oneOf: [
            { type: 'string' },
            {
              type: 'object',
              properties: {
                path: { type: 'string' },
                extract: { type: 'string', enum: ['outline', 'lines'] },
                range: { type: 'object', properties: { start: { type: 'number' }, end: { type: 'number' } }, required: ['start', 'end'] },
                force: { type: 'boolean' },
                probe: { type: 'boolean' },
              },
              required: ['path'],
            },
          ],
        },
      },
      extract: { type: 'string', enum: ['outline', 'lines'], default: 'lines' },
      base_path: { type: 'string', description: 'Root directory files resolve against; omitting it falls back to the server cwd with a warning.' },
      default_range: { type: 'object', properties: { start: { type: 'number' }, end: { type: 'number' } } },
      token_budget: { type: 'number', description: 'Bin-pack results across pages within this token budget' },
      page: { type: 'number', description: '1-indexed page to return (requires token_budget)' },
      force: { type: 'boolean', description: 'Bypass cache freshness metadata and the size gate for every file' },
      probe: { type: 'boolean', description: 'Freshness probe: metadata only, no content, for every file' },
      output: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['count_only', 'minimal', 'standard', 'verbose'], default: 'standard' },
          include_line_numbers: { type: 'boolean', default: false },
          include_metadata: { type: 'boolean', default: false },
          max_per_item: { type: 'number', description: 'Max lines per file (lines mode)' },
          max_tokens: { type: 'number' },
        },
      },
    },
    required: ['files'],
  },
};

/**
 * RULING (budget-partial design, see lane report): `core/proc`'s `withBudget`
 * supports a task returning a genuine partial result via the cooperative
 * `signal` it receives (code_surface does this for its single, monolithic
 * compiler pass). code_read's unit of work is a BATCH of independent
 * per-file reads (`Promise.all`); threading cooperative cancellation through
 * that batch to return whichever files finished would be a materially
 * bigger change for a batch that is typically fast. This wrapper keeps the
 * hard, safety-critical guarantee — the client never waits past
 * `search_ms` — via an honest `budget_exceeded` error instead of a partial
 * envelope; see the lane report for the tradeoff.
 */
export async function handler(args: unknown): Promise<CallToolResult> {
  const start = performance.now();
  const cfg = loadConfig();
  const outcome = await withBudget(cfg.budgets.search_ms, async () => runCodeRead(args));
  if (outcome.budget_exceeded) {
    return toCallToolResult(
      errorEnvelope('code_read exceeded its time budget before completing.', {
        execution_ms: Math.round(performance.now() - start),
        budget_exceeded: true,
      }),
    );
  }
  return outcome.value;
}

async function runCodeRead(args: unknown): Promise<CallToolResult> {
  const start = performance.now();
  const input = args as CodeReadInput;

  try {
    const { workDir, warning: baseWarning } = await resolveWorkDir(input.base_path);

    const files = ensureArray<string | FileReadSpec>(input.files) ?? [];
    if (files.length === 0) {
      return toCallToolResult(
        errorEnvelope("Missing required parameter 'files'. Expected: array of file paths or file specs.", {
          execution_ms: Math.round(performance.now() - start),
        }),
      );
    }

    const extract: ExtractMode = input.extract ?? 'lines';
    const rawOutput = (parseJsonField(input.output) ?? {}) as ReadOutput;
    const output: ReadOutput = {
      mode: rawOutput.mode ?? 'standard',
      include_line_numbers: rawOutput.include_line_numbers ?? false,
      include_metadata: rawOutput.include_metadata ?? false,
      max_per_item: rawOutput.max_per_item,
      max_tokens: rawOutput.max_tokens,
    };

    // token_budget requires the full content up front to paginate honestly.
    const forceRead = (input.token_budget !== undefined && input.token_budget > 0) || input.force === true;
    const fileSpecs: FileReadSpec[] = files.map((f) =>
      typeof f === 'string'
        ? { path: f, force: forceRead, probe: input.probe }
        : { force: forceRead || f.force, probe: input.probe ?? f.probe, ...f },
    );

    const results = await Promise.all(fileSpecs.map((spec) => readSingleFile(spec, extract, output, input.default_range, workDir)));

    // Key batch results by ENTRY, not path (field issue 3): a repeated path
    // with a different range/extract is a legitimate distinct entry.
    const pathCounts = new Map<string, number>();
    for (const r of results) pathCounts.set(r.path, (pathCounts.get(r.path) ?? 0) + 1);
    const usedKeys = new Set<string>();
    results.forEach((r, i) => {
      let key = r.path;
      if ((pathCounts.get(r.path) ?? 0) > 1) {
        const spec = fileSpecs[i];
        const entryRange = spec.range ?? input.default_range;
        const qualifier = entryRange ? `L${entryRange.start}-${entryRange.end}` : (spec.extract ?? extract);
        key = `${r.path}#${qualifier}`;
      }
      let uniqueKey = key;
      let suffix = 2;
      while (usedKeys.has(uniqueKey)) uniqueKey = `${key}#${suffix++}`;
      usedKeys.add(uniqueKey);
      r.result_key = uniqueKey;
    });

    let paginatedResults = results;
    let paginationMeta:
      | { page: number; total_pages: number; pending_files: string[]; token_budget: number; tokens_used: number; budget_exceeded?: boolean; warning?: string }
      | undefined;
    let paginationWarning: string | undefined;

    if (input.page !== undefined && input.page > 1 && (input.token_budget === undefined || input.token_budget <= 0)) {
      paginationWarning = 'page parameter is ignored without token_budget';
    }
    if (input.token_budget !== undefined && input.token_budget > 0) {
      const paginated = paginateByTokenBudget(results, input.token_budget, input.page ?? 1);
      paginatedResults = paginated.paginated;
      paginationMeta = paginated.meta;
    }

    const filesRead = paginatedResults.filter((r) => r.exists && !r.error).length;
    const filesNotFound = paginatedResults.filter((r) => !r.exists).length;
    const totalLines = paginatedResults.reduce((sum, r) => sum + (r.line_count ?? 0), 0);
    const anyTruncated = paginatedResults.some((r) => r.truncated);

    const summary: Record<string, unknown> = {
      files_read: filesRead,
      files_not_found: filesNotFound,
      total_lines: totalLines,
      truncated: anyTruncated,
      total_bytes: paginatedResults.reduce((sum, r) => sum + (r.size_bytes ?? 0), 0),
    };
    if (paginationMeta) summary.pagination = paginationMeta;
    if (paginationWarning) summary.warning = paginationWarning;

    const buildEntry = (r: FileReadResult, verbose: boolean): Record<string, unknown> => {
      const entry: Record<string, unknown> = { exists: r.exists };
      if (r.lines !== undefined) entry.lines = r.lines;
      if (r.outline !== undefined) entry.outline = r.outline;
      if (r.line_count !== undefined) entry.line_count = r.line_count;
      if (r.error) entry.error = r.error;
      if (r.status !== undefined) entry.status = r.status;
      if (r.truncated) entry.truncated = true;
      if (r.size_bytes !== undefined) entry.size_bytes = r.size_bytes;
      if (r.warning) entry.warning = r.warning;
      if (r.pagination) entry.pagination = r.pagination;
      if (r.cache) entry.cache = r.cache;
      if (r.cache_hit !== undefined) entry.cache_hit = r.cache_hit;
      if (r.probe) entry.probe = true;
      if (r.metadata) entry.metadata = r.metadata;
      if (verbose && r.token_cost !== undefined) entry.token_cost = r.token_cost;
      entry.resolved_path = r.resolved_path;
      return entry;
    };

    let data: unknown;
    switch (output.mode) {
      case 'count_only':
        data = { summary };
        break;
      case 'minimal':
        data = {
          files: Object.fromEntries(
            paginatedResults.map((r) => [
              r.result_key ?? r.path,
              { exists: r.exists, line_count: r.line_count, resolved_path: r.resolved_path, ...(r.error && { error: r.error }) },
            ]),
          ),
          summary,
        };
        break;
      case 'verbose':
        data = {
          files: Object.fromEntries(paginatedResults.map((r) => [r.result_key ?? r.path, buildEntry(r, true)])),
          summary,
          tokens_used: estimatePayloadTokens(JSON.stringify(paginatedResults)),
        };
        break;
      default:
        data = {
          files: Object.fromEntries(paginatedResults.map((r) => [r.result_key ?? r.path, buildEntry(r, false)])),
          summary,
          tokens_used: estimatePayloadTokens(JSON.stringify(paginatedResults)),
        };
    }

    // Enforce output.max_tokens: trim the largest outline/lines array and flag
    // truncation instead of returning an oversized payload (v1 only did this
    // for outline/symbols; v2 generalizes it to whichever array the extract
    // mode produced, since `lines` is now the primary workhorse mode).
    if (output.max_tokens !== undefined && output.max_tokens > 0) {
      const maxTokens = output.max_tokens;
      const ENVELOPE_OVERHEAD_CHARS = 220;
      const estimateRendered = (): number => Math.ceil((JSON.stringify(data).length + ENVELOPE_OVERHEAD_CHARS) / 3.5);
      let trimmedAny = false;
      while (estimateRendered() > maxTokens) {
        let largest: unknown[] | undefined;
        let owner: FileReadResult | undefined;
        for (const r of paginatedResults) {
          if (r.outline && r.outline.length > 0 && (!largest || r.outline.length > largest.length)) {
            largest = r.outline;
            owner = r;
          }
          if (r.lines && r.lines.length > 0 && (!largest || r.lines.length > largest.length)) {
            largest = r.lines;
            owner = r;
          }
        }
        if (!largest || !owner) break;
        largest.length = Math.floor(largest.length / 2);
        owner.truncated = true;
        trimmedAny = true;
      }
      if (trimmedAny) {
        summary.truncated = true;
        const dataObj = data as { files?: Record<string, Record<string, unknown>>; tokens_used?: number };
        if (dataObj.files) {
          for (const r of paginatedResults) {
            const key = r.result_key ?? r.path;
            if (r.truncated && dataObj.files[key]) dataObj.files[key].truncated = true;
          }
        }
        if (dataObj.tokens_used !== undefined) dataObj.tokens_used = estimatePayloadTokens(JSON.stringify(paginatedResults));
      }
    }

    const env: Envelope<unknown> = successEnvelope(data, { execution_ms: Math.round(performance.now() - start) });
    if (baseWarning) env.warning = baseWarning;
    return toCallToolResult(env);
  } catch (error) {
    return toCallToolResult(
      errorEnvelope((error as Error).message, { execution_ms: Math.round(performance.now() - start) }),
    );
  }
}

/** Registration entry consumed by `src/index.ts`. */
export const codeReadTool: ToolDefinition = { definition, handler };
