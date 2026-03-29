import { describe, it, expect, vi } from 'vitest';
import { WRFCConfigStore, validateWRFCConfig } from '../wrfc-config-store.js';

// Mock logger to suppress output
vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('WRFCConfigStore', () => {
  it('returns an empty object before any config is set', () => {
    const store = new WRFCConfigStore();
    expect(store.get()).toEqual({});
  });

  it('stores and returns the provided config', () => {
    const store = new WRFCConfigStore();
    const config = { score_threshold: 8, max_fix_attempts: 3, auto_commit: false };
    store.set(config);
    expect(store.get()).toEqual(config);
  });

  it('replaces previous config when set is called again', () => {
    const store = new WRFCConfigStore();
    store.set({ score_threshold: 7 });
    store.set({ max_fix_attempts: 5 });
    expect(store.get()).toEqual({ max_fix_attempts: 5 });
  });

  it('get returns the same reference as was set', () => {
    const store = new WRFCConfigStore();
    const config = { score_threshold: 9 };
    store.set(config);
    expect(store.get()).toBe(config);
  });
});

describe('validateWRFCConfig', () => {
  // ─── score_threshold ───────────────────────────────────────────────────────

  it('accepts valid score_threshold (0)', () => {
    expect(validateWRFCConfig({ score_threshold: 0 })).toEqual({ score_threshold: 0 });
  });

  it('accepts valid score_threshold (10)', () => {
    expect(validateWRFCConfig({ score_threshold: 10 })).toEqual({ score_threshold: 10 });
  });

  it('accepts valid score_threshold (8.5)', () => {
    expect(validateWRFCConfig({ score_threshold: 8.5 })).toEqual({ score_threshold: 8.5 });
  });

  it('rejects score_threshold that is a string', () => {
    expect(validateWRFCConfig({ score_threshold: '8' })).toEqual({});
  });

  it('rejects score_threshold below 0', () => {
    expect(validateWRFCConfig({ score_threshold: -1 })).toEqual({});
  });

  it('rejects score_threshold above 10', () => {
    expect(validateWRFCConfig({ score_threshold: 11 })).toEqual({});
  });

  // ─── min_review_score legacy alias ────────────────────────────────────────────────

  it('accepts min_review_score as legacy alias for score_threshold', () => {
    expect(validateWRFCConfig({ min_review_score: 9.9 })).toEqual({ score_threshold: 9.9 });
  });

  it('prefers score_threshold over min_review_score when both present', () => {
    expect(validateWRFCConfig({ score_threshold: 8.0, min_review_score: 9.9 })).toEqual({ score_threshold: 8.0 });
  });

  // ─── max_fix_attempts ───────────────────────────────────────────────────────

  it('accepts valid max_fix_attempts (1)', () => {
    expect(validateWRFCConfig({ max_fix_attempts: 1 })).toEqual({ max_fix_attempts: 1 });
  });

  it('accepts valid max_fix_attempts (10)', () => {
    expect(validateWRFCConfig({ max_fix_attempts: 10 })).toEqual({ max_fix_attempts: 10 });
  });

  it('rejects max_fix_attempts of 0', () => {
    expect(validateWRFCConfig({ max_fix_attempts: 0 })).toEqual({});
  });

  it('rejects max_fix_attempts that is negative', () => {
    expect(validateWRFCConfig({ max_fix_attempts: -1 })).toEqual({});
  });

  it('rejects max_fix_attempts that is a float', () => {
    expect(validateWRFCConfig({ max_fix_attempts: 1.5 })).toEqual({});
  });

  it('rejects max_fix_attempts that is a string', () => {
    expect(validateWRFCConfig({ max_fix_attempts: '3' })).toEqual({});
  });

  // ─── auto_commit ────────────────────────────────────────────────────────────

  it('accepts auto_commit = true', () => {
    expect(validateWRFCConfig({ auto_commit: true })).toEqual({ auto_commit: true });
  });

  it('accepts auto_commit = false', () => {
    expect(validateWRFCConfig({ auto_commit: false })).toEqual({ auto_commit: false });
  });

  it('rejects auto_commit that is a string', () => {
    expect(validateWRFCConfig({ auto_commit: 'true' })).toEqual({});
  });

  it('rejects auto_commit that is a number', () => {
    expect(validateWRFCConfig({ auto_commit: 1 })).toEqual({});
  });

  // ─── require_review_types ───────────────────────────────────────────────────

  it('accepts require_review_types as a string array', () => {
    const value = ['security', 'performance'];
    expect(validateWRFCConfig({ require_review_types: value })).toEqual({
      require_review_types: value,
    });
  });

  it('accepts require_review_types as an empty array', () => {
    // An empty array passes the every() check
    expect(validateWRFCConfig({ require_review_types: [] })).toEqual({
      require_review_types: [],
    });
  });

  it('rejects require_review_types that is not an array', () => {
    expect(validateWRFCConfig({ require_review_types: 'security' })).toEqual({});
  });

  it('rejects require_review_types with empty string elements', () => {
    expect(validateWRFCConfig({ require_review_types: ['security', ''] })).toEqual({});
  });

  it('rejects require_review_types with non-string elements', () => {
    expect(validateWRFCConfig({ require_review_types: [42] })).toEqual({});
  });

  // ─── Unknown fields ─────────────────────────────────────────────────────────

  it('ignores unknown fields', () => {
    expect(validateWRFCConfig({ unknown_field: 'value', score_threshold: 8 })).toEqual({
      score_threshold: 8,
    });
  });

  it('returns empty object for entirely unrecognised config', () => {
    expect(validateWRFCConfig({ random_key: 99 })).toEqual({});
  });

  // ─── Field omission ─────────────────────────────────────────────────────────

  it('omits undefined fields rather than rejecting them', () => {
    // Only score_threshold is provided and valid
    expect(validateWRFCConfig({ score_threshold: 7 })).toEqual({ score_threshold: 7 });
  });

  it('accepts all valid fields together', () => {
    const raw = {
      score_threshold: 8,
      max_fix_attempts: 3,
      auto_commit: true,
      require_review_types: ['security'],
    };
    expect(validateWRFCConfig(raw)).toEqual(raw);
  });
});
