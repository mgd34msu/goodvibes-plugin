/**
 * Fuzzy matching utilities for precision-engine.
 * Extracted from precision-edit.ts for shared use.
 */

/**
 * Calculate Levenshtein edit distance between two strings.
 * Used for finding similar content when pattern matching fails.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity score between two strings (0-1 range).
 * Higher score means more similar.
 * Returns (longer.length - editDistance) / longer.length.
 */
export function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;

  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;

  if (longer.length === 0) return 1;
  if (longer.length > 500) return 0; // Skip expensive comparison for very long strings

  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * Rank candidates by similarity to a target string.
 * Compares basenames only (file names without directory path).
 * Returns sorted array with similarity scores (max 5 results).
 *
 * @param target - Target string to match against
 * @param candidates - Array of candidate strings
 * @param minSimilarity - Minimum similarity threshold (0-1, default 0.5)
 */
export function rankBySimilarity(
  target: string,
  candidates: string[],
  minSimilarity: number = 0.5
): Array<{ path: string; similarity: number }> {
  return candidates
    .map(c => ({
      path: c,
      similarity: calculateSimilarity(
        target.split('/').pop() || target,
        c.split('/').pop() || c
      )
    }))
    .filter(r => r.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5);
}
