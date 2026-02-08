/**
 * Search result ranking utilities for precision_grep.
 * Scores and ranks grep results by relevance instead of flat file-path ordering.
 */

import { FileStateCache } from '../state/file-cache.js';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import path from 'path';

/**
 * Ranked file with relevance scoring.
 */
export interface RankedFile {
  file: string;
  matches?: any[];
  match_count?: number;
  relevance: number;        // 0.0 - 1.0
  reasons: string[];         // e.g. ["exact match", "exported", "in cache"]
}

/**
 * Git timestamp cache for the session.
 * Map<absolutePath, unixTimestamp>
 */
const gitTimestampCache = new Map<string, number>();

/**
 * Ranking weights for different factors.
 */
const WEIGHTS = {
  EXACT_MATCH: 0.30,
  EXPORTED: 0.20,
  IN_CACHE: 0.20,
  GIT_RECENCY: 0.15,
  PATH_DEPTH: 0.15,
};

/**
 * Rank search results by relevance.
 * 
 * @param files - Array of files with optional matches
 * @param pattern - The search pattern used
 * @param workDir - Working directory for path resolution
 * @returns Sorted array of ranked files (descending by relevance)
 */
// Structurally compatible with GrepFileResult from precision-grep handler
export async function rankResults(
  files: Array<{
    file: string;
    matches?: Array<{ content?: string; highlight?: [number, number] }>;
    match_count?: number;
  }>,
  pattern: string,
  workDir: string
): Promise<RankedFile[]> {
  if (!files || files.length === 0) {
    return [];
  }

  const ranked: RankedFile[] = [];

  for (const fileEntry of files) {
    const absolutePath = resolve(workDir, fileEntry.file);
    const reasons: string[] = [];
    let score = 0;

    // Factor 1: Exact match vs partial (0.30)
    const exactMatchScore = scoreExactMatch(fileEntry.matches, pattern);
    if (exactMatchScore > 0) {
      score += exactMatchScore * WEIGHTS.EXACT_MATCH;
      reasons.push('exact match');
    }

    // Factor 2: Exported symbol (0.20)
    const exportedScore = scoreExported(fileEntry.matches);
    if (exportedScore > 0) {
      score += exportedScore * WEIGHTS.EXPORTED;
      reasons.push('exported');
    }

    // Factor 3: In FileStateCache (0.20)
    const cacheScore = scoreInCache(absolutePath);
    if (cacheScore > 0) {
      score += cacheScore * WEIGHTS.IN_CACHE;
      reasons.push('in cache');
    }

    // Factor 4: Recently modified (git) (0.15)
    const gitRecencyScore = scoreGitRecency(absolutePath);
    if (gitRecencyScore > 0) {
      score += gitRecencyScore * WEIGHTS.GIT_RECENCY;
      reasons.push('recently modified');
    }

    // Factor 5: File path depth (0.15)
    const pathDepthScore = scorePathDepth(fileEntry.file);
    score += pathDepthScore * WEIGHTS.PATH_DEPTH;
    if (pathDepthScore > 0.7) {
      reasons.push('shallow path');
    }

    ranked.push({
      file: fileEntry.file,
      matches: fileEntry.matches,
      match_count: fileEntry.match_count,
      relevance: Math.min(1.0, Math.max(0.0, score)),
      reasons,
    });
  }

  // Sort descending by relevance
  return ranked.sort((a, b) => b.relevance - a.relevance);
}

/**
 * Score exact matches: 1.0 if any match content exactly equals pattern, else 0.0.
 */
function scoreExactMatch(
  matches: Array<{ content?: string; highlight?: [number, number] }> | undefined,
  pattern: string
): number {
  if (!matches || matches.length === 0) {
    return 0;
  }

  for (const match of matches) {
    if (!match.content) continue;

    // Check if highlight portion exists and extract it
    if (match.highlight) {
      const [start, end] = match.highlight;
      const highlighted = match.content.substring(start, end);
      if (highlighted === pattern) {
        return 1.0;
      }
    }

    // Fallback: check entire content
    if (match.content.trim() === pattern.trim()) {
      return 1.0;
    }
  }

  return 0;
}

/**
 * Score exported symbols: 1.0 if any match line contains "export", else 0.0.
 */
function scoreExported(
  matches: Array<{ content?: string }> | undefined
): number {
  if (!matches || matches.length === 0) {
    return 0;
  }

  for (const match of matches) {
    if (!match.content) continue;

    // Check if line starts with "export" or contains " export "
    const trimmed = match.content.trim();
    if (trimmed.startsWith('export ') || trimmed.includes(' export ')) {
      return 1.0;
    }
  }

  return 0;
}

/**
 * Score cache presence: 1.0 if file is in FileStateCache, else 0.0.
 */
function scoreInCache(absolutePath: string): number {
  try {
    const cache = FileStateCache.getInstance();
    const entry = cache.getEntryInfo(absolutePath);
    return entry ? 1.0 : 0.0;
  } catch (error) {
    // FileStateCache may not be available in all contexts
    return 0.0;
  }
}

/**
 * Score git recency: normalize timestamp to 0-1 based on how recent the file was modified.
 * Uses a 90-day window: modifications within the last 90 days score higher.
 */
function scoreGitRecency(absolutePath: string): number {
  // Check session cache first
  if (gitTimestampCache.has(absolutePath)) {
    return normalizeGitTimestamp(gitTimestampCache.get(absolutePath)!);
  }

  try {
    // Get last commit timestamp for this file
    const result = execFileSync(
      'git',
      ['log', '--format=%at', '-1', '--', absolutePath],
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 1000 }
    ).trim();

    if (!result) {
      // File not in git or no commits
      gitTimestampCache.set(absolutePath, 0);
      return 0;
    }

    const timestamp = parseInt(result, 10);
    if (isNaN(timestamp)) {
      gitTimestampCache.set(absolutePath, 0);
      return 0;
    }

    gitTimestampCache.set(absolutePath, timestamp);
    return normalizeGitTimestamp(timestamp);
  } catch (error) {
    // Git command failed (not a git repo, command not available, etc.)
    gitTimestampCache.set(absolutePath, 0);
    return 0;
  }
}

/**
 * Normalize git timestamp to 0-1 score.
 * Recent modifications (within 90 days) score higher.
 */
function normalizeGitTimestamp(timestamp: number): number {
  if (timestamp === 0) return 0;

  const now = Math.floor(Date.now() / 1000); // Current Unix timestamp
  const ageSeconds = now - timestamp;
  const ninetyDaysSeconds = 90 * 24 * 60 * 60;

  if (ageSeconds < 0) {
    // Future timestamp (clock skew) — treat as recent
    return 1.0;
  }

  if (ageSeconds > ninetyDaysSeconds) {
    // Older than 90 days
    return 0;
  }

  // Linear decay: 0 days = 1.0, 90 days = 0.0
  return 1.0 - (ageSeconds / ninetyDaysSeconds);
}

/**
 * Score path depth: fewer segments = higher score.
 * Normalize: depth 1 = 1.0, depth 5+ = 0.0.
 */
function scorePathDepth(filePath: string): number {
  const depth = filePath.split(path.sep).length;

  if (depth <= 1) return 1.0;
  if (depth >= 5) return 0.0;

  // Linear interpolation: 1 → 1.0, 5 → 0.0
  return 1.0 - ((depth - 1) / 4);
}
