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
    const config = { min_review_score: 8, max_fix_attempts: 3, auto_commit: false };
    store.set(config);
    expect(store.get()).toEqual(config);
  });

  it('replaces previous config when set is called again', () => {
    const store = new WRFCConfigStore();
    store.set({ min_review_score: 7 });
    store.set({ max_fix_attempts: 5 });
    expect(store.get()).toEqual({ max_fix_attempts: 5 });
  });

  it('get returns the same reference as was set', () => {
    const store = new WRFCConfigStore();
    const config = { min_review_score: 9 };
    store.set(config);
    expect(store.get()).toBe(config);
  });
});

describe('validateWRFCConfig', () => {
  // ─── min_review_score ───────────────────────────────────────────────────────

  it('accepts valid min_review_score (0)', () => {
    expect(validateWRFCConfig({ min_review_score: 0 })).toEqual({ min_review_score: 0 });
  });

  it('accepts valid min_review_score (10)', () => {
    expect(validateWRFCConfig({ min_review_score: 10 })).toEqual({ min_review_score: 10 });
  });

  it('accepts valid min_review_score (8.5)', () => {
    expect(validateWRFCConfig({ min_review_score: 8.5 })).toEqual({ min_review_score: 8.5 });
  });

  it('rejects min_review_score that is a string', () => {
    expect(validateWRFCConfig({ min_review_score: '8' })).toEqual({});
  });

  it('rejects min_review_score below 0', () => {
    expect(validateWRFCConfig({ min_review_score: -1 })).toEqual({});
  });

  it('rejects min_review_score above 10', () => {
    expect(validateWRFCConfig({ min_review_score: 11 })).toEqual({});
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
    expect(validateWRFCConfig({ unknown_field: 'value', min_review_score: 8 })).toEqual({
      min_review_score: 8,
    });
  });

  it('returns empty object for entirely unrecognised config', () => {
    expect(validateWRFCConfig({ random_key: 99 })).toEqual({});
  });

  // ─── Field omission ─────────────────────────────────────────────────────────

  it('omits undefined fields rather than rejecting them', () => {
    // Only min_review_score is provided and valid
    expect(validateWRFCConfig({ min_review_score: 7 })).toEqual({ min_review_score: 7 });
  });

  it('accepts all valid fields together', () => {
    const raw = {
      min_review_score: 8,
      max_fix_attempts: 3,
      auto_commit: true,
      require_review_types: ['security'],
    };
    expect(validateWRFCConfig(raw)).toEqual(raw);
  });
});
