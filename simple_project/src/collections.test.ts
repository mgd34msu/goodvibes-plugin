import { describe, it, expect } from 'vitest';
import { chunk, unique, groupBy, zip, partition } from './collections.js';

// ---------------------------------------------------------------------------
// chunk
// ---------------------------------------------------------------------------
describe('chunk', () => {
  it('splits an array into equal-sized chunks', () => {
    expect(chunk([1, 2, 3, 4, 5, 6], 2)).toEqual([[1, 2], [3, 4], [5, 6]]);
  });

  it('produces a smaller last chunk when the array is not evenly divisible', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns a single chunk when size equals array length', () => {
    expect(chunk([1, 2, 3], 3)).toEqual([[1, 2, 3]]);
  });

  it('returns one chunk per element when size is 1', () => {
    expect(chunk([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
  });

  it('returns single chunk when size is larger than array', () => {
    expect(chunk([1, 2], 10)).toEqual([[1, 2]]);
  });

  it('returns empty array for empty input', () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it('works with a single-element array', () => {
    expect(chunk([42], 5)).toEqual([[42]]);
  });

  it('works with string arrays', () => {
    expect(chunk(['a', 'b', 'c', 'd'], 2)).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('throws RangeError when size is 0', () => {
    expect(() => chunk([1, 2, 3], 0)).toThrow(RangeError);
  });

  it('throws RangeError when size is negative', () => {
    expect(() => chunk([1, 2, 3], -1)).toThrow(RangeError);
  });

  it('throws RangeError with informative message', () => {
    expect(() => chunk([1], -5)).toThrow('Chunk size must be >= 1, got -5');
  });
});

// ---------------------------------------------------------------------------
// unique
// ---------------------------------------------------------------------------
describe('unique', () => {
  it('removes duplicate numbers', () => {
    expect(unique([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3]);
  });

  it('removes duplicate strings', () => {
    expect(unique(['a', 'b', 'a', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('preserves first occurrence order', () => {
    expect(unique([3, 1, 2, 1, 3])).toEqual([3, 1, 2]);
  });

  it('returns empty array for empty input', () => {
    expect(unique([])).toEqual([]);
  });

  it('returns same elements when all are unique', () => {
    expect(unique([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('handles single-element array', () => {
    expect(unique([99])).toEqual([99]);
  });

  it('handles array of all identical elements', () => {
    expect(unique([7, 7, 7, 7])).toEqual([7]);
  });

  it('treats -0 and 0 as equal (Set semantics)', () => {
    const result = unique([0, -0]);
    expect(result).toHaveLength(1);
  });

  it('treats NaN as equal to NaN (Set semantics)', () => {
    const result = unique([NaN, NaN, 1]);
    expect(result).toHaveLength(2);
    expect(Number.isNaN(result[0])).toBe(true);
  });

  it('does not deduplicate distinct object references', () => {
    const a = { x: 1 };
    const b = { x: 1 };
    expect(unique([a, b])).toHaveLength(2);
  });

  it('deduplicates identical object references', () => {
    const obj = { x: 1 };
    expect(unique([obj, obj])).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// groupBy
// ---------------------------------------------------------------------------
describe('groupBy', () => {
  it('groups numbers by parity', () => {
    const result = groupBy([1, 2, 3, 4, 5], (n) => n % 2 === 0 ? 'even' : 'odd');
    expect(result).toEqual({ odd: [1, 3, 5], even: [2, 4] });
  });

  it('groups strings by length', () => {
    const result = groupBy(['a', 'bb', 'c', 'dd'], (s) => s.length);
    expect(result).toEqual({ 1: ['a', 'c'], 2: ['bb', 'dd'] });
  });

  it('groups objects by a property', () => {
    const items = [
      { type: 'fruit', name: 'apple' },
      { type: 'veggie', name: 'carrot' },
      { type: 'fruit', name: 'banana' },
    ];
    const result = groupBy(items, (item) => item.type);
    expect(result).toEqual({
      fruit: [{ type: 'fruit', name: 'apple' }, { type: 'fruit', name: 'banana' }],
      veggie: [{ type: 'veggie', name: 'carrot' }],
    });
  });

  it('returns empty object for empty input', () => {
    expect(groupBy([], (x: number) => x)).toEqual({});
  });

  it('handles single-element array', () => {
    expect(groupBy([42], (n) => n > 0 ? 'pos' : 'neg')).toEqual({ pos: [42] });
  });

  it('places all elements in one group when keyFn returns same key', () => {
    expect(groupBy([1, 2, 3], () => 'all')).toEqual({ all: [1, 2, 3] });
  });

  it('creates a group per element when all keys are unique', () => {
    const result = groupBy([1, 2, 3], (n) => n);
    expect(result).toEqual({ 1: [1], 2: [2], 3: [3] });
  });
});

// ---------------------------------------------------------------------------
// zip
// ---------------------------------------------------------------------------
describe('zip', () => {
  it('zips two equal-length arrays', () => {
    expect(zip([1, 2, 3], ['a', 'b', 'c'])).toEqual([[1, 'a'], [2, 'b'], [3, 'c']]);
  });

  it('stops at the shortest array', () => {
    expect(zip([1, 2, 3], ['a', 'b'])).toEqual([[1, 'a'], [2, 'b']]);
    expect(zip([1], ['a', 'b', 'c'])).toEqual([[1, 'a']]);
  });

  it('zips three arrays', () => {
    expect(zip([1, 2], ['a', 'b'], [true, false])).toEqual([
      [1, 'a', true],
      [2, 'b', false],
    ]);
  });

  it('returns empty array when called with no arguments', () => {
    expect(zip()).toEqual([]);
  });

  it('returns empty array when any input is empty', () => {
    expect(zip([1, 2, 3], [])).toEqual([]);
    expect(zip([], [1, 2, 3])).toEqual([]);
    expect(zip([], [])).toEqual([]);
  });

  it('handles single-element arrays', () => {
    expect(zip([42], ['hello'])).toEqual([[42, 'hello']]);
  });

  it('handles a single array argument', () => {
    expect(zip([1, 2, 3])).toEqual([[1], [2], [3]]);
  });

  it('zips arrays of different types correctly', () => {
    const result = zip([1, 2], ['x', 'y']);
    expect(result[0]).toEqual([1, 'x']);
    expect(result[1]).toEqual([2, 'y']);
  });
});

// ---------------------------------------------------------------------------
// partition
// ---------------------------------------------------------------------------
describe('partition', () => {
  it('splits numbers into evens and odds', () => {
    const [evens, odds] = partition([1, 2, 3, 4, 5, 6], (n) => n % 2 === 0);
    expect(evens).toEqual([2, 4, 6]);
    expect(odds).toEqual([1, 3, 5]);
  });

  it('returns [[], []] for empty input', () => {
    const [a, b] = partition([], () => true);
    expect(a).toEqual([]);
    expect(b).toEqual([]);
  });

  it('puts all elements in first group when predicate always true', () => {
    const [matching, nonMatching] = partition([1, 2, 3], () => true);
    expect(matching).toEqual([1, 2, 3]);
    expect(nonMatching).toEqual([]);
  });

  it('puts all elements in second group when predicate always false', () => {
    const [matching, nonMatching] = partition([1, 2, 3], () => false);
    expect(matching).toEqual([]);
    expect(nonMatching).toEqual([1, 2, 3]);
  });

  it('handles single-element array — matching', () => {
    const [a, b] = partition([5], (n) => n > 0);
    expect(a).toEqual([5]);
    expect(b).toEqual([]);
  });

  it('handles single-element array — non-matching', () => {
    const [a, b] = partition([-5], (n) => n > 0);
    expect(a).toEqual([]);
    expect(b).toEqual([-5]);
  });

  it('preserves order within each partition', () => {
    const [long, short] = partition(['hello', 'hi', 'world', 'ok'], (s) => s.length > 2);
    expect(long).toEqual(['hello', 'world']);
    expect(short).toEqual(['hi', 'ok']);
  });

  it('works with object arrays', () => {
    const users = [
      { name: 'Alice', active: true },
      { name: 'Bob', active: false },
      { name: 'Carol', active: true },
    ];
    const [active, inactive] = partition(users, (u) => u.active);
    expect(active).toHaveLength(2);
    expect(inactive).toHaveLength(1);
    expect(active.map((u) => u.name)).toEqual(['Alice', 'Carol']);
    expect(inactive[0].name).toBe('Bob');
  });

  it('returns a proper tuple type [T[], T[]]', () => {
    const result = partition([1, 2, 3], (n) => n > 1);
    // Verifying the tuple structure
    expect(Array.isArray(result[0])).toBe(true);
    expect(Array.isArray(result[1])).toBe(true);
    expect(result).toHaveLength(2);
  });
});
