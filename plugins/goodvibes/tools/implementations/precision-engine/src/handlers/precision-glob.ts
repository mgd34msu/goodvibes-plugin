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
import { successResult, errorResult, parseOutputMode, toCallToolResult, ToolHandler } from '../utils/index.js';
import { formatMissingParamError, formatInvalidValueError, createErrorResult } from '../utils/errors.js';
import { DEFAULT_EXCLUDES } from '../config.js';

// === Interfaces per SPEC-v2 ===

type GlobOutputMode = 'count_only' | 'paths_only' | 'with_stats' | 'with_preview';
type SortBy = 'name' | 'size' | 'modified';
type SortOrder = 'asc' | 'desc';

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
  max_files?: number;
  sort_by?: SortBy;
  sort_order?: SortOrder;
  preview_lines?: number;
  max_tokens?: number;
}

interface PrecisionGlobInput {
  patterns: string[];
  exclude?: string[];
  filters?: GlobFilters;
  output: GlobOutput;
  respect_gitignore?: boolean;
  follow_symlinks?: boolean;
  output_mode?: OutputMode;
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

async function checkContentFilter(filePath: string, pattern: string): Promise<boolean> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const regex = new RegExp(pattern);
    return regex.test(content);
  } catch {
    return false;
  }
}

async function getFilePreview(filePath: string, lines: number): Promise<string[]> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content.split('\n').slice(0, lines);
  } catch {
    return [];
  }
}

// === Main Handler ===

export const handlePrecisionGlob: ToolHandler = async (args: unknown) => {
  const getElapsed = startTimer();
  const input = args as PrecisionGlobInput;
  const outputMode = parseOutputMode(args, "precision_glob");
  const workDir = process.cwd();

  try {
    // Validate input
    if (!input.patterns || !Array.isArray(input.patterns) || input.patterns.length === 0) {
      return toCallToolResult(errorResult('patterns array is required', outputMode, getElapsed()));
    }

    if (!input.output) {
      return toCallToolResult(errorResult('output configuration is required', outputMode, getElapsed()));
    }

    const maxFiles = input.output.max_files ?? 100;
    const sortBy = input.output.sort_by ?? 'name';
    const sortOrder = input.output.sort_order ?? 'asc';
    const previewLines = input.output.preview_lines ?? 3;
    const maxTokens = input.output.max_tokens ?? Infinity;
    const respectGitignore = input.respect_gitignore ?? true;
    const followSymlinks = input.follow_symlinks ?? false;

    // Build exclude patterns
    const excludePatterns = [
      ...(respectGitignore ? DEFAULT_EXCLUDES : []),
      ...(input.exclude ?? []),
    ];

    // Find files using fast-glob
    const rawFiles = await fg(input.patterns, {
      cwd: workDir,
      ignore: excludePatterns,
      absolute: true,
      onlyFiles: true,
      followSymbolicLinks: followSymlinks,
      stats: true,
    });

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
      const contentPattern = input.filters.has_content;
      const filtered: typeof files = [];
      for (const file of files) {
        if (await checkContentFilter(file.path, contentPattern)) {
          filtered.push(file);
        }
      }
      files = filtered;
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
      if (input.output.mode === 'with_stats' || input.output.mode === 'with_preview') {
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
      if (input.output.mode === 'with_preview') {
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
    switch (input.output.mode) {
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
