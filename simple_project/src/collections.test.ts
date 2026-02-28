import { describe, it, expect } from 'vitest';
import {
  chunk,
  unique,
  flatten,
  groupBy,
  zip,
  difference,
  intersection,
  shuffle,
  partition,
  range,
} from './collections.js';

describe('chunk', () => {
  it('splits array into equal-sized chunks', () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });

  it('handles remainder chunk smaller than size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns empty array for empty input', () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it('returns single chunk when size >= array length', () => {
    expect(chunk([1, 2, 3], 5)).toEqual([[1, 2, 3]]);
    expect(chunk([1, 2, 3], 3)).toEqual([[1, 2, 3]]);
  });

  it('handles chunk size of 1', () => {
    expect(chunk([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
  });

  it('works with string arrays', () => {
    expect(chunk(['a', 'b', 'c', 'd'], 2)).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('throws on size <= 0', () => {
    expect(() => chunk([1, 2], 0)).toThrow(RangeError);
    expect(() => chunk([1, 2], -1)).toThrow(RangeError);
  });
});

describe('unique', () => {
  it('removes duplicate numbers', () => {
    expect(unique([1, 2, 2, 3, 1])).toEqual([1, 2, 3]);
  });

  it('preserves first-occurrence order', () => {
    expect(unique([3, 1, 2, 1, 3])).toEqual([3, 1, 2]);
  });

  it('returns empty array for empty input', () => {
    expect(unique([])).toEqual([]);
  });

  it('returns same array when no duplicates', () => {
    expect(unique([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('handles single element', () => {
    expect(unique([42])).toEqual([42]);
  });

  it('handles all same elements', () => {
    expect(unique([5, 5, 5, 5])).toEqual([5]);
  });

  it('works with strings', () => {
    expect(unique(['a', 'b', 'a', 'c'])).toEqual(['a', 'b', 'c']);
  });
});

describe('flatten', () => {
  it('flattens one level deep', () => {
    expect(flatten([[1, 2], [3, 4]])).toEqual([1, 2, 3, 4]);
  });

  it('handles mixed flat and nested items', () => {
    expect(flatten([1, [2, 3], 4, [5]])).toEqual([1, 2, 3, 4, 5]);
  });

  it('returns empty array for empty input', () => {
    expect(flatten([])).toEqual([]);
  });

  it('handles array of empty arrays', () => {
    expect(flatten([[], [], []])).toEqual([]);
  });

  it('handles single-element arrays', () => {
    expect(flatten([[1]])).toEqual([1]);
  });

  it('does not flatten more than one level', () => {
    // A nested array inside a nested array should stay nested
    const input: (number | number[])[] = [1, [2, 3]];
    expect(flatten(input)).toEqual([1, 2, 3]);
  });

  it('works with strings', () => {
    expect(flatten(['a', ['b', 'c']])).toEqual(['a', 'b', 'c']);
  });
});

describe('groupBy', () => {
  it('groups objects by a string property', () => {
    const input = [
      { category: 'fruit', name: 'apple' },
      { category: 'vegetable', name: 'carrot' },
      { category: 'fruit', name: 'banana' },
    ];
    const result = groupBy(input, 'category');
    expect(result).toEqual({
      fruit: [
        { category: 'fruit', name: 'apple' },
        { category: 'fruit', name: 'banana' },
      ],
      vegetable: [{ category: 'vegetable', name: 'carrot' }],
    });
  });

  it('returns empty object for empty array', () => {
    expect(groupBy([], 'key' as never)).toEqual({});
  });

  it('handles all items in same group', () => {
    const input = [{ type: 'a', v: 1 }, { type: 'a', v: 2 }];
    expect(groupBy(input, 'type')).toEqual({
      a: [{ type: 'a', v: 1 }, { type: 'a', v: 2 }],
    });
  });

  it('groups by numeric property (converts to string key)', () => {
    const input = [{ score: 1, name: 'x' }, { score: 2, name: 'y' }, { score: 1, name: 'z' }];
    const result = groupBy(input, 'score');
    expect(result['1']).toHaveLength(2);
    expect(result['2']).toHaveLength(1);
  });

  it('handles single element', () => {
    const input = [{ kind: 'solo', value: 99 }];
    expect(groupBy(input, 'kind')).toEqual({ solo: [{ kind: 'solo', value: 99 }] });
  });
});

describe('zip', () => {
  it('zips two equal-length arrays', () => {
    expect(zip([1, 2, 3], ['a', 'b', 'c'])).toEqual([[1, 'a'], [2, 'b'], [3, 'c']]);
  });

  it('truncates to shorter array when first is shorter', () => {
    expect(zip([1, 2], ['a', 'b', 'c'])).toEqual([[1, 'a'], [2, 'b']]);
  });

  it('truncates to shorter array when second is shorter', () => {
    expect(zip([1, 2, 3], ['a'])).toEqual([[1, 'a']]);
  });

  it('returns empty array when either input is empty', () => {
    expect(zip([], [1, 2])).toEqual([]);
    expect(zip([1, 2], [])).toEqual([]);
    expect(zip([], [])).toEqual([]);
  });

  it('handles single element arrays', () => {
    expect(zip([42], ['x'])).toEqual([[42, 'x']]);
  });
});

describe('difference', () => {
  it('returns elements in a but not in b', () => {
    expect(difference([1, 2, 3, 4], [2, 4])).toEqual([1, 3]);
  });

  it('returns empty array when a is empty', () => {
    expect(difference([], [1, 2])).toEqual([]);
  });

  it('returns a when b is empty', () => {
    expect(difference([1, 2, 3], [])).toEqual([1, 2, 3]);
  });

  it('returns empty array when all elements are in b', () => {
    expect(difference([1, 2], [1, 2, 3])).toEqual([]);
  });

  it('handles duplicates in a (preserves all non-excluded)', () => {
    expect(difference([1, 1, 2, 3], [2])).toEqual([1, 1, 3]);
  });

  it('works with strings', () => {
    expect(difference(['a', 'b', 'c'], ['b'])).toEqual(['a', 'c']);
  });
});

describe('intersection', () => {
  it('returns elements present in both arrays', () => {
    expect(intersection([1, 2, 3], [2, 3, 4])).toEqual([2, 3]);
  });

  it('returns empty array when no common elements', () => {
    expect(intersection([1, 2], [3, 4])).toEqual([]);
  });

  it('returns empty array when either input is empty', () => {
    expect(intersection([], [1, 2])).toEqual([]);
    expect(intersection([1, 2], [])).toEqual([]);
  });

  it('handles duplicates in a (returns all matching from a)', () => {
    expect(intersection([1, 1, 2], [1])).toEqual([1, 1]);
  });

  it('works with strings', () => {
    expect(intersection(['a', 'b', 'c'], ['b', 'c', 'd'])).toEqual(['b', 'c']);
  });

  it('returns all elements when arrays are identical', () => {
    expect(intersection([1, 2, 3], [1, 2, 3])).toEqual([1, 2, 3]);
  });
});

describe('shuffle', () => {
  it('returns a new array (does not mutate original)', () => {
    const original = [1, 2, 3, 4, 5];
    const result = shuffle(original);
    expect(result).not.toBe(original);
    expect(original).toEqual([1, 2, 3, 4, 5]);
  });

  it('returns array with same elements', () => {
    const original = [1, 2, 3, 4, 5];
    const result = shuffle(original);
    expect(result.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('returns same length array', () => {
    const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(shuffle(original)).toHaveLength(original.length);
  });

  it('returns empty array for empty input', () => {
    expect(shuffle([])).toEqual([]);
  });

  it('returns single element unchanged', () => {
    expect(shuffle([42])).toEqual([42]);
  });

  it('produces different ordering over many runs (statistical)', () => {
    // With 10 elements, the probability that all 100 shuffles produce
    // the original order is astronomically small (1/10! per run).
    const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const originalStr = JSON.stringify(original);
    const allSame = Array.from({ length: 100 }, () =>
      JSON.stringify(shuffle(original))
    ).every((s) => s === originalStr);
    expect(allSame).toBe(false);
  });
});

describe('partition', () => {
  it('splits array into matching and non-matching elements', () => {
    const [evens, odds] = partition([1, 2, 3, 4, 5], (n) => n % 2 === 0);
    expect(evens).toEqual([2, 4]);
    expect(odds).toEqual([1, 3, 5]);
  });

  it('returns empty arrays for empty input', () => {
    const [pass, fail] = partition([], () => true);
    expect(pass).toEqual([]);
    expect(fail).toEqual([]);
  });

  it('all elements match predicate', () => {
    const [pass, fail] = partition([1, 2, 3], () => true);
    expect(pass).toEqual([1, 2, 3]);
    expect(fail).toEqual([]);
  });

  it('no elements match predicate', () => {
    const [pass, fail] = partition([1, 2, 3], () => false);
    expect(pass).toEqual([]);
    expect(fail).toEqual([1, 2, 3]);
  });

  it('handles single element — matches', () => {
    const [pass, fail] = partition([7], (n) => n > 5);
    expect(pass).toEqual([7]);
    expect(fail).toEqual([]);
  });

  it('handles single element — does not match', () => {
    const [pass, fail] = partition([3], (n) => n > 5);
    expect(pass).toEqual([]);
    expect(fail).toEqual([3]);
  });

  it('works with objects', () => {
    const items = [{ active: true }, { active: false }, { active: true }];
    const [active, inactive] = partition(items, (item) => item.active);
    expect(active).toHaveLength(2);
    expect(inactive).toHaveLength(1);
  });
});

describe('range', () => {
  it('generates ascending range with default step', () => {
    expect(range(0, 5)).toEqual([0, 1, 2, 3, 4]);
  });

  it('generates range with custom step', () => {
    expect(range(0, 10, 2)).toEqual([0, 2, 4, 6, 8]);
  });

  it('generates descending range with negative step', () => {
    expect(range(5, 0, -1)).toEqual([5, 4, 3, 2, 1]);
  });

  it('returns empty array when start equals end', () => {
    expect(range(3, 3)).toEqual([]);
  });

  it('returns empty array when ascending range is impossible', () => {
    expect(range(5, 0, 1)).toEqual([]);
  });

  it('returns empty array when descending range is impossible', () => {
    expect(range(0, 5, -1)).toEqual([]);
  });

  it('throws when step is zero', () => {
    expect(() => range(0, 10, 0)).toThrow(RangeError);
  });

  it('handles step larger than range', () => {
    expect(range(0, 3, 10)).toEqual([0]);
  });

  it('handles non-integer step', () => {
    const result = range(0, 1, 0.5);
    expect(result).toEqual([0, 0.5]);
  });

  it('generates single-element range', () => {
    expect(range(7, 8)).toEqual([7]);
  });
});
