/**
 * Workflow Guards
 *
 * Named guard functions used by workflow definitions.
 * Extracted from bootstrap.ts for testability and reuse.
 */

/**
 * Guard that checks whether the review score meets or exceeds the threshold.
 * Uses context.score_threshold as the threshold (default: 9.9).
 */
export function checkReviewScoreGuard(context: Record<string, unknown>): boolean {
  const threshold =
    typeof context.score_threshold === 'number' &&
    Number.isFinite(context.score_threshold as number)
      ? (context.score_threshold as number)
      : 9.9;
  return typeof context.review_score === 'number' && context.review_score >= threshold;
}
