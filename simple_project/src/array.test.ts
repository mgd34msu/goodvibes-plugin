import { describe, it, expect, vi } from 'vitest';
import { chunk, unique, flatten, shuffle } from './array.js';

describe('chunk', () => {
  it('splits array into equal-sized chunks', () => {
    expect(chunk([1, 2, 3, 4, 5, 6], 2)).toEqual([[1, 2], [3, 4], [5, 6]]);
  });

  it('handles array not evenly divisible by chunk size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns the whole array as one chunk when size >= array length', () => {
    expect(chunk([1, 2, 3], 5)).toEqual([[1, 2, 3]]);
    expect(chunk([1, 2, 3], 3)).toEqual([[1, 2, 3]]);
  });

  it('returns empty array for empty input', () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it('handles chunk size of 1', () => {
    expect(chunk([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
  });

  it('works with strings', () => {
    expect(chunk(['a', 'b', 'c', 'd'], 2)).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('works with objects', () => {
    const obj1 = { id: 1 };
    const obj2 = { id: 2 };
    const obj3 = { id: 3 };
    expect(chunk([obj1, obj2, obj3], 2)).toEqual([[obj1, obj2], [obj3]]);
  });

  it('throws RangeError for size < 1', () => {
    expect(() => chunk([1, 2, 3], 0)).toThrow(RangeError);
    expect(() => chunk([1, 2, 3], -1)).toThrow(RangeError);
  });

  it('throws RangeError for non-integer size', () => {
    expect(() => chunk([1, 2, 3], 1.5)).toThrow(RangeError);
    expect(() => chunk([1, 2, 3], NaN)).toThrow(RangeError);
  });
});

describe('unique', () => {
  it('removes duplicate numbers', () => {
    expect(unique([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3]);
  });

  it('removes duplicate strings', () => {
    expect(unique(['a', 'b', 'a', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('preserves order (first occurrence)', () => {
    expect(unique([3, 1, 2, 1, 3])).toEqual([3, 1, 2]);
  });

  it('returns empty array for empty input', () => {
    expect(unique([])).toEqual([]);
  });

  it('returns same array when all elements are unique', () => {
    expect(unique([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('handles boolean values', () => {
    expect(unique([true, false, true, false])).toEqual([true, false]);
  });

  it('handles null and undefined', () => {
    expect(unique([null, undefined, null, undefined])).toEqual([null, undefined]);
  });

  it('does not mutate the original array', () => {
    const original = [1, 2, 2, 3];
    unique(original);
    expect(original).toEqual([1, 2, 2, 3]);
  });

  it('uses reference equality for objects (distinct objects are not deduplicated)', () => {
    const a = { id: 1 };
    const b = { id: 1 };
    // a and b are structurally equal but different references
    expect(unique([a, b])).toHaveLength(2);
    // same reference is deduplicated
    expect(unique([a, a])).toHaveLength(1);
  });
});

describe('flatten', () => {
  it('flattens completely by default (Infinity depth)', () => {
    expect(flatten([[1, 2], [3, 4]])).toEqual([1, 2, 3, 4]);
  });

  it('flattens deeply nested arrays with Infinity depth', () => {
    expect(flatten([1, [2, [3, [4]]]])).toEqual([1, 2, 3, 4]);
  });

  it('respects depth parameter', () => {
    expect(flatten([1, [2, [3, [4]]]], 1)).toEqual([1, 2, [3, [4]]]);
    expect(flatten([1, [2, [3, [4]]]], 2)).toEqual([1, 2, 3, [4]]);
  });

  it('returns empty array for empty input', () => {
    expect(flatten([])).toEqual([]);
  });

  it('returns flat array unchanged', () => {
    expect(flatten([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('handles mixed nesting', () => {
    expect(flatten([1, [2, 3], [4, [5, 6]]], 1)).toEqual([1, 2, 3, 4, [5, 6]]);
  });

  it('handles strings within arrays', () => {
    expect(flatten([['a', 'b'], ['c']])).toEqual(['a', 'b', 'c']);
  });

  it('handles depth of 0 (no flattening)', () => {
    const input = [[1, 2], [3, 4]];
    expect(flatten(input, 0)).toEqual([[1, 2], [3, 4]]);
  });
});

describe('shuffle', () => {
  it('returns an array of the same length', () => {
    const arr = [1, 2, 3, 4, 5];
    expect(shuffle(arr)).toHaveLength(5);
  });

  it('contains the same elements as the original', () => {
    const arr = [1, 2, 3, 4, 5];
    expect(shuffle(arr).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('does not mutate the original array', () => {
    const arr = [1, 2, 3, 4, 5];
    shuffle(arr);
    expect(arr).toEqual([1, 2, 3, 4, 5]);
  });

  it('returns empty array for empty input', () => {
    expect(shuffle([])).toEqual([]);
  });

  it('returns single element unchanged', () => {
    expect(shuffle([42])).toEqual([42]);
  });

  it('uses Fisher-Yates shuffle (verifiable via mock)', () => {
    // Mock Math.random to always return 0
    // Fisher-Yates trace for [1, 2, 3, 4]:
    //   i=3: j=floor(0*4)=0 → swap(3,0) → [4, 2, 3, 1]
    //   i=2: j=floor(0*3)=0 → swap(2,0) → [3, 2, 4, 1]
    //   i=1: j=floor(0*2)=0 → swap(1,0) → [2, 3, 4, 1]
    // Expected result: [2, 3, 4, 1]
    const mockRandom = vi.spyOn(Math, 'random').mockReturnValue(0);
    const result = shuffle([1, 2, 3, 4]);
    expect(result).toEqual([2, 3, 4, 1]);
    mockRandom.mockRestore();
  });

  it('works with string arrays', () => {
    const arr = ['a', 'b', 'c', 'd'];
    const result = shuffle(arr);
    expect(result).toHaveLength(4);
    expect(result.sort()).toEqual(['a', 'b', 'c', 'd']);
  });
});
