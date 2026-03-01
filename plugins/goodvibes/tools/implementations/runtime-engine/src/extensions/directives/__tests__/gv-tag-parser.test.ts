import { describe, it, expect } from 'vitest';
import {
  parseGvTag,
  parseAllGvTags,
  extractReviewScore,
  extractFiles,
} from '../gv-tag-parser.js';

// ─── parseGvTag ──────────────────────────────────────────────────────────────

describe('parseGvTag', () => {
  // ─── Null / undefined / empty input ────────────────────────────────────────

  it('returns not-found for null input', () => {
    const result = parseGvTag(null);
    expect(result.found).toBe(false);
    expect(result.data).toBeNull();
  });

  it('returns not-found for undefined input', () => {
    const result = parseGvTag(undefined);
    expect(result.found).toBe(false);
    expect(result.data).toBeNull();
  });

  it('returns not-found for empty string', () => {
    const result = parseGvTag('');
    expect(result.found).toBe(false);
    expect(result.data).toBeNull();
  });

  it('returns not-found when no <gv> tag is present', () => {
    const result = parseGvTag('Some output without any gv tag.');
    expect(result.found).toBe(false);
    expect(result.data).toBeNull();
  });

  // ─── Valid tag parsing ──────────────────────────────────────────────────────

  it('parses a valid tag with score field', () => {
    const result = parseGvTag('<gv>{"score":8.5}</gv>');
    expect(result.found).toBe(true);
    expect(result.data).not.toBeNull();
    expect(result.data!.score).toBe(8.5);
    expect(result.raw).toBe('{"score":8.5}');
  });

  it('parses a valid tag with files field', () => {
    const result = parseGvTag('<gv>{"files":["src/a.ts","src/b.ts"]}</gv>');
    expect(result.found).toBe(true);
    expect(result.data!.files).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('parses a valid tag with count field', () => {
    const result = parseGvTag('<gv>{"count":42}</gv>');
    expect(result.found).toBe(true);
    expect(result.data!.count).toBe(42);
  });

  it('parses a valid tag with all known fields', () => {
    const result = parseGvTag('<gv>{"score":9,"files":["f.ts"],"count":3}</gv>');
    expect(result.found).toBe(true);
    expect(result.data!.score).toBe(9);
    expect(result.data!.files).toEqual(['f.ts']);
    expect(result.data!.count).toBe(3);
  });

  it('preserves unknown fields in index signature', () => {
    const result = parseGvTag('<gv>{"score":7,"custom_field":"hello"}</gv>');
    expect(result.found).toBe(true);
    expect(result.data!['custom_field']).toBe('hello');
  });

  it('handles tag embedded in surrounding text', () => {
    const result = parseGvTag('Some output before\n<gv>{"score":9.5}</gv>\nSome text after');
    expect(result.found).toBe(true);
    expect(result.data!.score).toBe(9.5);
  });

  it('trims whitespace inside tag content', () => {
    const result = parseGvTag('<gv>  {"score":5}  </gv>');
    expect(result.found).toBe(true);
    expect(result.data!.score).toBe(5);
  });

  // ─── Score clamping ─────────────────────────────────────────────────────────

  it('clamps score above 10 to 10', () => {
    const result = parseGvTag('<gv>{"score":15}</gv>');
    expect(result.found).toBe(true);
    expect(result.data!.score).toBe(10);
  });

  it('clamps score below 0 to 0', () => {
    const result = parseGvTag('<gv>{"score":-5}</gv>');
    expect(result.found).toBe(true);
    expect(result.data!.score).toBe(0);
  });

  it('allows score of exactly 0', () => {
    const result = parseGvTag('<gv>{"score":0}</gv>');
    expect(result.found).toBe(true);
    expect(result.data!.score).toBe(0);
  });

  it('allows score of exactly 10', () => {
    const result = parseGvTag('<gv>{"score":10}</gv>');
    expect(result.found).toBe(true);
    expect(result.data!.score).toBe(10);
  });

  // ─── Files field filtering ──────────────────────────────────────────────────

  it('filters non-string values from files array', () => {
    const result = parseGvTag('<gv>{"files":["a.ts",123,null,"b.ts"]}</gv>');
    expect(result.found).toBe(true);
    expect(result.data!.files).toEqual(['a.ts', 'b.ts']);
  });

  it('returns empty files array when files is empty', () => {
    const result = parseGvTag('<gv>{"files":[]}</gv>');
    expect(result.found).toBe(true);
    expect(result.data!.files).toEqual([]);
  });

  it('ignores files field when not an array', () => {
    const result = parseGvTag('<gv>{"files":"not-an-array"}</gv>');
    expect(result.found).toBe(true);
    expect(result.data!.files).toBeUndefined();
  });

  it('ignores score field when not a number', () => {
    const result = parseGvTag('<gv>{"score":"not-a-number"}</gv>');
    expect(result.found).toBe(true);
    expect(result.data!.score).toBeUndefined();
  });

  // ─── Malformed / invalid JSON ───────────────────────────────────────────────

  it('returns found=true data=null for malformed JSON in tag', () => {
    const result = parseGvTag('<gv>{not valid json}</gv>');
    expect(result.found).toBe(true);
    expect(result.data).toBeNull();
  });

  it('returns found=true data=null when tag contains a JSON array (not object)', () => {
    const result = parseGvTag('<gv>[1,2,3]</gv>');
    expect(result.found).toBe(true);
    expect(result.data).toBeNull();
  });

  it('returns found=true data=null when tag contains a JSON string', () => {
    const result = parseGvTag('<gv>"just a string"</gv>');
    expect(result.found).toBe(true);
    expect(result.data).toBeNull();
  });

  it('returns found=true data=null when tag contains a JSON number', () => {
    const result = parseGvTag('<gv>42</gv>');
    expect(result.found).toBe(true);
    expect(result.data).toBeNull();
  });

  it('returns found=true data=null when tag contains null JSON value', () => {
    const result = parseGvTag('<gv>null</gv>');
    expect(result.found).toBe(true);
    expect(result.data).toBeNull();
  });

  it('returns found=true data=null when tag contains empty content', () => {
    const result = parseGvTag('<gv></gv>');
    expect(result.found).toBe(true);
    expect(result.data).toBeNull();
  });

  // ─── Only first tag is returned ─────────────────────────────────────────────

  it('returns only the first tag when multiple are present', () => {
    const result = parseGvTag('<gv>{"score":7}</gv> some text <gv>{"score":9}</gv>');
    expect(result.found).toBe(true);
    expect(result.data!.score).toBe(7);
  });
});

// ─── parseAllGvTags ────────────────────────────────────────────────────────────

describe('parseAllGvTags', () => {
  it('returns empty array for null input', () => {
    expect(parseAllGvTags(null)).toEqual([]);
  });

  it('returns empty array for undefined input', () => {
    expect(parseAllGvTags(undefined)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseAllGvTags('')).toEqual([]);
  });

  it('returns empty array when no tags are present', () => {
    expect(parseAllGvTags('no tags here')).toEqual([]);
  });

  it('returns single result for single tag', () => {
    const results = parseAllGvTags('<gv>{"score":8}</gv>');
    expect(results).toHaveLength(1);
    expect(results[0].found).toBe(true);
    expect(results[0].data!.score).toBe(8);
  });

  it('returns multiple results for multiple tags', () => {
    const text = '<gv>{"score":7}</gv> text <gv>{"files":["a.ts"]}</gv> more <gv>{"count":5}</gv>';
    const results = parseAllGvTags(text);
    expect(results).toHaveLength(3);
    expect(results[0].data!.score).toBe(7);
    expect(results[1].data!.files).toEqual(['a.ts']);
    expect(results[2].data!.count).toBe(5);
  });

  it('includes invalid tags as found=true data=null entries', () => {
    const results = parseAllGvTags('<gv>{bad json}</gv><gv>{"score":9}</gv>');
    expect(results).toHaveLength(2);
    expect(results[0].found).toBe(true);
    expect(results[0].data).toBeNull();
    expect(results[1].data!.score).toBe(9);
  });
});

// ─── extractReviewScore ────────────────────────────────────────────────────────

describe('extractReviewScore', () => {
  it('returns null for null input', () => {
    expect(extractReviewScore(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(extractReviewScore(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractReviewScore('')).toBeNull();
  });

  it('extracts score from <gv> tag', () => {
    expect(extractReviewScore('<gv>{"score":8.5}</gv>')).toBe(8.5);
  });

  it('falls back to legacy SCORE:N/10 regex when no <gv> tag', () => {
    expect(extractReviewScore('SCORE: 7.5/10')).toBe(7.5);
  });

  it('falls back to legacy regex when <gv> tag has no score field', () => {
    expect(extractReviewScore('<gv>{"files":[]}</gv>\nSCORE: 6/10')).toBe(6);
  });

  it('returns null when neither <gv> score nor legacy regex match', () => {
    expect(extractReviewScore('no score here')).toBeNull();
  });

  it('is case-insensitive for legacy regex', () => {
    expect(extractReviewScore('score: 9/10')).toBe(9);
  });

  it('parses integer score from legacy regex', () => {
    expect(extractReviewScore('SCORE: 10/10')).toBe(10);
  });

  it('prefers <gv> tag score over legacy regex', () => {
    const text = '<gv>{"score":9}</gv>\nSCORE: 5/10';
    expect(extractReviewScore(text)).toBe(9);
  });
});

// ─── extractFiles ──────────────────────────────────────────────────────────────

describe('extractFiles', () => {
  it('returns empty array for null input', () => {
    expect(extractFiles(null)).toEqual([]);
  });

  it('returns empty array for undefined input', () => {
    expect(extractFiles(undefined)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(extractFiles('')).toEqual([]);
  });

  it('returns empty array when no <gv> tag is present', () => {
    expect(extractFiles('some output without tags')).toEqual([]);
  });

  it('returns files from a valid <gv> tag', () => {
    expect(extractFiles('<gv>{"files":["src/a.ts","src/b.ts"]}</gv>')).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('returns empty array when <gv> tag has no files field', () => {
    expect(extractFiles('<gv>{"score":8}</gv>')).toEqual([]);
  });

  it('returns empty array when <gv> tag is malformed', () => {
    expect(extractFiles('<gv>{bad json}</gv>')).toEqual([]);
  });
});
