/**
 * Statistical summary for code_grep `output.mode: "stats"`.
 * Ported verbatim from v1 `precision-engine/src/utils/grep-stats.ts`.
 */

import * as path from 'path';

export interface DirectoryStats {
  matches: number;
  files: number;
}

export interface GrepStatsSummary {
  total_matches: number;
  total_files: number;
  by_directory: Record<string, DirectoryStats>;
  by_file_type: Record<string, number>;
  top_files: Array<{ file: string; matches: number }>;
  by_pattern?: Record<string, number>;
}

export interface GrepFileData {
  file: string;
  matches?: Array<{ content?: string }>;
  match_count?: number;
}

function getFileExtension(filePath: string): string {
  return path.extname(filePath) || '(no extension)';
}

function extractAlternationPatterns(pattern: string): string[] | null {
  if (!pattern.includes('|')) {return null;}
  if (/[[\]{}()\\]/.test(pattern.replace(/\|/g, ''))) {return null;}
  const subPatterns = pattern.split('|').map((p) => p.trim()).filter((p) => p.length > 0);
  return subPatterns.length > 1 ? subPatterns : null;
}

function countByPattern(files: GrepFileData[], subPatterns: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const pattern of subPatterns) {counts[pattern] = 0;}
  for (const file of files) {
    if (!file.matches) {continue;}
    for (const match of file.matches) {
      if (!match.content) {continue;}
      for (const pattern of subPatterns) {
        try {
          if (new RegExp(pattern, 'i').test(match.content)) {
            counts[pattern]++;
            break;
          }
        } catch {
          continue;
        }
      }
    }
  }
  return counts;
}

/** Compute a statistical summary of grep file results: per-directory, per-type, top files. */
export function computeStats(files: GrepFileData[], pattern?: string): GrepStatsSummary {
  const byDirectory: Record<string, DirectoryStats> = {};
  const byFileType: Record<string, number> = {};
  const topFiles: Array<{ file: string; matches: number }> = [];
  let totalMatches = 0;
  let totalFiles = 0;

  if (!files || files.length === 0) {
    return { total_matches: 0, total_files: 0, by_directory: {}, by_file_type: {}, top_files: [] };
  }

  for (const file of files) {
    const matchCount = file.match_count ?? file.matches?.length ?? 0;
    if (matchCount === 0) {continue;}
    totalFiles++;
    totalMatches += matchCount;

    const dir = path.dirname(file.file);
    byDirectory[dir] ??= { matches: 0, files: 0 };
    byDirectory[dir].matches += matchCount;
    byDirectory[dir].files++;

    const ext = getFileExtension(file.file);
    byFileType[ext] = (byFileType[ext] || 0) + matchCount;

    topFiles.push({ file: file.file, matches: matchCount });
  }

  topFiles.sort((a, b) => b.matches - a.matches);
  const result: GrepStatsSummary = {
    total_matches: totalMatches,
    total_files: totalFiles,
    by_directory: byDirectory,
    by_file_type: byFileType,
    top_files: topFiles.slice(0, 10),
  };

  if (pattern) {
    const subPatterns = extractAlternationPatterns(pattern);
    if (subPatterns) {result.by_pattern = countByPattern(files, subPatterns);}
  }

  return result;
}
