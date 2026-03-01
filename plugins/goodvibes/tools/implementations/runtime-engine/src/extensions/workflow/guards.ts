/**
 * Workflow Guards
 *
 * Named guard functions used by workflow definitions.
 * Extracted from bootstrap.ts for testability and reuse.
 */

/**
 * Guard that checks whether the review score meets or exceeds the threshold.
 * Uses context.min_review_score as the threshold (default: 9.5).
 */
export function checkReviewScoreGuard(context: Record<string, unknown>): boolean {
  const threshold =
    typeof context.min_review_score === 'number' &&
    Number.isFinite(context.min_review_score as number)
      ? (context.min_review_score as number)
      : 9.5;
  return typeof context.review_score === 'number' && context.review_score >= threshold;
}
