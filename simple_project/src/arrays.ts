/**
 * Pure generic array utility functions.
 * All functions are immutable — they do not modify their inputs.
 */

/**
 * Splits an array into chunks of a specified size.
 * The last chunk may be smaller than the requested size.
 *
 * @param array - The source array to chunk
 * @param size - The maximum size of each chunk (must be >= 1)
 * @returns An array of arrays, each containing at most `size` elements
 *
 * @example
 * chunk([1, 2, 3, 4, 5], 2) // [[1, 2], [3, 4], [5]]
 */
export function chunk<T>(array: T[], size: number): T[][] {
  if (size < 1) {
    throw new RangeError(`chunk size must be >= 1, got ${size}`);
  }
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

/**
 * Returns a new array containing only the unique elements from the source array,
 * preserving the first occurrence order.
 *
 * @param array - The source array
 * @returns A new array with duplicate values removed
 *
 * @example
 * unique([1, 2, 2, 3, 1]) // [1, 2, 3]
 */
export function unique<T>(array: T[]): T[] {
  const seen = new Set<T>();
  const result: T[] = [];
  for (const item of array) {
    if (!seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result;
}

/**
 * Groups the elements of an array by the value returned by the key function.
 * The order of values within each group matches the original array order.
 *
 * @param array - The source array
 * @param keyFn - A function that returns the grouping key for each element
 * @returns A `Record` mapping each key to the array of elements with that key
 *
 * @example
 * groupBy([1, 2, 3, 4], (n) => n % 2 === 0 ? 'even' : 'odd')
 * // { odd: [1, 3], even: [2, 4] }
 */
export function groupBy<T>(
  array: T[],
  keyFn: (item: T) => string
): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of array) {
    const key = keyFn(item);
    if (!Object.prototype.hasOwnProperty.call(result, key)) {
      result[key] = [];
    }
    result[key].push(item);
  }
  return result;
}

/**
 * Flattens an array one level deep.
 * Elements that are themselves arrays are spread into the result;
 * all other elements are included as-is.
 *
 * @param array - An array whose elements may be arrays or plain values
 * @returns A new array flattened one level deep
 *
 * @example
 * flatten([[1, 2], [3], 4]) // [1, 2, 3, 4]
 */
export function flatten<T>(array: (T | T[])[]): T[] {
  const result: T[] = [];
  for (const item of array) {
    if (Array.isArray(item)) {
      for (const inner of item) {
        result.push(inner);
      }
    } else {
      result.push(item);
    }
  }
  return result;
}

/**
 * Returns the elements that appear in both arrays (set intersection).
 * Uses strict equality (`===`) for comparison.
 * Preserves the order of elements from `a` and returns each matching
 * element at most once.
 *
 * @param a - The first array
 * @param b - The second array
 * @returns A new array of elements present in both `a` and `b`
 *
 * @example
 * intersect([1, 2, 3], [2, 3, 4]) // [2, 3]
 */
export function intersect<T>(a: T[], b: T[]): T[] {
  const setB = new Set<T>(b);
  const seen = new Set<T>();
  const result: T[] = [];
  for (const item of a) {
    if (setB.has(item) && !seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result;
}

/**
 * Combines two arrays into an array of pairs, pairing elements by index.
 * The result length equals the length of the shorter input array.
 *
 * @param a - The first array
 * @param b - The second array
 * @returns An array of `[T, U]` tuples
 *
 * @example
 * zip([1, 2, 3], ['a', 'b', 'c']) // [[1, 'a'], [2, 'b'], [3, 'c']]
 */
export function zip<T, U>(a: T[], b: U[]): [T, U][] {
  const length = Math.min(a.length, b.length);
  const result: [T, U][] = [];
  for (let i = 0; i < length; i++) {
    result.push([a[i], b[i]]);
  }
  return result;
}
