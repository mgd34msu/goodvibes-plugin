import { describe, it, expect } from 'vitest';
import { chunk, unique, groupBy, flatten, intersect } from './arrays';

describe('chunk', () => {
  it('splits array into equal-sized chunks', () => {
    expect(chunk([1, 2, 3, 4, 5, 6], 2)).toEqual([[1, 2], [3, 4], [5, 6]]);
  });

  it('handles a remainder in the last chunk', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns the whole array as one chunk when size >= length', () => {
    expect(chunk([1, 2, 3], 10)).toEqual([[1, 2, 3]]);
  });

  it('returns single-element chunks when size is 1', () => {
    expect(chunk([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
  });

  it('returns an empty array for an empty input', () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it('works with a single-element array', () => {
    expect(chunk([42], 5)).toEqual([[42]]);
  });

  it('works with strings', () => {
    expect(chunk(['a', 'b', 'c', 'd'], 2)).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('throws RangeError for size of 0', () => {
    expect(() => chunk([1, 2, 3], 0)).toThrow(RangeError);
  });

  it('throws RangeError for negative size', () => {
    expect(() => chunk([1, 2, 3], -1)).toThrow(RangeError);
  });

  it('throws RangeError for fractional size', () => {
    expect(() => chunk([1, 2, 3], 1.5)).toThrow(RangeError);
  });

  it('throws RangeError for NaN size', () => {
    expect(() => chunk([1, 2, 3], NaN)).toThrow(RangeError);
  });

  it('throws RangeError for Infinity size', () => {
    expect(() => chunk([1, 2, 3], Infinity)).toThrow(RangeError);
  });
});

describe('unique', () => {
  it('removes duplicate numbers', () => {
    expect(unique([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3]);
  });

  it('removes duplicate strings', () => {
    expect(unique(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c']);
  });

  it('preserves insertion order', () => {
    expect(unique([3, 1, 2, 1, 3])).toEqual([3, 1, 2]);
  });

  it('returns an empty array for empty input', () => {
    expect(unique([])).toEqual([]);
  });

  it('returns array unchanged when all elements are already unique', () => {
    expect(unique([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('handles a single-element array', () => {
    expect(unique([7])).toEqual([7]);
  });

  it('handles an array where all elements are the same', () => {
    expect(unique([5, 5, 5, 5])).toEqual([5]);
  });

  it('treats objects by reference (does not deep-compare)', () => {
    const obj = { x: 1 };
    expect(unique([obj, obj, { x: 1 }])).toHaveLength(2);
  });
});

describe('groupBy', () => {
  it('groups numbers by even/odd', () => {
    const result = groupBy([1, 2, 3, 4, 5], (n) => (n % 2 === 0 ? 'even' : 'odd'));
    expect(result).toEqual({ odd: [1, 3, 5], even: [2, 4] });
  });

  it('groups strings by first character', () => {
    const result = groupBy(['apple', 'avocado', 'banana', 'blueberry'], (s) => s[0]);
    expect(result).toEqual({ a: ['apple', 'avocado'], b: ['banana', 'blueberry'] });
  });

  it('groups objects by a property', () => {
    const people = [
      { name: 'Alice', dept: 'eng' },
      { name: 'Bob', dept: 'sales' },
      { name: 'Carol', dept: 'eng' },
    ];
    const result = groupBy(people, (p) => p.dept);
    expect(result['eng']).toHaveLength(2);
    expect(result['sales']).toHaveLength(1);
  });

  it('returns an empty object for empty input', () => {
    expect(groupBy([], (x) => String(x))).toEqual({});
  });

  it('puts all elements in one group when keyFn returns the same key', () => {
    const result = groupBy([1, 2, 3], () => 'all');
    expect(result).toEqual({ all: [1, 2, 3] });
  });

  it('creates a group per element when all keys are unique', () => {
    const result = groupBy([1, 2, 3], (n) => String(n));
    expect(Object.keys(result)).toHaveLength(3);
  });
});

describe('flatten', () => {
  it('flattens one level of nested arrays', () => {
    expect(flatten([[1, 2], [3, 4], [5]])).toEqual([1, 2, 3, 4, 5]);
  });

  it('passes through non-array elements unchanged', () => {
    expect(flatten([1, [2, 3], 4, [5]])).toEqual([1, 2, 3, 4, 5]);
  });

  it('does NOT flatten more than one level deep', () => {
    // `[[1, 2]]` is a number[][] element — intentionally the wrong type — to
    // verify that flatten only goes one level deep. TypeScript cannot express
    // this "too-deeply-nested" constraint statically, so the double-cast
    // `as unknown as number[]` is required to bypass the type checker for this
    // one-level-only behavior test.
    const input: (number | number[])[] = [[[1, 2]] as unknown as number[], [3]];
    expect(flatten(input)).toEqual([[1, 2], 3]);
  });

  it('returns an empty array for empty input', () => {
    expect(flatten([])).toEqual([]);
  });

  it('handles an array of empty arrays', () => {
    expect(flatten([[], [], []])).toEqual([]);
  });

  it('handles a mix of empty and non-empty sub-arrays', () => {
    expect(flatten([[], [1], [], [2, 3]])).toEqual([1, 2, 3]);
  });

  it('handles a single-element array with a nested array', () => {
    expect(flatten([[42]])).toEqual([42]);
  });

  it('works with strings', () => {
    expect(flatten([['a', 'b'], ['c']])).toEqual(['a', 'b', 'c']);
  });
});

describe('intersect', () => {
  it('returns common elements of two arrays', () => {
    expect(intersect([1, 2, 3], [2, 3, 4])).toEqual([2, 3]);
  });

  it('preserves order from the first array', () => {
    expect(intersect([3, 1, 2], [1, 2, 3])).toEqual([3, 1, 2]);
  });

  it('returns an empty array when there is no overlap', () => {
    expect(intersect([1, 2], [3, 4])).toEqual([]);
  });

  it('returns an empty array when first array is empty', () => {
    expect(intersect([], [1, 2, 3])).toEqual([]);
  });

  it('returns an empty array when second array is empty', () => {
    expect(intersect([1, 2, 3], [])).toEqual([]);
  });

  it('returns an empty array when both arrays are empty', () => {
    expect(intersect([], [])).toEqual([]);
  });

  it('deduplicates results — each element appears at most once', () => {
    expect(intersect([1, 1, 2, 2, 3], [1, 2])).toEqual([1, 2]);
  });

  it('ignores duplicates in the second array', () => {
    expect(intersect([1, 2, 3], [2, 2, 3, 3])).toEqual([2, 3]);
  });

  it('works with strings', () => {
    expect(intersect(['a', 'b', 'c'], ['b', 'c', 'd'])).toEqual(['b', 'c']);
  });

  it('handles identical arrays', () => {
    expect(intersect([1, 2, 3], [1, 2, 3])).toEqual([1, 2, 3]);
  });
});
