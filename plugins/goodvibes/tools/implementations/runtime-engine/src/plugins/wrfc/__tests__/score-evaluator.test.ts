import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockParseGvTag = vi.fn();
vi.mock('../../../extensions/directives/gv-tag-parser.js', () => ({
  parseGvTag: (...args: unknown[]) => mockParseGvTag(...args),
}));

// Import AFTER mocks
import { extractScore, parseScoreFromGvTag, evaluateScore } from '../score-evaluator.js';

// ─── extractScore ─────────────────────────────────────────────────────────────

describe('extractScore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no <gv> tag found
    mockParseGvTag.mockReturnValue({ found: false, data: null });
  });

  it('returns null for null input', () => {
    expect(extractScore(null)).toBeNull();
    // parseGvTag should not be called for null
    expect(mockParseGvTag).not.toHaveBeenCalled();
  });

  it('returns null for undefined input', () => {
    expect(extractScore(undefined)).toBeNull();
    expect(mockParseGvTag).not.toHaveBeenCalled();
  });

  it('returns null for empty string', () => {
    expect(extractScore('')).toBeNull();
    expect(mockParseGvTag).not.toHaveBeenCalled();
  });

  it('extracts score from <gv> tag when found', () => {
    mockParseGvTag.mockReturnValue({ found: true, data: { score: 8.5 } });
    expect(extractScore('some text <gv>{"score":8.5}</gv>')).toBe(8.5);
  });

  it('clamps score above 10 to 10 from <gv> tag', () => {
    mockParseGvTag.mockReturnValue({ found: true, data: { score: 15 } });
    expect(extractScore('<gv>{"score":15}</gv>')).toBe(10);
  });

  it('clamps score below 0 to 0 from <gv> tag', () => {
    mockParseGvTag.mockReturnValue({ found: true, data: { score: -3 } });
    expect(extractScore('<gv>{"score":-3}</gv>')).toBe(0);
  });

  it('falls back to legacy SCORE:N/10 regex when <gv> tag not found', () => {
    mockParseGvTag.mockReturnValue({ found: false, data: null });
    expect(extractScore('SCORE: 7.5/10')).toBe(7.5);
  });

  it('falls back to legacy regex when <gv> tag found but score is undefined', () => {
    mockParseGvTag.mockReturnValue({ found: true, data: { files: [] } });
    expect(extractScore('<gv>{"files":[]}</gv>\nSCORE: 6/10')).toBe(6);
  });

  it('returns null when neither gv tag nor legacy regex match', () => {
    mockParseGvTag.mockReturnValue({ found: false, data: null });
    expect(extractScore('no score anywhere')).toBeNull();
  });

  it('is case-insensitive for legacy regex (lowercase)', () => {
    mockParseGvTag.mockReturnValue({ found: false, data: null });
    expect(extractScore('score: 9/10')).toBe(9);
  });

  it('parses decimal from legacy regex', () => {
    mockParseGvTag.mockReturnValue({ found: false, data: null });
    expect(extractScore('SCORE: 9.9/10')).toBe(9.9);
  });

  it('returns score of exactly 0 from <gv> tag', () => {
    mockParseGvTag.mockReturnValue({ found: true, data: { score: 0 } });
    expect(extractScore('<gv>{"score":0}</gv>')).toBe(0);
  });

  it('returns score of exactly 10 from <gv> tag', () => {
    mockParseGvTag.mockReturnValue({ found: true, data: { score: 10 } });
    expect(extractScore('<gv>{"score":10}</gv>')).toBe(10);
  });
});

// ─── parseScoreFromGvTag ──────────────────────────────────────────────────────

describe('parseScoreFromGvTag', () => {
  it('returns null for non-JSON input', () => {
    expect(parseScoreFromGvTag('not json', 9.5)).toBeNull();
  });

  it('returns null when score is not a number', () => {
    expect(parseScoreFromGvTag('{"score":"eight"}', 9.5)).toBeNull();
  });

  it('returns null when score field is missing', () => {
    expect(parseScoreFromGvTag('{"files":[]}', 9.5)).toBeNull();
  });

  it('returns null for empty JSON object', () => {
    expect(parseScoreFromGvTag('{}', 9.5)).toBeNull();
  });

  it('returns ScoreResult with pass=true when score meets threshold', () => {
    const result = parseScoreFromGvTag('{"score":9.5}', 9.5);
    expect(result).not.toBeNull();
    expect(result!.score).toBe(9.5);
    expect(result!.pass).toBe(true);
  });

  it('returns ScoreResult with pass=true when score exceeds threshold', () => {
    const result = parseScoreFromGvTag('{"score":10}', 8.0);
    expect(result!.pass).toBe(true);
    expect(result!.score).toBe(10);
  });

  it('returns ScoreResult with pass=false when score is below threshold', () => {
    const result = parseScoreFromGvTag('{"score":7}', 9.5);
    expect(result!.pass).toBe(false);
    expect(result!.score).toBe(7);
  });

  it('clamps score above 10 to 10', () => {
    const result = parseScoreFromGvTag('{"score":12}', 9.5);
    expect(result!.score).toBe(10);
    expect(result!.pass).toBe(true);
  });

  it('clamps score below 0 to 0', () => {
    const result = parseScoreFromGvTag('{"score":-2}', 5);
    expect(result!.score).toBe(0);
    expect(result!.pass).toBe(false);
  });

  it('sets issues_count from count field when present', () => {
    const result = parseScoreFromGvTag('{"score":8,"count":3}', 7);
    expect(result!.issues_count).toBe(3);
  });

  it('does not set issues_count when count field is absent', () => {
    const result = parseScoreFromGvTag('{"score":8}', 7);
    expect(result!.issues_count).toBeUndefined();
  });

  it('does not set issues_count when count is not a number', () => {
    const result = parseScoreFromGvTag('{"score":8,"count":"five"}', 7);
    expect(result!.issues_count).toBeUndefined();
  });

  it('returns pass=true when score equals threshold exactly (boundary)', () => {
    const result = parseScoreFromGvTag('{"score":5}', 5);
    expect(result!.pass).toBe(true);
  });

  it('returns pass=false when score is one decimal below threshold', () => {
    const result = parseScoreFromGvTag('{"score":4.9}', 5);
    expect(result!.pass).toBe(false);
  });
});

// ─── evaluateScore ────────────────────────────────────────────────────────────

describe('evaluateScore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParseGvTag.mockReturnValue({ found: false, data: null });
  });

  it('returns score=-1 pass=false for non-string input (number)', () => {
    const result = evaluateScore(42, 9.5);
    expect(result.score).toBe(-1);
    expect(result.pass).toBe(false);
  });

  it('returns score=-1 pass=false for non-string input (null)', () => {
    const result = evaluateScore(null, 9.5);
    expect(result.score).toBe(-1);
    expect(result.pass).toBe(false);
  });

  it('returns score=-1 pass=false for non-string input (object)', () => {
    const result = evaluateScore({ score: 10 }, 9.5);
    expect(result.score).toBe(-1);
    expect(result.pass).toBe(false);
  });

  it('returns score=-1 pass=false when score cannot be parsed from string', () => {
    mockParseGvTag.mockReturnValue({ found: false, data: null });
    const result = evaluateScore('no score here', 9.5);
    expect(result.score).toBe(-1);
    expect(result.pass).toBe(false);
  });

  it('returns pass=true when score meets threshold', () => {
    mockParseGvTag.mockReturnValue({ found: true, data: { score: 9.5 } });
    const result = evaluateScore('output with score', 9.5);
    expect(result.score).toBe(9.5);
    expect(result.pass).toBe(true);
  });

  it('returns pass=false when score is below threshold', () => {
    mockParseGvTag.mockReturnValue({ found: true, data: { score: 7.0 } });
    const result = evaluateScore('output with score', 9.5);
    expect(result.score).toBe(7.0);
    expect(result.pass).toBe(false);
  });

  it('falls back to legacy regex when <gv> tag not found', () => {
    mockParseGvTag.mockReturnValue({ found: false, data: null });
    const result = evaluateScore('SCORE: 8/10', 7.0);
    expect(result.score).toBe(8);
    expect(result.pass).toBe(true);
  });

  it('returns pass=true when score equals threshold exactly (boundary)', () => {
    mockParseGvTag.mockReturnValue({ found: true, data: { score: 5 } });
    const result = evaluateScore('text', 5);
    expect(result.pass).toBe(true);
  });
});
