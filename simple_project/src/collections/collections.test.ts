import { describe, it, expect } from 'vitest';
import {
  chunk,
  flatten,
  unique,
  intersection,
  difference,
  zip,
  groupBy,
  pick,
  omit,
  deepClone,
  merge,
  isEmpty,
} from './index.js';

// ---------------------------------------------------------------------------
// chunk
// ---------------------------------------------------------------------------
describe('chunk', () => {
  it('splits into equal chunks', () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });

  it('handles remainder chunk', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('chunk size equal to array length returns single chunk', () => {
    expect(chunk([1, 2, 3], 3)).toEqual([[1, 2, 3]]);
  });

  it('chunk size 1 returns each element as its own chunk', () => {
    expect(chunk([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
  });

  it('returns empty array for empty input', () => {
    expect(chunk([], 2)).toEqual([]);
  });

  it('throws RangeError for size < 1', () => {
    expect(() => chunk([1, 2, 3], 0)).toThrow(RangeError);
    expect(() => chunk([1, 2, 3], -1)).toThrow(RangeError);
  });

  it('throws RangeError for NaN size', () => {
    expect(() => chunk([1, 2, 3], NaN)).toThrow(RangeError);
  });

  it('throws RangeError for Infinity size', () => {
    expect(() => chunk([1, 2, 3], Infinity)).toThrow(RangeError);
  });

  it('floors non-integer size', () => {
    expect(chunk([1, 2, 3, 4], 2.9)).toEqual([[1, 2], [3, 4]]);
  });

  it('works with strings', () => {
    expect(chunk(['a', 'b', 'c', 'd'], 2)).toEqual([['a', 'b'], ['c', 'd']]);
  });
});

// ---------------------------------------------------------------------------
// flatten
// ---------------------------------------------------------------------------
describe('flatten', () => {
  it('flattens one level', () => {
    expect(flatten([[1, 2], [3, 4]])).toEqual([1, 2, 3, 4]);
  });

  it('returns empty for empty input', () => {
    expect(flatten([])).toEqual([]);
  });

  it('handles sub-arrays of varying length', () => {
    expect(flatten([[1], [2, 3], [4, 5, 6]])).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('handles empty sub-arrays', () => {
    expect(flatten([[], [1, 2], []])).toEqual([1, 2]);
  });

  it('does not flatten nested arrays beyond one level', () => {
    // TypeScript would normally prevent this, but verify runtime behavior
    const nested = [[[1, 2]], [[3, 4]]] as unknown as number[][];
    expect(flatten(nested)).toEqual([[1, 2], [3, 4]]);
  });

  it('handles large arrays without stack overflow (1000+ sub-arrays)', () => {
    const large = Array.from({ length: 2000 }, (_, i) => [i]);
    const result = flatten(large);
    expect(result).toHaveLength(2000);
    expect(result[0]).toBe(0);
    expect(result[1999]).toBe(1999);
  });
});

// ---------------------------------------------------------------------------
// unique
// ---------------------------------------------------------------------------
describe('unique', () => {
  it('removes duplicates', () => {
    expect(unique([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3]);
  });

  it('returns same array when all unique', () => {
    expect(unique([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('handles empty array', () => {
    expect(unique([])).toEqual([]);
  });

  it('preserves first occurrence order', () => {
    expect(unique([3, 1, 2, 1, 3])).toEqual([3, 1, 2]);
  });

  it('works with strings', () => {
    expect(unique(['a', 'b', 'a', 'c'])).toEqual(['a', 'b', 'c']);
  });
});

// ---------------------------------------------------------------------------
// intersection
// ---------------------------------------------------------------------------
describe('intersection', () => {
  it('returns common elements', () => {
    expect(intersection([1, 2, 3], [2, 3, 4])).toEqual([2, 3]);
  });

  it('returns empty when no overlap', () => {
    expect(intersection([1, 2], [3, 4])).toEqual([]);
  });

  it('handles empty arrays', () => {
    expect(intersection([], [1, 2])).toEqual([]);
    expect(intersection([1, 2], [])).toEqual([]);
  });

  it('deduplicates results', () => {
    expect(intersection([1, 1, 2], [1, 2])).toEqual([1, 2]);
  });

  it('works with strings', () => {
    expect(intersection(['a', 'b', 'c'], ['b', 'c', 'd'])).toEqual(['b', 'c']);
  });
});

// ---------------------------------------------------------------------------
// difference
// ---------------------------------------------------------------------------
describe('difference', () => {
  it('returns elements in a not in b', () => {
    expect(difference([1, 2, 3, 4], [2, 4])).toEqual([1, 3]);
  });

  it('returns all elements when b is empty', () => {
    expect(difference([1, 2, 3], [])).toEqual([1, 2, 3]);
  });

  it('returns empty when all elements are excluded', () => {
    expect(difference([1, 2], [1, 2, 3])).toEqual([]);
  });

  it('handles empty source', () => {
    expect(difference([], [1, 2])).toEqual([]);
  });

  it('preserves duplicates in source that are not excluded', () => {
    expect(difference([1, 1, 2, 3], [3])).toEqual([1, 1, 2]);
  });
});

// ---------------------------------------------------------------------------
// zip
// ---------------------------------------------------------------------------
describe('zip', () => {
  it('pairs elements from two arrays', () => {
    expect(zip([1, 2, 3], ['a', 'b', 'c'])).toEqual([[1, 'a'], [2, 'b'], [3, 'c']]);
  });

  it('stops at shorter array', () => {
    expect(zip([1, 2, 3], ['a', 'b'])).toEqual([[1, 'a'], [2, 'b']]);
    expect(zip([1], ['a', 'b', 'c'])).toEqual([[1, 'a']]);
  });

  it('returns empty for empty inputs', () => {
    expect(zip([], [])).toEqual([]);
    expect(zip([1, 2], [])).toEqual([]);
    expect(zip([], [1, 2])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// groupBy
// ---------------------------------------------------------------------------
describe('groupBy', () => {
  it('groups by string key', () => {
    const people = [
      { name: 'Alice', role: 'admin' },
      { name: 'Bob', role: 'user' },
      { name: 'Carol', role: 'admin' },
    ];
    expect(groupBy(people, (p) => p.role)).toEqual({
      admin: [
        { name: 'Alice', role: 'admin' },
        { name: 'Carol', role: 'admin' },
      ],
      user: [{ name: 'Bob', role: 'user' }],
    });
  });

  it('groups numbers by even/odd', () => {
    const nums = [1, 2, 3, 4, 5];
    expect(groupBy(nums, (n) => (n % 2 === 0 ? 'even' : 'odd'))).toEqual({
      odd: [1, 3, 5],
      even: [2, 4],
    });
  });

  it('returns empty record for empty array', () => {
    expect(groupBy([], (x: number) => x)).toEqual({});
  });

  it('handles single group', () => {
    expect(groupBy([1, 2, 3], () => 'all')).toEqual({ all: [1, 2, 3] });
  });
});

// ---------------------------------------------------------------------------
// pick
// ---------------------------------------------------------------------------
describe('pick', () => {
  it('picks specified keys', () => {
    const obj = { a: 1, b: 2, c: 3 };
    expect(pick(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 });
  });

  it('returns empty object for empty keys', () => {
    expect(pick({ a: 1 }, [])).toEqual({});
  });

  it('ignores keys not present on object', () => {
    const obj = { a: 1, b: 2 } as { a: number; b: number; c?: number };
    expect(pick(obj, ['a', 'c'])).toEqual({ a: 1 });
  });

  it('picks all keys', () => {
    const obj = { x: 10, y: 20 };
    expect(pick(obj, ['x', 'y'])).toEqual({ x: 10, y: 20 });
  });
});

// ---------------------------------------------------------------------------
// omit
// ---------------------------------------------------------------------------
describe('omit', () => {
  it('omits specified keys', () => {
    const obj = { a: 1, b: 2, c: 3 };
    expect(omit(obj, ['b'])).toEqual({ a: 1, c: 3 });
  });

  it('returns original object when no keys omitted', () => {
    expect(omit({ a: 1, b: 2 }, [])).toEqual({ a: 1, b: 2 });
  });

  it('omits all keys returns empty object', () => {
    expect(omit({ a: 1, b: 2 }, ['a', 'b'])).toEqual({});
  });

  it('does not mutate original object', () => {
    const orig = { a: 1, b: 2 };
    omit(orig, ['a']);
    expect(orig).toEqual({ a: 1, b: 2 });
  });
});

// ---------------------------------------------------------------------------
// deepClone
// ---------------------------------------------------------------------------
describe('deepClone', () => {
  it('creates a deep copy of primitives', () => {
    expect(deepClone(42)).toBe(42);
    expect(deepClone('hello')).toBe('hello');
    expect(deepClone(true)).toBe(true);
  });

  it('creates a deep copy of an object', () => {
    const obj = { a: 1, b: { c: 2 } };
    const cloned = deepClone(obj);
    expect(cloned).toEqual(obj);
    expect(cloned).not.toBe(obj);
    expect(cloned.b).not.toBe(obj.b);
  });

  it('creates a deep copy of an array', () => {
    const arr = [1, [2, 3], { x: 4 }];
    const cloned = deepClone(arr);
    expect(cloned).toEqual(arr);
    expect(cloned).not.toBe(arr);
    expect(cloned[1]).not.toBe(arr[1]);
  });

  it('does not share references', () => {
    const obj = { nested: { value: 1 } };
    const cloned = deepClone(obj);
    cloned.nested.value = 99;
    expect(obj.nested.value).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// merge
// ---------------------------------------------------------------------------
describe('merge', () => {
  it('merges flat objects', () => {
    expect(merge({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual({ a: 1, b: 3, c: 4 });
  });

  it('deep merges nested objects', () => {
    const result = merge(
      { a: { x: 1, y: 2 }, b: 10 },
      { a: { y: 99, z: 3 } }
    );
    expect(result).toEqual({ a: { x: 1, y: 99, z: 3 }, b: 10 });
  });

  it('arrays in source overwrite arrays in target', () => {
    const result = merge({ arr: [1, 2, 3] }, { arr: [4, 5] });
    expect(result).toEqual({ arr: [4, 5] });
  });

  it('does not mutate the original target', () => {
    const target = { a: 1, b: { c: 2 } };
    merge(target, { b: { c: 99 } });
    expect(target.b.c).toBe(2);
  });

  it('accepts multiple sources', () => {
    expect(merge({ a: 1 }, { b: 2 }, { c: 3 })).toEqual({ a: 1, b: 2, c: 3 });
  });

  it('returns clone of target when no sources', () => {
    const target = { a: 1 };
    const result = merge(target);
    expect(result).toEqual(target);
    expect(result).not.toBe(target);
  });

  it('does not allow __proto__ pollution', () => {
    const malicious = JSON.parse('{"__proto__":{"polluted":true}}') as object;
    const base = { a: 1 };
    merge(base, malicious);
    expect((({} as Record<string, unknown>).polluted)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// isEmpty
// ---------------------------------------------------------------------------
describe('isEmpty', () => {
  it('returns true for null', () => {
    expect(isEmpty(null)).toBe(true);
  });

  it('returns true for undefined', () => {
    expect(isEmpty(undefined)).toBe(true);
  });

  it('returns true for empty string', () => {
    expect(isEmpty('')).toBe(true);
  });

  it('returns false for non-empty string', () => {
    expect(isEmpty('hello')).toBe(false);
  });

  it('returns true for empty array', () => {
    expect(isEmpty([])).toBe(true);
  });

  it('returns false for non-empty array', () => {
    expect(isEmpty([1])).toBe(false);
  });

  it('returns true for empty object', () => {
    expect(isEmpty({})).toBe(true);
  });

  it('returns false for non-empty object', () => {
    expect(isEmpty({ a: 1 })).toBe(false);
  });

  it('returns false for numbers (even 0)', () => {
    expect(isEmpty(0)).toBe(false);
    expect(isEmpty(42)).toBe(false);
  });

  it('returns false for booleans', () => {
    expect(isEmpty(false)).toBe(false);
    expect(isEmpty(true)).toBe(false);
  });
});
