import { describe, it, expect } from 'vitest';
import { checkReviewScoreGuard } from '../guards.js';

describe('checkReviewScoreGuard', () => {
  // ─── Default threshold (9.5) ────────────────────────────────────────────────

  describe('default threshold (9.5)', () => {
    it('returns true when score meets default threshold exactly', () => {
      expect(checkReviewScoreGuard({ review_score: 9.5 })).toBe(true);
    });

    it('returns true when score exceeds default threshold', () => {
      expect(checkReviewScoreGuard({ review_score: 10 })).toBe(true);
      expect(checkReviewScoreGuard({ review_score: 9.9 })).toBe(true);
    });

    it('returns false when score is below default threshold', () => {
      expect(checkReviewScoreGuard({ review_score: 9.4 })).toBe(false);
      expect(checkReviewScoreGuard({ review_score: 0 })).toBe(false);
      expect(checkReviewScoreGuard({ review_score: -1 })).toBe(false);
    });
  });

  // ─── Custom threshold ───────────────────────────────────────────────────────

  describe('custom min_review_score threshold', () => {
    it('returns true when score meets custom threshold exactly', () => {
      expect(checkReviewScoreGuard({ review_score: 7, min_review_score: 7 })).toBe(true);
    });

    it('returns true when score exceeds custom threshold', () => {
      expect(checkReviewScoreGuard({ review_score: 8.5, min_review_score: 7 })).toBe(true);
    });

    it('returns false when score is below custom threshold', () => {
      expect(checkReviewScoreGuard({ review_score: 6.9, min_review_score: 7 })).toBe(false);
    });

    it('handles a threshold of 0', () => {
      expect(checkReviewScoreGuard({ review_score: 0, min_review_score: 0 })).toBe(true);
      expect(checkReviewScoreGuard({ review_score: -1, min_review_score: 0 })).toBe(false);
    });

    it('handles a threshold of 10 (maximum)', () => {
      expect(checkReviewScoreGuard({ review_score: 10, min_review_score: 10 })).toBe(true);
      expect(checkReviewScoreGuard({ review_score: 9.9, min_review_score: 10 })).toBe(false);
    });
  });

  // ─── Missing score ──────────────────────────────────────────────────────────

  describe('missing or invalid review_score', () => {
    it('returns false when review_score is missing', () => {
      expect(checkReviewScoreGuard({})).toBe(false);
    });

    it('returns false when review_score is a string', () => {
      expect(checkReviewScoreGuard({ review_score: '9.5' })).toBe(false);
    });

    it('returns false when review_score is null', () => {
      expect(checkReviewScoreGuard({ review_score: null })).toBe(false);
    });

    it('returns false when review_score is undefined', () => {
      expect(checkReviewScoreGuard({ review_score: undefined })).toBe(false);
    });
  });

  // ─── Invalid threshold falls back to 9.5 ───────────────────────────────────

  describe('invalid min_review_score falls back to default (9.5)', () => {
    it('falls back to 9.5 when min_review_score is a string', () => {
      // score 9.5 meets fallback threshold
      expect(checkReviewScoreGuard({ review_score: 9.5, min_review_score: 'high' })).toBe(true);
      expect(checkReviewScoreGuard({ review_score: 9.4, min_review_score: 'high' })).toBe(false);
    });

    it('falls back to 9.5 when min_review_score is null', () => {
      expect(checkReviewScoreGuard({ review_score: 9.5, min_review_score: null })).toBe(true);
      expect(checkReviewScoreGuard({ review_score: 9.4, min_review_score: null })).toBe(false);
    });

    it('falls back to 9.5 when min_review_score is Infinity', () => {
      // Infinity is not finite — falls back to 9.5
      expect(checkReviewScoreGuard({ review_score: 9.5, min_review_score: Infinity })).toBe(true);
      expect(checkReviewScoreGuard({ review_score: 9.4, min_review_score: Infinity })).toBe(false);
    });

    it('falls back to 9.5 when min_review_score is NaN', () => {
      expect(checkReviewScoreGuard({ review_score: 9.5, min_review_score: NaN })).toBe(true);
      expect(checkReviewScoreGuard({ review_score: 9.4, min_review_score: NaN })).toBe(false);
    });

    it('falls back to 9.5 when min_review_score is undefined', () => {
      expect(checkReviewScoreGuard({ review_score: 9.5, min_review_score: undefined })).toBe(true);
    });

    it('falls back to 9.5 when min_review_score is absent', () => {
      expect(checkReviewScoreGuard({ review_score: 9.5 })).toBe(true);
    });
  });

  // ─── Edge cases ─────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles an empty context object', () => {
      expect(checkReviewScoreGuard({})).toBe(false);
    });

    it('handles a context with extra unrelated fields', () => {
      expect(
        checkReviewScoreGuard({ review_score: 9.5, agent_id: 'abc', workflow_id: 'xyz' }),
      ).toBe(true);
    });
  });
});
