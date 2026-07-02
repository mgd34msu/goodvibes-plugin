/**
 * code_glob — token-efficient file finding with filters, presets, and
 * gitignore-aware excludes.
 *
 * Ported from v1 `precision-engine/src/handlers/precision-glob.ts`
 * (`PE/handlers/precision-glob.ts` per plan §4.1). Fixes carried in:
 *  - `respect_gitignore` actually reads the root `.gitignore` via
 *    `@goodvibes/core/fsx`'s real reader (fast-glob never did this natively).
 *  - `DEFAULT_EXCLUDES` is un-anchored (`**\/node_modules/**`), so nested
 *    node_modules (e.g. `packages/app/node_modules`) is excluded.
 *  - Honest counts above the 100-result cap: `summary.total_files` is the
 *    TRUE match count; `returned` is what the response actually contains;
 *    `truncated`/`effective_caps` are set only when trimming happened.
 *  - `base_path` (issue 1): every result echoes an absolute `resolved_path`.
 *  - `with_stats` + filters + sorting kept from v1.
 *
 * RULING (backend simplification, see lane report): v1 auto-selected
 * fast-glob over ripgrep for `has_content`-filtered or subdirectory-anchored
 * patterns (`dir/*.ts`), commented as "ripgrep cannot handle subdirectory
 * patterns" — verified false for ripgrep 13+ (`rg --files --glob 'dir/*.ts'`
 * resolves correctly; confirmed empirically in this workspace). `auto` and
 * `ripgrep` both now use the ripgrep listing unconditionally. `fast-glob` is
 * requestable explicitly for parity with v1's surface; if the package is not
 * installed (genuinely missing in this workspace — see report) the call
 * degrades to the ripgrep listing with a `warning` instead of failing.
 */

import * as fs from 'fs/promises';
import { Stats } from 'fs';
import * as path from 'path';
import {
  successEnvelope,
  errorEnvelope,
  toCallToolResult,
  estimatePayloadTokens,
  type Envelope,
} from '@goodvibes/core/envelope';
import { loadGitignorePatterns } from '@goodvibes/core/fsx';
import { withBudget } from '@goodvibes/core/proc';
import { loadConfig } from '@goodvibes/core/config';
import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from './types.js';
import { ensureArray, parseJsonField } from '../lib/args.js';
import { DEFAULT_EXCLUDES } from '../lib/defaults.js';
import { resolveWorkDir } from '../lib/workdir.js';
import { RipgrepCore } from '../lib/ripgrep.js';

const ripgrepCore = new RipgrepCore();
// Plain global `require`, not `createRequire(import.meta.url)` — see
// lib/ripgrep.ts's `resolveRgPath` doc for why: esbuild bundles this ESM
// source to CJS (build.mjs), and `import.meta` is empty in CJS output.
declare const require: (id: string) => unknown;

type FastGlobFn = (
  patterns: string[],
  options: Record<string, unknown>,
) => Promise<Array<string | { path: string; stats?: Stats | null }>>;

let fastGlobUnavailableWarned = false;
function loadFastGlob(): FastGlobFn | null {
  try {
    const mod = require('fast-glob') as { default?: FastGlobFn } & FastGlobFn;
    return (mod.default ?? mod) as FastGlobFn;
  } catch {
    return null;
  }
}

type GlobOutputMode = 'count_only' | 'paths_only' | 'with_stats' | 'with_preview';
type SortBy = 'name' | 'size' | 'modified';
type SortOrder = 'asc' | 'desc';
type GlobPreset = 'typescript' | 'javascript' | 'styles' | 'config' | 'tests' | 'all';
type GlobBackend = 'fast-glob' | 'ripgrep' | 'auto';

interface GlobFilters {
  min_size?: number;
  max_size?: number;
  modified_after?: string;
  modified_before?: string;
  has_content?: string;
  is_empty?: boolean;
}

interface GlobOutput {
  mode?: GlobOutputMode;
  format?: GlobOutputMode;
  max_results?: number;
  sort_by?: SortBy;
  sort_order?: SortOrder;
  preview_lines?: number;
  max_tokens?: number;
}

interface CodeGlobInput {
  patterns?: string[];
  patterns_base64?: string[];
  preset?: GlobPreset;
  exclude?: string[];
  filters?: GlobFilters;
  output?: GlobOutput;
  respect_gitignore?: boolean;
  follow_symlinks?: boolean;
  base_path?: string;
  backend?: GlobBackend;
  include_hidden?: boolean;
}

interface FileStats {
  size: number;
  modified: string;
  created?: string;
  is_symlink?: boolean;
}

interface GlobFileResult {
  path: string;
  resolved_path: string;
  stats?: FileStats;
  preview?: string[];
}

interface GlobEffectiveCaps {
  max_results?: number;
  max_tokens?: number;
}

const GLOB_PRESETS: Record<GlobPreset, string[]> = {
  typescript: ['**/*.ts', '**/*.tsx'],
  javascript: ['**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'],
  styles: ['**/*.css', '**/*.scss', '**/*.sass', '**/*.less', '**/*.styl'],
  config: ['**/*.json', '**/*.yaml', '**/*.yml', '**/*.toml', '**/*.xml', '**/*.ini'],
  tests: ['**/*.test.*', '**/*.spec.*', '**/__tests__/**/*', '**/tests/**/*', '**/test/**/*'],
  all: ['**/*'],
};

async function getFilePreview(filePath: string, lines: number): Promise<string[]> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content.split('\n').slice(0, lines);
  } catch {
    return [];
  }
}

/** Backend-agnostic file listing. ripgrep is the sole listing engine for `auto`/`ripgrep`; `fast-glob` degrades gracefully to ripgrep when unavailable. */
async function listCandidateFiles(
  backend: GlobBackend,
  workDir: string,
  patterns: string[],
  excludePatterns: string[],
  includeHidden: boolean,
  respectGitignore: boolean,
  followSymlinks: boolean,
): Promise<{ files: Array<{ path: string; stats: Stats | null }>; warning?: string }> {
  if (backend === 'fast-glob') {
    const fg = loadFastGlob();
    if (fg) {
      const raw = await fg(patterns, {
        cwd: workDir,
        ignore: excludePatterns,
        absolute: true,
        onlyFiles: true,
        followSymbolicLinks: followSymlinks,
        dot: includeHidden,
        stats: true,
      });
      return {
        files: raw.map((f) => (typeof f === 'string' ? { path: f, stats: null } : { path: f.path, stats: f.stats ?? null })),
      };
    }
    if (!fastGlobUnavailableWarned) fastGlobUnavailableWarned = true;
    // Fall through to the ripgrep listing, flagged via the returned warning.
  }

  try {
    const filePaths = await ripgrepCore.listFiles({
      path: workDir,
      patterns,
      exclude: excludePatterns,
      hidden: includeHidden,
      noIgnore: !respectGitignore,
    });
    const files = filePaths.map((p) => ({ path: p, stats: null }));
    return backend === 'fast-glob'
      ? {
          files,
          warning:
            "backend: 'fast-glob' was requested but the fast-glob package is not installed in this environment; " +
            'used the ripgrep listing instead (equivalent glob/exclude/hidden semantics).',
        }
      : { files };
  } catch (error) {
    throw new Error(`File listing failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const definition: Tool = {
  name: 'code_glob',
  description:
    'Find files by glob pattern(s) with size/date/content filters, sorting, and gitignore-aware excludes. ' +
    'Output modes: count_only, paths_only (default), with_stats, with_preview.',
  inputSchema: {
    type: 'object',
    properties: {
      patterns: { type: 'array', items: { type: 'string' }, description: 'Glob patterns, e.g. ["**/*.ts"]' },
      patterns_base64: { type: 'array', items: { type: 'string' }, description: 'Base64-encoded patterns (for patterns containing brackets etc.)' },
      preset: { type: 'string', enum: Object.keys(GLOB_PRESETS), description: 'Named pattern preset, used when patterns/patterns_base64 are omitted' },
      base_path: { type: 'string', description: 'Root directory to search from. Relative patterns resolve against it; omitting it falls back to the server cwd with a warning.' },
      exclude: { type: 'array', items: { type: 'string' }, description: 'Additional glob excludes' },
      respect_gitignore: { type: 'boolean', default: true, description: 'Apply DEFAULT_EXCLUDES and the root .gitignore of base_path' },
      follow_symlinks: { type: 'boolean', default: false },
      include_hidden: { type: 'boolean', default: true, description: 'Include dotfiles/dot-directories' },
      backend: { type: 'string', enum: ['ripgrep', 'fast-glob', 'auto'], default: 'auto' },
      filters: {
        type: 'object',
        properties: {
          min_size: { type: 'number' },
          max_size: { type: 'number' },
          modified_after: { type: 'string' },
          modified_before: { type: 'string' },
          has_content: { type: 'string', description: 'Pattern that file content must match (ripgrep-searched)' },
          is_empty: { type: 'boolean' },
        },
      },
      output: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['count_only', 'paths_only', 'with_stats', 'with_preview'], default: 'paths_only' },
          max_results: { type: 'number', default: 100 },
          sort_by: { type: 'string', enum: ['name', 'size', 'modified'] },
          sort_order: { type: 'string', enum: ['asc', 'desc'], default: 'asc' },
          preview_lines: { type: 'number', default: 3 },
          max_tokens: { type: 'number' },
        },
      },
    },
  },
};

/** Budget-partial design: see the ruling in `tools/code_read.ts`'s `handler` doc — same tradeoff applies here (batched listing/filtering work). */
export async function handler(args: unknown): Promise<CallToolResult> {
  const start = performance.now();
  const cfg = loadConfig();
  const outcome = await withBudget(cfg.budgets.search_ms, async (signal) => {
    return runCodeGlob(args, signal);
  });
  const elapsed = Math.round(performance.now() - start);
  if (outcome.budget_exceeded) {
    return toCallToolResult(
      errorEnvelope('code_glob exceeded its time budget before completing.', {
        execution_ms: elapsed,
        budget_exceeded: true,
      }),
    );
  }
  return outcome.value;
}

async function runCodeGlob(args: unknown, _signal: { aborted: boolean }): Promise<CallToolResult> {
  const start = performance.now();
  const input = args as CodeGlobInput;

  try {
    const { workDir, warning: baseWarning } = await resolveWorkDir(input.base_path);

    const patternsBase64 = ensureArray<string>(parseJsonField(input.patterns_base64));
    let patterns: string[] | undefined = patternsBase64
      ? patternsBase64.map((p) => {
          const decoded = Buffer.from(p, 'base64').toString('utf-8');
          return decoded.replace(/[[\]]/g, '\\$&');
        })
      : (ensureArray<string>(input.patterns) ?? undefined);

    if ((!patterns || patterns.length === 0) && input.preset) {
      patterns = GLOB_PRESETS[input.preset];
    }

    if (!patterns || patterns.length === 0) {
      return toCallToolResult(
        errorEnvelope(
          'One of patterns, patterns_base64, or preset is required. ' +
            `Available presets: ${Object.keys(GLOB_PRESETS).join(', ')}`,
          { execution_ms: Math.round(performance.now() - start) },
        ),
      );
    }

    const rawOutput = (parseJsonField(input.output) ?? {}) as GlobOutput;
    const mode: GlobOutputMode = rawOutput.mode ?? rawOutput.format ?? 'paths_only';
    const maxFiles = rawOutput.max_results ?? 100;
    const sortBy = rawOutput.sort_by ?? 'name';
    const sortOrder: SortOrder = rawOutput.sort_order ?? 'asc';
    const previewLines = rawOutput.preview_lines ?? 3;
    const maxTokens = rawOutput.max_tokens ?? Infinity;
    const respectGitignore = input.respect_gitignore ?? true;
    const followSymlinks = input.follow_symlinks ?? false;
    const includeHidden = input.include_hidden ?? true;
    const backend: GlobBackend = input.backend ?? 'auto';

    const gitignoreExcludes = respectGitignore ? await loadGitignorePatterns(workDir) : [];
    const excludePatterns = [
      ...(respectGitignore ? DEFAULT_EXCLUDES : []),
      ...gitignoreExcludes,
      ...(input.exclude ?? []),
      ...(includeHidden === false ? ['**/.*', '.*'] : []),
    ];

    const listed = await listCandidateFiles(
      backend,
      workDir,
      patterns,
      excludePatterns,
      includeHidden,
      respectGitignore,
      followSymlinks,
    );

    let files = listed.files;
    for (const file of files) {
      if (!file.stats) {
        try {
          file.stats = await fs.stat(file.path);
        } catch {
          files = files.filter((f) => f !== file);
        }
      }
    }

    if (input.filters?.min_size !== undefined) {
      files = files.filter((f) => f.stats && f.stats.size >= input.filters!.min_size!);
    }
    if (input.filters?.max_size !== undefined) {
      files = files.filter((f) => f.stats && f.stats.size <= input.filters!.max_size!);
    }
    if (input.filters?.modified_after) {
      const afterDate = new Date(input.filters.modified_after);
      files = files.filter((f) => f.stats && f.stats.mtime > afterDate);
    }
    if (input.filters?.modified_before) {
      const beforeDate = new Date(input.filters.modified_before);
      files = files.filter((f) => f.stats && f.stats.mtime < beforeDate);
    }
    if (input.filters?.is_empty !== undefined) {
      files = files.filter((f) => {
        const isEmpty = f.stats && f.stats.size === 0;
        return input.filters!.is_empty ? isEmpty : !isEmpty;
      });
    }
    if (input.filters?.has_content) {
      const matchingFiles = await ripgrepCore.filesWithMatches(
        input.filters.has_content,
        workDir,
        undefined,
        30000,
        includeHidden,
      );
      const matchingSet = new Set(
        matchingFiles.map((f) => path.normalize(path.isAbsolute(f) ? f : path.resolve(process.cwd(), f))),
      );
      files = files.filter((f) => {
        const abs = path.isAbsolute(f.path) ? f.path : path.resolve(workDir, f.path);
        return matchingSet.has(path.normalize(abs));
      });
    }

    files.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'name':
          comparison = a.path.localeCompare(b.path);
          break;
        case 'size':
          comparison = (a.stats?.size ?? 0) - (b.stats?.size ?? 0);
          break;
        case 'modified':
          comparison = (a.stats?.mtime?.getTime() ?? 0) - (b.stats?.mtime?.getTime() ?? 0);
          break;
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    const totalMatched = files.length;
    const truncatedByMaxFiles = files.length > maxFiles;
    files = files.slice(0, maxFiles);

    let totalTokens = 0;
    const results: GlobFileResult[] = [];
    let totalSize = 0;

    for (const file of files) {
      if (totalTokens >= maxTokens) break;
      const absolutePath = path.isAbsolute(file.path) ? file.path : path.resolve(workDir, file.path);
      const relativePath = path.relative(workDir, absolutePath);
      const result: GlobFileResult = { path: relativePath, resolved_path: absolutePath };
      totalSize += file.stats?.size ?? 0;

      if (mode === 'with_stats' || mode === 'with_preview') {
        if (file.stats) {
          result.stats = {
            size: file.stats.size,
            modified: file.stats.mtime.toISOString(),
            created: file.stats.birthtime?.toISOString(),
            is_symlink: file.stats.isSymbolicLink?.() ?? false,
          };
        }
      }
      if (mode === 'with_preview') {
        result.preview = await getFilePreview(absolutePath, previewLines);
        totalTokens += estimatePayloadTokens(result.preview.join('\n'));
      }
      totalTokens += estimatePayloadTokens(relativePath);
      results.push(result);
    }

    const truncatedByTokens = results.length < files.length;
    const truncated = truncatedByMaxFiles || truncatedByTokens;
    const effectiveCaps: GlobEffectiveCaps = {};
    if (truncatedByMaxFiles) effectiveCaps.max_results = maxFiles;
    if (truncatedByTokens && rawOutput.max_tokens !== undefined) effectiveCaps.max_tokens = rawOutput.max_tokens;

    const summary: {
      total_files: number;
      returned: number;
      total_size: number;
      truncated: boolean;
      effective_caps?: GlobEffectiveCaps;
    } = { total_files: totalMatched, returned: results.length, total_size: totalSize, truncated };
    if (truncated) summary.effective_caps = effectiveCaps;

    let data: unknown = { files: results.map((r) => r.path), summary, tokens_used: totalTokens };
    switch (mode) {
      case 'count_only':
        data = { summary, tokens_used: estimatePayloadTokens(JSON.stringify(summary)) };
        break;
      case 'paths_only':
        data = { files: results.map((r) => r.path), summary, tokens_used: totalTokens };
        break;
      case 'with_stats':
        data = { files: results.map((r) => ({ path: r.path, resolved_path: r.resolved_path, ...r.stats })), summary, tokens_used: totalTokens };
        break;
      case 'with_preview':
        data = { files: results, summary, tokens_used: totalTokens };
        break;
    }

    const warningParts = [baseWarning, listed.warning].filter((w): w is string => !!w);
    const env: Envelope<unknown> = successEnvelope(data, { execution_ms: Math.round(performance.now() - start) });
    if (warningParts.length > 0) env.warning = warningParts.join(' ');
    return toCallToolResult(env);
  } catch (error) {
    return toCallToolResult(
      errorEnvelope((error as Error).message, { execution_ms: Math.round(performance.now() - start) }),
    );
  }
}

/** Registration entry consumed by `src/index.ts`. */
export const codeGlobTool: ToolDefinition = { definition, handler };
