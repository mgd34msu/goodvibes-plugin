/**
 * Grep negation utilities - Find files that DON'T contain a pattern
 * SPEC-v2 Item 12 Part D
 * 
 * Useful for convention enforcement:
 * - Find components missing PropTypes
 * - Find API routes without authentication
 * - Find files missing required imports/exports
 */

import * as path from 'path';
import { RipgrepCore } from '../core/ripgrep.js';
import { DEFAULT_EXCLUDES } from '../config.js';

// === Interfaces ===

export interface NegationResult {
  files: Array<{ file: string }>;
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

// === Singleton Instance ===

const ripgrepCore = new RipgrepCore();

// === Helper Functions ===

/**
 * Find files that DON'T contain a pattern.
 * 
 * Algorithm:
 * 1. List all candidate files (matching glob, respecting excludes)
 * 2. Find files WITH the pattern
 * 3. Set difference: candidates - files_with_pattern = files_without_pattern
 * 4. Apply maxResults limit
 * 
 * @param pattern - The pattern to search for (files WITHOUT this pattern will be returned)
 * @param workDir - Working directory (base path for search)
 * @param options - Search options (glob, exclude, case sensitivity, etc.)
 * @returns Result with files that don't contain the pattern
 */
export async function findFilesWithoutPattern(
  pattern: string,
  workDir: string,
  options: NegationOptions = {}
): Promise<NegationResult> {
  try {
    // Step 1: List all candidate files
    const excludePatterns = [...DEFAULT_EXCLUDES, ...(options.exclude || [])];
    const globPatterns = options.glob ? [options.glob] : undefined;

    const candidateFiles = await ripgrepCore.listFiles({
      path: workDir,
      patterns: globPatterns,
      exclude: excludePatterns,
      hidden: options.hidden,
    });

    // Edge case: No candidates found
    if (candidateFiles.length === 0) {
      return {
        files: [],
        total_files_without_match: 0,
        total_files_scanned: 0,
      };
    }

    // Normalize candidate paths to absolute for comparison
    const candidateAbsolute = candidateFiles.map(f => path.resolve(workDir, f));

    // Step 2: Find files WITH the pattern
    // Note: Using search() with maxCount: 1 instead of filesWithMatches() because
    // filesWithMatches() doesn't support caseInsensitive/wholeWord options.
    // maxCount: 1 ensures we stop after the first match per file for efficiency.
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
        maxCount: 1, // We only need to know if file has at least one match
      });

      // Extract unique file paths from matches and normalize to absolute
      filesWithPattern = new Set(
        searchResult.matches.map(m => path.resolve(workDir, m.file))
      );
    } catch (error) {
      // Ripgrep exits with code 1 when no matches found - that's expected
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('exit code 1') || msg.includes('No matches found')) {
        filesWithPattern = new Set();
      } else {
        throw error; // Real error - propagate it
      }
    }

    // Step 3: Set difference - files WITHOUT the pattern (using normalized absolute paths)
    // Sorted so that capped result membership is deterministic across runs.
    const filesWithoutPattern = candidateAbsolute
      .filter(file => !filesWithPattern.has(file))
      .sort((a, b) => a.localeCompare(b));

    // Edge case: All files match
    if (filesWithoutPattern.length === 0) {
      return {
        files: [],
        total_files_without_match: 0,
        total_files_scanned: candidateFiles.length,
      };
    }

    // Step 4: Apply maxResults limit and make paths relative
    const maxResults = options.maxResults || filesWithoutPattern.length;
    const limitedFiles = filesWithoutPattern.slice(0, maxResults);
    // Convert absolute paths back to relative for output
    const relativeFiles = limitedFiles.map(file => ({
      file: path.relative(workDir, file),
    }));

    return {
      files: relativeFiles,
      total_files_without_match: filesWithoutPattern.length,
      total_files_scanned: candidateFiles.length,
    };
  } catch (error) {
    throw new Error(
      `Negation search failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
