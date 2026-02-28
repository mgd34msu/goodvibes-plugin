import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseGvTestResult } from '../test-fix-handlers.js';

vi.mock('../gv-tag-parser.js', () => ({
  parseGvTag: vi.fn(),
}));

import { parseGvTag } from '../gv-tag-parser.js';
const mockParseGvTag = vi.mocked(parseGvTag);

beforeEach(() => {
  mockParseGvTag.mockReset();
});

describe('parseGvTestResult', () => {
  it('returns { passed: true, score: 10 } for GV tag with score 10', () => {
    mockParseGvTag.mockReturnValue({ found: true, data: { score: 10 } });
    expect(parseGvTestResult('<gv>{"score":10}</gv>')).toEqual({ passed: true, score: 10 });
  });

  it('returns { passed: false, score: 9.5 } for GV tag with score 9.5', () => {
    mockParseGvTag.mockReturnValue({ found: true, data: { score: 9.5 } });
    expect(parseGvTestResult('<gv>{"score":9.5}</gv>')).toEqual({ passed: false, score: 9.5 });
  });

  it('returns { passed: false, score: 0 } for GV tag with score 0', () => {
    mockParseGvTag.mockReturnValue({ found: true, data: { score: 0 } });
    expect(parseGvTestResult('<gv>{"score":0}</gv>')).toEqual({ passed: false, score: 0 });
  });

  it('falls through to regex heuristic when GV tag has no score field', () => {
    mockParseGvTag.mockReturnValue({ found: true, data: { files: ['foo.ts'] } });
    // No failure keywords — should pass via heuristic
    const result = parseGvTestResult('All checks complete.');
    expect(result).toEqual({ passed: true });
  });

  it('returns { passed: false } when no GV tag and text contains "FAIL"', () => {
    mockParseGvTag.mockReturnValue({ found: false, data: null });
    expect(parseGvTestResult('Test run: FAIL')).toEqual({ passed: false });
  });

  it('returns { passed: true } when no GV tag and text has no failure keywords', () => {
    mockParseGvTag.mockReturnValue({ found: false, data: null });
    expect(parseGvTestResult('All tests completed successfully.')).toEqual({ passed: true });
  });

  it('returns null for empty string', () => {
    expect(parseGvTestResult('')).toBeNull();
  });

  it('returns { passed: true, score: 10 } for GV tag with score 10 and count 42', () => {
    mockParseGvTag.mockReturnValue({ found: true, data: { score: 10, count: 42 } });
    expect(parseGvTestResult('<gv>{"score":10,"count":42}</gv>')).toEqual({ passed: true, score: 10 });
  });
});
