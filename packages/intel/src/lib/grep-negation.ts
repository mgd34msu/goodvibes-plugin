/**
 * Grep negation: find files that DON'T contain a pattern (convention
 * enforcement, components missing PropTypes, routes without auth, etc.).
 * Ported from v1 `precision-engine/src/utils/grep-negation.ts`.
 */

import * as path from 'path';
import { RipgrepCore } from './ripgrep.js';
import { DEFAULT_EXCLUDES } from './defaults.js';

export interface NegationResult {
  files: Array<{ file: string; resolved_path: string }>;
  total_files_without_match: number;
  total_files_scanned: number;
}

export interface NegationOptions {
  glob?: string;
  exclude?: string[];
  caseInsensitive?: boolean;
  wholeWord?: boolean;
  maxResults?: number;
  hidden?: boolean;
}

const ripgrepCore = new RipgrepCore();

/**
 * Find files that DON'T contain `pattern`: list candidates, list files WITH
 * the pattern, set-difference the two. Sorted for deterministic capped
 * membership across identical runs.
 */
export async function findFilesWithoutPattern(
  pattern: string,
  workDir: string,
  options: NegationOptions = {},
): Promise<NegationResult> {
  try {
    const excludePatterns = [...DEFAULT_EXCLUDES, ...(options.exclude ?? [])];
    const globPatterns = options.glob ? [options.glob] : undefined;

    const candidateFiles = await ripgrepCore.listFiles({
      path: workDir,
      patterns: globPatterns,
      exclude: excludePatterns,
      hidden: options.hidden,
    });

    if (candidateFiles.length === 0) {
      return { files: [], total_files_without_match: 0, total_files_scanned: 0 };
    }

    const candidateAbsolute = candidateFiles.map((f) => path.resolve(workDir, f));

    let filesWithPattern: Set<string>;
    try {
      const searchResult = await ripgrepCore.search({
        pattern,
        path: workDir,
        glob: options.glob,
        exclude: excludePatterns,
        hidden: options.hidden,
        caseInsensitive: options.caseInsensitive,
        wholeWord: options.wholeWord,
        maxCount: 1,
      });
      filesWithPattern = new Set(searchResult.matches.map((m) => path.resolve(workDir, m.file)));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('exit code 1') || msg.includes('No matches found')) {
        filesWithPattern = new Set();
      } else {
        throw error;
      }
    }

    const filesWithoutPattern = candidateAbsolute
      .filter((file) => !filesWithPattern.has(file))
      .sort((a, b) => a.localeCompare(b));

    if (filesWithoutPattern.length === 0) {
      return { files: [], total_files_without_match: 0, total_files_scanned: candidateFiles.length };
    }

    const maxResults = options.maxResults || filesWithoutPattern.length;
    const limitedFiles = filesWithoutPattern.slice(0, maxResults);
    const relativeFiles = limitedFiles.map((file) => ({
      file: path.relative(workDir, file),
      resolved_path: file,
    }));

    return {
      files: relativeFiles,
      total_files_without_match: filesWithoutPattern.length,
      total_files_scanned: candidateFiles.length,
    };
  } catch (error) {
    throw new Error(`Negation search failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
