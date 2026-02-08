/**
 * Statistical summary utilities for precision_grep results.
 * Provides per-directory breakdown, file-type distribution, top files, and pattern analysis.
 */

import * as path from 'path';

/**
 * Statistics for a directory.
 */
export interface DirectoryStats {
  /** Total matches found in this directory */
  matches: number;
  /** Number of files with matches in this directory */
  files: number;
}

/**
 * Statistical summary of grep results.
 */
export interface GrepStatsSummary {
  /** Total matches across all files */
  total_matches: number;
  /** Total files with matches */
  total_files: number;
  /** Per-directory breakdown */
  by_directory: Record<string, DirectoryStats>;
  /** File type distribution - counts by extension. Named 'by_file_type' (more descriptive than spec 'by_type') */
  by_file_type: Record<string, number>;
  /** Top 10 files by match count */
  top_files: Array<{ file: string; matches: number }>;
  /** Per-pattern breakdown for alternation patterns (pattern -> count) */
  by_pattern?: Record<string, number>;
}

/**
 * Input file data for statistics computation.
 */
export interface GrepFileData {
  file: string;
  matches?: Array<{ content?: string }>;
  match_count?: number;
}

/**
 * Extracts file extension from a file path.
 * Returns empty string for files without extension.
 */
function getFileExtension(filePath: string): string {
  const ext = path.extname(filePath);
  return ext || '(no extension)';
}

/**
 * Attempts to split an alternation pattern and extract sub-patterns.
 * Returns null if pattern is too complex or doesn't contain alternation.
 */
function extractAlternationPatterns(pattern: string): string[] | null {
  // Only handle simple alternation patterns (no nested groups, etc.)
  if (!pattern.includes('|')) {
    return null;
  }

  // Skip if pattern contains complex regex constructs
  if (/[\[\]{}()\\]/.test(pattern.replace(/\|/g, ''))) {
    return null;
  }

  // Simple split on |
  const subPatterns = pattern.split('|').map(p => p.trim()).filter(p => p.length > 0);
  return subPatterns.length > 1 ? subPatterns : null;
}

/**
 * Attempts to count matches for each sub-pattern in an alternation.
 * Best-effort: tests each match content against each sub-pattern.
 */
function countByPattern(
  files: GrepFileData[],
  subPatterns: string[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  
  // Initialize counts
  for (const pattern of subPatterns) {
    counts[pattern] = 0;
  }

  // Test each match against each sub-pattern
  for (const file of files) {
    if (!file.matches) {
      continue;
    }

    for (const match of file.matches) {
      if (!match.content) {
        continue;
      }

      // Try to match against each sub-pattern
      for (const pattern of subPatterns) {
        try {
          // Escape special regex characters except what's explicitly in the pattern
          const regex = new RegExp(pattern, 'i');
          if (regex.test(match.content)) {
            counts[pattern]++;
            break; // Count once per match (first matching pattern)
          }
        } catch {
          // Ignore regex errors - pattern might not be valid regex
          continue;
        }
      }
    }
  }

  return counts;
}

/**
 * Computes statistical summary of grep results.
 * 
 * @param files - Array of files with match data
 * @param pattern - Optional pattern string for alternation analysis
 * @returns Statistical summary with breakdowns by directory, file type, and top files
 */
export function computeStats(
  files: GrepFileData[],
  pattern?: string
): GrepStatsSummary {
  const byDirectory: Record<string, DirectoryStats> = {};
  const byFileType: Record<string, number> = {};
  const topFiles: Array<{ file: string; matches: number }> = [];
  
  let totalMatches = 0;
  let totalFiles = 0;

  // Handle empty input
  if (!files || files.length === 0) {
    return {
      total_matches: 0,
      total_files: 0,
      by_directory: {},
      by_file_type: {},
      top_files: [],
    };
  }

  // Process each file
  for (const file of files) {
    // Get match count (prefer match_count, fall back to matches.length)
    const matchCount = file.match_count ?? file.matches?.length ?? 0;
    
    if (matchCount === 0) {
      continue;
    }

    totalFiles++;
    totalMatches += matchCount;

    // Update directory stats
    const dir = path.dirname(file.file);
    if (!byDirectory[dir]) {
      byDirectory[dir] = { matches: 0, files: 0 };
    }
    byDirectory[dir].matches += matchCount;
    byDirectory[dir].files++;

    // Update file type stats
    const ext = getFileExtension(file.file);
    byFileType[ext] = (byFileType[ext] || 0) + matchCount;

    // Add to top files list
    topFiles.push({ file: file.file, matches: matchCount });
  }

  // Sort top files by match count descending, take top 10
  topFiles.sort((a, b) => b.matches - a.matches);
  const top10 = topFiles.slice(0, 10);

  // Build result
  const result: GrepStatsSummary = {
    total_matches: totalMatches,
    total_files: totalFiles,
    by_directory: byDirectory,
    by_file_type: byFileType,
    top_files: top10,
  };

  // Attempt pattern analysis if pattern provided
  if (pattern) {
    const subPatterns = extractAlternationPatterns(pattern);
    if (subPatterns) {
      result.by_pattern = countByPattern(files, subPatterns);
    }
  }

  return result;
}
