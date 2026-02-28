import { describe, it, expect } from 'vitest';
import { chunk, unique, groupBy, flatten, intersect, zip } from './arrays';

// ---------------------------------------------------------------------------
// chunk
// ---------------------------------------------------------------------------
describe('chunk', () => {
  it('splits an array into chunks of the given size', () => {
    expect(chunk([1, 2, 3, 4, 5, 6], 2)).toEqual([[1, 2], [3, 4], [5, 6]]);
  });

  it('produces a trailing chunk smaller than size when not evenly divisible', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns the whole array as one chunk when size >= length', () => {
    expect(chunk([1, 2, 3], 10)).toEqual([[1, 2, 3]]);
  });

  it('returns an empty array for an empty input', () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it('handles chunk size of 1', () => {
    expect(chunk([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
  });

  it('handles chunk size equal to array length', () => {
    expect(chunk([1, 2, 3], 3)).toEqual([[1, 2, 3]]);
  });

  it('works with string arrays', () => {
    expect(chunk(['a', 'b', 'c', 'd'], 2)).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('works with object arrays', () => {
    const a = { x: 1 };
    const b = { x: 2 };
    expect(chunk([a, b], 1)).toEqual([[a], [b]]);
  });

  it('throws RangeError when size < 1', () => {
    expect(() => chunk([1, 2, 3], 0)).toThrow(RangeError);
    expect(() => chunk([1, 2, 3], -1)).toThrow(RangeError);
  });

  it('does not mutate the original array', () => {
    const original = [1, 2, 3];
    chunk(original, 2);
    expect(original).toEqual([1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// unique
// ---------------------------------------------------------------------------
describe('unique', () => {
  it('removes duplicate primitives', () => {
    expect(unique([1, 2, 2, 3, 1])).toEqual([1, 2, 3]);
  });

  it('returns an empty array for empty input', () => {
    expect(unique([])).toEqual([]);
  });

  it('returns the same elements when all are unique', () => {
    expect(unique([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('preserves the first-occurrence order', () => {
    expect(unique([3, 1, 2, 1, 3])).toEqual([3, 1, 2]);
  });

  it('handles strings', () => {
    expect(unique(['a', 'b', 'a', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('treats object references as unique (referential equality)', () => {
    const obj = { id: 1 };
    expect(unique([obj, obj, { id: 1 }])).toEqual([obj, { id: 1 }]);
  });

  it('handles boolean values', () => {
    expect(unique([true, false, true, false])).toEqual([true, false]);
  });

  it('handles null and undefined', () => {
    expect(unique([null, undefined, null, undefined])).toEqual([null, undefined]);
  });

  it('does not mutate the original array', () => {
    const original = [1, 2, 1];
    unique(original);
    expect(original).toEqual([1, 2, 1]);
  });
});

// ---------------------------------------------------------------------------
// groupBy
// ---------------------------------------------------------------------------
describe('groupBy', () => {
  it('groups numbers by even/odd', () => {
    const result = groupBy([1, 2, 3, 4], (n) => (n % 2 === 0 ? 'even' : 'odd'));
    expect(result).toEqual({ odd: [1, 3], even: [2, 4] });
  });

  it('returns an empty object for empty input', () => {
    expect(groupBy([], () => 'key')).toEqual({});
  });

  it('groups all elements under one key when key function returns the same value', () => {
    expect(groupBy([1, 2, 3], () => 'all')).toEqual({ all: [1, 2, 3] });
  });

  it('groups strings by length', () => {
    const result = groupBy(['a', 'bb', 'cc', 'ddd'], (s) => String(s.length));
    expect(result).toEqual({ '1': ['a'], '2': ['bb', 'cc'], '3': ['ddd'] });
  });

  it('groups objects by a property', () => {
    const items = [{ type: 'x', val: 1 }, { type: 'y', val: 2 }, { type: 'x', val: 3 }];
    const result = groupBy(items, (item) => item.type);
    expect(result).toEqual({
      x: [{ type: 'x', val: 1 }, { type: 'x', val: 3 }],
      y: [{ type: 'y', val: 2 }],
    });
  });

  it('preserves element order within each group', () => {
    const result = groupBy([3, 1, 2, 4, 5], (n) => (n % 2 === 0 ? 'even' : 'odd'));
    expect(result.odd).toEqual([3, 1, 5]);
    expect(result.even).toEqual([2, 4]);
  });

  it('does not mutate the original array', () => {
    const original = [1, 2, 3];
    groupBy(original, (n) => String(n));
    expect(original).toEqual([1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// flatten
// ---------------------------------------------------------------------------
describe('flatten', () => {
  it('flattens one level of nesting', () => {
    expect(flatten([[1, 2], [3, 4]])).toEqual([1, 2, 3, 4]);
  });

  it('returns an empty array for empty input', () => {
    expect(flatten([])).toEqual([]);
  });

  it('handles mixed flat values and sub-arrays', () => {
    expect(flatten([[1, 2], 3, [4]])).toEqual([1, 2, 3, 4]);
  });

  it('does not flatten more than one level deep', () => {
    // [[1, 2]] is an element that is itself an array containing [1,2]
    // After one flatten, it becomes [1, 2] — the inner nesting is not flattened further
    expect(flatten([[[1, 2]], [3]])).toEqual([[1, 2], 3]);
  });

  it('handles an array of empty arrays', () => {
    expect(flatten([[], [], []])).toEqual([]);
  });

  it('handles a single non-array element', () => {
    expect(flatten([1])).toEqual([1]);
  });

  it('handles a single array element', () => {
    expect(flatten([[1, 2, 3]])).toEqual([1, 2, 3]);
  });

  it('works with string arrays', () => {
    expect(flatten([['a', 'b'], ['c']])).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the original array', () => {
    const original: (number | number[])[] = [[1, 2], 3];
    flatten(original);
    expect(original).toEqual([[1, 2], 3]);
  });
});

// ---------------------------------------------------------------------------
// intersect
// ---------------------------------------------------------------------------
describe('intersect', () => {
  it('returns common elements from both arrays', () => {
    expect(intersect([1, 2, 3], [2, 3, 4])).toEqual([2, 3]);
  });

  it('returns an empty array when there is no overlap', () => {
    expect(intersect([1, 2], [3, 4])).toEqual([]);
  });

  it('returns an empty array when either input is empty', () => {
    expect(intersect([], [1, 2, 3])).toEqual([]);
    expect(intersect([1, 2, 3], [])).toEqual([]);
  });

  it('returns an empty array when both inputs are empty', () => {
    expect(intersect([], [])).toEqual([]);
  });

  it('deduplicates the result even when a is duplicated', () => {
    expect(intersect([1, 1, 2], [1, 2])).toEqual([1, 2]);
  });

  it('deduplicates the result even when b contains duplicates', () => {
    expect(intersect([1, 2], [1, 1, 2, 2])).toEqual([1, 2]);
  });

  it('preserves the order of elements from the first array', () => {
    expect(intersect([3, 1, 2], [1, 2, 3])).toEqual([3, 1, 2]);
  });

  it('handles string arrays', () => {
    expect(intersect(['a', 'b', 'c'], ['b', 'c', 'd'])).toEqual(['b', 'c']);
  });

  it('uses referential equality for objects', () => {
    const a = { id: 1 };
    const b = { id: 2 };
    expect(intersect([a, b], [b])).toEqual([b]);
    expect(intersect([a], [{ id: 1 }])).toEqual([]); // different reference
  });

  it('does not mutate input arrays', () => {
    const arrA = [1, 2, 3];
    const arrB = [2, 3, 4];
    intersect(arrA, arrB);
    expect(arrA).toEqual([1, 2, 3]);
    expect(arrB).toEqual([2, 3, 4]);
  });
});

// ---------------------------------------------------------------------------
// zip
// ---------------------------------------------------------------------------
describe('zip', () => {
  it('pairs elements from two arrays of equal length', () => {
    expect(zip([1, 2, 3], ['a', 'b', 'c'])).toEqual([[1, 'a'], [2, 'b'], [3, 'c']]);
  });

  it('truncates to the shorter array when lengths differ (a shorter)', () => {
    expect(zip([1, 2], ['a', 'b', 'c'])).toEqual([[1, 'a'], [2, 'b']]);
  });

  it('truncates to the shorter array when lengths differ (b shorter)', () => {
    expect(zip([1, 2, 3], ['a'])).toEqual([[1, 'a']]);
  });

  it('returns an empty array when either input is empty', () => {
    expect(zip([], [1, 2, 3])).toEqual([]);
    expect(zip([1, 2, 3], [])).toEqual([]);
  });

  it('returns an empty array when both inputs are empty', () => {
    expect(zip([], [])).toEqual([]);
  });

  it('works with mixed types', () => {
    expect(zip([true, false], [1, 0])).toEqual([[true, 1], [false, 0]]);
  });

  it('works with object arrays', () => {
    const a = { x: 1 };
    const b = { y: 2 };
    expect(zip([a], [b])).toEqual([[a, b]]);
  });

  it('does not mutate input arrays', () => {
    const arrA = [1, 2, 3];
    const arrB = ['a', 'b', 'c'];
    zip(arrA, arrB);
    expect(arrA).toEqual([1, 2, 3]);
    expect(arrB).toEqual(['a', 'b', 'c']);
  });

  it('produces tuple types at compile time (type safety)', () => {
    const result = zip([1, 2], ['x', 'y']);
    // TypeScript infers [number, string][] — runtime check on value
    const first: [number, string] = result[0];
    expect(first[0]).toBe(1);
    expect(first[1]).toBe('x');
  });
});
