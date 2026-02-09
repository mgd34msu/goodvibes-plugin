/**
 * precision_glob handler - Token-efficient file finding with filters and preview
 * SPEC-v2 Section 13.1.3
 *
 * Features:
 * - Output modes: count_only, paths_only, with_stats, with_preview
 * - Filters: min_size, max_size, modified_after/before, has_content, is_empty
 * - gitignore support
 * - Symlink handling
 * - Preview content
 */

import fg from 'fast-glob';
import * as fs from 'fs/promises';
import { Stats } from 'fs';
import * as path from 'path';
import { startTimer } from '../logging.js';
import type { OutputMode } from '../types.js';
import { successResult, errorResult, parseOutputMode, toCallToolResult, ToolHandler, parseJsonField } from '../utils/index.js';
import { formatMissingParamError, formatInvalidValueError, createErrorResult } from '../utils/errors.js';
import { DEFAULT_EXCLUDES } from '../config.js';
import { warnDeprecatedParam } from '../utils/deprecation.js';
import { RipgrepCore } from '../core/ripgrep.js';
import { validateDirectoryPath } from '../utils/path-validation.js';


// === Ripgrep Instance ===

const ripgrepCore = new RipgrepCore();

// === Interfaces per SPEC-v2 ===

type GlobOutputMode = 'count_only' | 'paths_only' | 'with_stats' | 'with_preview';
type SortBy = 'name' | 'size' | 'modified';
type SortOrder = 'asc' | 'desc';
type GlobPreset = 'typescript' | 'javascript' | 'styles' | 'config' | 'tests' | 'all';

interface GlobFilters {
  min_size?: number;
  max_size?: number;
  modified_after?: string;
  modified_before?: string;
  has_content?: string;
  is_empty?: boolean;
}

interface GlobOutput {
  mode: GlobOutputMode;
  format?: GlobOutputMode; // Alias for mode (MCP schema uses format)
  // Standardized name (preferred)
  max_results?: number;
  // Deprecated name (backward compatibility)
  max_files?: number;
  sort_by?: SortBy;
  sort_order?: SortOrder;
  preview_lines?: number;
  max_tokens?: number;
}

interface PrecisionGlobInput {
  patterns?: string[];
  patterns_base64?: string[];
  preset?: GlobPreset;
  exclude?: string[];
  filters?: GlobFilters;
  output?: GlobOutput;
  respect_gitignore?: boolean;
  follow_symlinks?: boolean;
  base_path?: string;
  cwd?: string; // DEPRECATED: Use base_path instead
  output_mode?: OutputMode;
  backend?: 'fast-glob' | 'ripgrep' | 'auto'; // Default 'auto'
}

interface FileStats {
  size: number;
  modified: string;
  created?: string;
  is_symlink?: boolean;
}

interface GlobFileResult {
  path: string;
  stats?: FileStats;
  preview?: string[];
}

// === Helper Functions ===

function estimateTokens(str: string): number {
  return Math.ceil(str.length / 4);
}

async function listFilesWithRipgrep(
  basePath: string,
  patterns: string[],
  exclude: string[],
  timeoutMs?: number
): Promise<string[]> {
  return ripgrepCore.listFiles({
    path: basePath,
    patterns,
    exclude,
    timeoutMs: timeoutMs ?? 30000,
  });
}



async function getFilePreview(filePath: string, lines: number): Promise<string[]> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content.split('\n').slice(0, lines);
  } catch {
    return [];
  }
}

// === Preset Definitions ===

const GLOB_PRESETS: Record<GlobPreset, string[]> = {
  typescript: ['**/*.ts', '**/*.tsx'],
  javascript: ['**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'],
  styles: ['**/*.css', '**/*.scss', '**/*.sass', '**/*.less', '**/*.styl'],
  config: ['**/*.json', '**/*.yaml', '**/*.yml', '**/*.toml', '**/*.xml', '**/*.ini'],
  tests: [
    '**/*.test.*',
    '**/*.spec.*',
    '**/__tests__/**/*',
    '**/tests/**/*',      // Common convention
    '**/test/**/*',       // Mocha/common convention
  ],
  all: ['**/*'],
};

// === Main Handler ===

export const handlePrecisionGlob: ToolHandler = async (args: unknown) => {
  const getElapsed = startTimer();
  const rawInput = args as PrecisionGlobInput;
  const input = { ...rawInput, patterns: parseJsonField(rawInput.patterns) } as PrecisionGlobInput;
  const outputMode = parseOutputMode(args, "precision_glob");

  // Use base_path if provided, fall back to cwd (deprecated), or default to process.cwd()
  const rawWorkDir = input.base_path ?? input.cwd ?? process.cwd();

  // Warn if deprecated cwd is used
  if (input.cwd && !input.base_path) {
    warnDeprecatedParam('cwd', 'base_path', 'precision_glob');
  }

  try {
    const workDir = (input.base_path || input.cwd)
      ? await validateDirectoryPath(rawWorkDir, process.cwd())
      : rawWorkDir;
    // Decode patterns from base64 if provided
    // Note: Brackets [ ] are automatically escaped for literal matching.
    // Other glob chars like *, ?, {}, () work normally.
    let patterns = input.patterns_base64
      ? input.patterns_base64.map(p => {
          const decoded = Buffer.from(p, 'base64').toString('utf-8');
          // Only escape square brackets for literal matching
          // This allows base64 patterns to match filenames containing [ or ]
          // while still supporting common glob patterns like *.ts
          return decoded.replace(/[\[\]]/g, '\\$&');
        })
      : input.patterns;

    // Expand preset if patterns not provided (empty array or undefined)
    // Priority: patterns > patterns_base64 > preset
    if ((!patterns || patterns.length === 0) && input.preset) {
      patterns = GLOB_PRESETS[input.preset];
    }

    // Validate input - need either patterns or preset
    if (!patterns || !Array.isArray(patterns) || patterns.length === 0) {
      return toCallToolResult(errorResult(
        'One of patterns, patterns_base64, or preset is required. ' +
        'Available presets: typescript, javascript, styles, config, tests, all',
        outputMode,
        getElapsed()
      ));
    }

    // Apply defaults per schema (handlers must apply defaults, not just define them in schema)
    const output: GlobOutput = {
      ...input.output,  // spread FIRST so computed defaults always win
      mode: (input.output?.mode ?? (input.output as any)?.format ?? 'paths_only') as GlobOutputMode,
      // Support both new and old parameter names
      max_results: input.output?.max_results ?? input.output?.max_files ?? 100,
      max_files: input.output?.max_files ?? 100,
      sort_by: input.output?.sort_by,
      sort_order: input.output?.sort_order ?? 'asc',
      preview_lines: input.output?.preview_lines ?? 3,
      max_tokens: input.output?.max_tokens
    };
    // Warn about deprecated parameters
    if (output.max_files !== undefined && output.max_results === undefined) {
      warnDeprecatedParam('output.max_files', 'output.max_results', 'precision_glob');
    }

    // Support both new (max_results) and old (max_files) parameter names
    const maxFiles = output.max_results ?? output.max_files ?? 100;
    const sortBy = output.sort_by ?? 'name';
    const sortOrder = output.sort_order!;
    const previewLines = output.preview_lines!;
    const maxTokens = output.max_tokens ?? Infinity;
    const respectGitignore = input.respect_gitignore ?? true;
    const followSymlinks = input.follow_symlinks ?? false;

    // Build exclude patterns
    const excludePatterns = [
      ...(respectGitignore ? DEFAULT_EXCLUDES : []),
      ...(input.exclude ?? []),
    ];

    // Backend selection
    const backend = input.backend ?? 'auto';
    // Ripgrep cannot handle subdirectory patterns like 'dir/*.ts' - force fast-glob
    const hasSubdirPatterns = patterns.some(p => /^[^*?{}\[\]]+\//.test(p));
    const useRipgrep = backend === 'ripgrep' || 
      (backend === 'auto' && !input.filters?.has_content && !hasSubdirPatterns);

    // Find files using selected backend
    let rawFiles: Array<string | { path: string; stats: Stats | null }>;
    if (useRipgrep) {
      try {
        const filePaths = await listFilesWithRipgrep(workDir, patterns, excludePatterns);
        rawFiles = filePaths.map(path => ({ path, stats: null }));
      } catch (error) {
        // Fallback to fast-glob on error
        console.warn('[precision_glob] Ripgrep failed, falling back to fast-glob:', (error as Error).message);
        rawFiles = await fg(patterns, {
          cwd: workDir,
          ignore: excludePatterns,
          absolute: true,
          onlyFiles: true,
          followSymbolicLinks: followSymlinks,
          stats: true,
        });
      }
    } else {
      rawFiles = await fg(patterns, {
        cwd: workDir,
        ignore: excludePatterns,
        absolute: true,
        onlyFiles: true,
        followSymbolicLinks: followSymlinks,
        stats: true,
      });
    }

    // Apply filters
    let files: { path: string; stats: Stats | null }[] = rawFiles.map(f => ({
      path: typeof f === 'string' ? f : f.path,
      stats: typeof f === 'string' ? null : (f.stats ?? null),
    }));

    // Get stats if not already present
    for (const file of files) {
      if (!file.stats) {
        try {
          file.stats = await fs.stat(file.path);
        } catch {
          // Remove files we can't stat
          files = files.filter(f => f !== file);
        }
      }
    }

    // Apply size filters
    if (input.filters?.min_size !== undefined) {
      files = files.filter(f => f.stats && f.stats.size >= input.filters!.min_size!);
    }
    if (input.filters?.max_size !== undefined) {
      files = files.filter(f => f.stats && f.stats.size <= input.filters!.max_size!);
    }

    // Apply date filters
    if (input.filters?.modified_after) {
      const afterDate = new Date(input.filters.modified_after);
      files = files.filter(f => f.stats && f.stats.mtime > afterDate);
    }
    if (input.filters?.modified_before) {
      const beforeDate = new Date(input.filters.modified_before);
      files = files.filter(f => f.stats && f.stats.mtime < beforeDate);
    }

    // Apply empty filter
    if (input.filters?.is_empty !== undefined) {
      files = files.filter(f => {
        const isEmpty = f.stats && f.stats.size === 0;
        return input.filters!.is_empty ? isEmpty : !isEmpty;
      });
    }

    // Apply content filter (expensive - do last)
    if (input.filters?.has_content) {
      const matchingFiles = await ripgrepCore.filesWithMatches(
        input.filters.has_content,
        workDir,
        undefined,
        30000
      );
      // Normalize paths for comparison
      // filesWithMatches returns paths relative to workDir when workDir is passed as search path
      // Convert them to absolute paths for comparison with files array (which has absolute paths)
      const matchingSet = new Set(matchingFiles.map(f => {
        // Ripgrep may return absolute or relative paths depending on the search path used
        // If already absolute, use as-is; otherwise resolve relative to workDir
        return path.isAbsolute(f) ? f : path.resolve(workDir, f);
      }));
      files = files.filter(f => {
        // f.path may be absolute (from ripgrep) or relative (from fast-glob in some modes)
        // Normalize to absolute for comparison
        const normalizedPath = path.isAbsolute(f.path) ? f.path : path.resolve(workDir, f.path);
        return matchingSet.has(normalizedPath);
      });
    }

    // Sort files
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
          const aTime = a.stats?.mtime?.getTime() ?? 0;
          const bTime = b.stats?.mtime?.getTime() ?? 0;
          comparison = aTime - bTime;
          break;
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    // Limit files
    const truncated = files.length > maxFiles;
    files = files.slice(0, maxFiles);

    // Build results
    let totalTokens = 0;
    const results: GlobFileResult[] = [];
    let totalSize = 0;

    for (const file of files) {
      if (totalTokens >= maxTokens) break;

      const relativePath = path.relative(workDir, file.path);
      const result: GlobFileResult = { path: relativePath };

      totalSize += file.stats?.size ?? 0;

      // Add stats for with_stats and with_preview modes
      if (output.mode === 'with_stats' || output.mode === 'with_preview') {
        if (file.stats) {
          result.stats = {
            size: file.stats.size,
            modified: file.stats.mtime.toISOString(),
            created: file.stats.birthtime?.toISOString(),
            is_symlink: file.stats.isSymbolicLink?.() ?? false,
          };
        }
      }

      // Add preview for with_preview mode
      if (output.mode === 'with_preview') {
        result.preview = await getFilePreview(file.path, previewLines);
        totalTokens += estimateTokens(result.preview.join('\n'));
      }

      totalTokens += estimateTokens(relativePath);
      results.push(result);
    }

    // Build output based on mode
    const summary = {
      total_files: results.length,
      total_size: totalSize,
      truncated,
    };

    let data: unknown;
    switch (output.mode) {
      case 'count_only':
        data = {
          summary,
          tokens_used: estimateTokens(JSON.stringify(summary)),
        };
        break;

      case 'paths_only':
        data = {
          files: results.map(r => r.path),
          summary,
          tokens_used: totalTokens,
        };
        break;

      case 'with_stats':
        data = {
          files: results.map(r => ({ path: r.path, ...r.stats })),
          summary,
          tokens_used: totalTokens,
        };
        break;

      case 'with_preview':
        data = {
          files: results,
          summary,
          tokens_used: totalTokens,
        };
        break;

      default:
        data = {
          files: results.map(r => r.path),
          summary,
          tokens_used: totalTokens,
        };
    }

    return toCallToolResult(successResult(data, outputMode, getElapsed()));
  } catch (error) {
    return toCallToolResult(errorResult((error as Error).message, outputMode, getElapsed()));
  }
};
