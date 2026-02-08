import { describe, it, expect } from 'vitest';
import { levenshteinDistance, calculateSimilarity, rankBySimilarity } from '../../utils/fuzzy.js';

describe('levenshteinDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshteinDistance('hello', 'hello')).toBe(0);
    expect(levenshteinDistance('test', 'test')).toBe(0);
    expect(levenshteinDistance('', '')).toBe(0);
  });

  it('returns length when one string is empty', () => {
    expect(levenshteinDistance('', 'hello')).toBe(5);
    expect(levenshteinDistance('hello', '')).toBe(5);
    expect(levenshteinDistance('', 'a')).toBe(1);
  });

  it('calculates single character difference', () => {
    expect(levenshteinDistance('hello', 'helo')).toBe(1);
    expect(levenshteinDistance('test', 'best')).toBe(1);
    expect(levenshteinDistance('cat', 'cut')).toBe(1);
  });

  it('handles completely different strings', () => {
    expect(levenshteinDistance('abc', 'xyz')).toBe(3);
    expect(levenshteinDistance('foo', 'bar')).toBe(3);
  });

  it('is case sensitive', () => {
    expect(levenshteinDistance('Hello', 'hello')).toBe(1);
    expect(levenshteinDistance('TEST', 'test')).toBe(4);
  });

  it('handles multiple character operations', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    expect(levenshteinDistance('saturday', 'sunday')).toBe(3);
  });

  it('is symmetric', () => {
    expect(levenshteinDistance('abc', 'xyz')).toBe(levenshteinDistance('xyz', 'abc'));
    expect(levenshteinDistance('hello', 'world')).toBe(levenshteinDistance('world', 'hello'));
  });

  it('handles strings with special characters', () => {
    expect(levenshteinDistance('a-b-c', 'a_b_c')).toBe(2);
    expect(levenshteinDistance('test@example.com', 'test@example.org')).toBe(3);
  });

  it('handles unicode characters', () => {
    expect(levenshteinDistance('café', 'cafe')).toBe(1);
    expect(levenshteinDistance('🔥', '🔥')).toBe(0);
    expect(levenshteinDistance('🔥', '💧')).toBe(1);
  });
});

describe('calculateSimilarity', () => {
  it('returns 1 for identical strings', () => {
    expect(calculateSimilarity('hello', 'hello')).toBe(1);
    expect(calculateSimilarity('test', 'test')).toBe(1);
    expect(calculateSimilarity('', '')).toBe(1);
  });

  it('returns 0 for empty strings', () => {
    expect(calculateSimilarity('', 'hello')).toBe(0);
    expect(calculateSimilarity('hello', '')).toBe(0);
    expect(calculateSimilarity('', '')).toBe(1); // Empty equals empty
  });

  it('returns 0 for falsy values', () => {
    expect(calculateSimilarity('', 'test')).toBe(0);
    expect(calculateSimilarity('test', '')).toBe(0);
  });

  it('returns value between 0 and 1', () => {
    const similarity = calculateSimilarity('hello', 'hallo');
    expect(similarity).toBeGreaterThan(0);
    expect(similarity).toBeLessThan(1);
  });

  it('returns higher scores for more similar strings', () => {
    const highSimilarity = calculateSimilarity('hello', 'hallo');
    const lowSimilarity = calculateSimilarity('hello', 'world');
    expect(highSimilarity).toBeGreaterThan(lowSimilarity);
  });

  it('handles single character difference', () => {
    const similarity = calculateSimilarity('test', 'best');
    expect(similarity).toBe(0.75); // 4 chars, 1 diff = 3/4
  });

  it('returns 0 for strings longer than 500 chars', () => {
    const longString = 'a'.repeat(501);
    const otherString = 'b'.repeat(501);
    expect(calculateSimilarity(longString, otherString)).toBe(0);
  });

  it('handles different length strings', () => {
    const similarity = calculateSimilarity('test', 'testing');
    expect(similarity).toBeGreaterThan(0);
    expect(similarity).toBeLessThan(1);
  });

  it('is case sensitive', () => {
    const similarity = calculateSimilarity('Hello', 'hello');
    expect(similarity).toBeLessThan(1);
  });

  it('calculates correct similarity for known examples', () => {
    // 'kitten' vs 'sitting': edit distance 3, longer length 7
    // Similarity = (7 - 3) / 7 = 4/7 ≈ 0.571
    const similarity = calculateSimilarity('kitten', 'sitting');
    expect(similarity).toBeCloseTo(4 / 7, 2);
  });
});

describe('rankBySimilarity', () => {
  it('returns empty array for empty candidates', () => {
    const results = rankBySimilarity('test', []);
    expect(results).toEqual([]);
  });

  it('returns sorted results by similarity score', () => {
    const results = rankBySimilarity('test', ['test', 'best', 'rest', 'west', 'fest']);
    expect(results[0].path).toBe('test');
    expect(results[0].similarity).toBe(1);
    expect(results.length).toBeLessThanOrEqual(5);
  });

  it('sorts by descending similarity', () => {
    const results = rankBySimilarity('hello', ['hello', 'hallo', 'hullo', 'world']);
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].similarity).toBeGreaterThanOrEqual(results[i + 1].similarity);
    }
  });

  it('returns maximum 5 results', () => {
    const candidates = Array(10).fill(null).map((_, i) => `test${i}`);
    const results = rankBySimilarity('test', candidates);
    expect(results.length).toBeLessThanOrEqual(5);
  });

  it('filters by minimum similarity threshold', () => {
    const results = rankBySimilarity('test', ['test', 'best', 'xyz'], 0.7);
    expect(results.every(r => r.similarity >= 0.7)).toBe(true);
  });

  it('uses default threshold of 0.5', () => {
    const results = rankBySimilarity('test', ['test', 'best', 'xyz']);
    expect(results.every(r => r.similarity >= 0.5)).toBe(true);
  });

  it('compares basenames only for file paths', () => {
    const results = rankBySimilarity(
      'test.ts',
      ['src/utils/test.ts', 'lib/best.ts', 'other/test.js']
    );
    // Should compare 'test.ts' vs 'test.ts', 'best.ts', 'test.js'
    expect(results[0].path).toBe('src/utils/test.ts');
    expect(results[0].similarity).toBe(1);
  });

  it('extracts basename correctly', () => {
    const results = rankBySimilarity(
      'utils/target.ts',
      ['src/target.ts', 'lib/other.ts']
    );
    // Should compare 'target.ts' vs 'target.ts', 'other.ts'
    expect(results[0].path).toBe('src/target.ts');
  });

  it('handles paths without directory separators', () => {
    const results = rankBySimilarity('test', ['test', 'best', 'rest']);
    expect(results[0].path).toBe('test');
    expect(results[0].similarity).toBe(1);
  });

  it('returns all candidates when all meet threshold', () => {
    const results = rankBySimilarity('test', ['test', 'best', 'rest'], 0.5);
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(5);
  });

  it('returns fewer than 5 when not enough candidates meet threshold', () => {
    const results = rankBySimilarity('test', ['xyz', 'abc'], 0.9);
    expect(results.length).toBeLessThan(2);
  });

  it('includes path and similarity in result objects', () => {
    const results = rankBySimilarity('test', ['test']);
    expect(results[0]).toHaveProperty('path');
    expect(results[0]).toHaveProperty('similarity');
    expect(typeof results[0].path).toBe('string');
    expect(typeof results[0].similarity).toBe('number');
  });

  it('handles custom minimum similarity', () => {
    const highThreshold = rankBySimilarity('test', ['test', 'best', 'xyz'], 0.9);
    const lowThreshold = rankBySimilarity('test', ['test', 'best', 'xyz'], 0.3);
    expect(highThreshold.length).toBeLessThanOrEqual(lowThreshold.length);
  });
});
