/**
 * Collection utility functions.
 * All functions handle empty arrays gracefully and use proper TypeScript generics.
 */

/**
 * Split an array into chunks of the given size.
 * The last chunk may be smaller if the array length is not divisible by size.
 *
 * @param array - The source array
 * @param size - The desired chunk size (must be >= 1)
 * @returns Array of chunks
 * @throws {RangeError} If size is less than 1
 */
export function chunk<T>(array: T[], size: number): T[][] {
  if (size < 1) {
    throw new RangeError(`Chunk size must be >= 1, got ${size}`);
  }
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

/**
 * Remove duplicate values from an array.
 * Equality is determined by value for primitives (uses Set semantics / SameValueZero).
 *
 * @param array - The source array
 * @returns New array with duplicates removed, preserving first occurrence order
 */
export function unique<T>(array: T[]): T[] {
  return [...new Set(array)];
}

/**
 * Group array elements by a key derived from each element.
 *
 * @param array - The source array
 * @param keyFn - Function that returns the grouping key for an element
 * @returns Object mapping keys to arrays of elements
 */
export function groupBy<T, K extends PropertyKey>(
  array: T[],
  keyFn: (item: T) => K
): Partial<Record<K, T[]>> {
  const result = {} as Partial<Record<K, T[]>>;
  for (const item of array) {
    const key = keyFn(item);
    const group = result[key];
    if (group !== undefined) {
      group.push(item);
    } else {
      result[key] = [item];
    }
  }
  return result;
}

/**
 * Zip multiple arrays together, stopping at the length of the shortest.
 * Each element in the result is a tuple of the corresponding elements from each input.
 *
 * @param arrays - Two or more arrays to zip
 * @returns Array of tuples
 */
export function zip<T extends unknown[][]>(
  ...arrays: T
): { [K in keyof T]: T[K] extends (infer U)[] ? U : never }[] {
  if (arrays.length === 0) return [];
  const minLen = Math.min(...arrays.map((a) => a.length));
  const result: unknown[][] = [];
  for (let i = 0; i < minLen; i++) {
    result.push(arrays.map((a) => a[i]));
  }
  return result as { [K in keyof T]: T[K] extends (infer U)[] ? U : never }[];
}

/**
 * Partition an array into two groups based on a predicate.
 *
 * @param array - The source array
 * @param predicateFn - Returns true for elements to include in the first group
 * @returns Tuple of [matching, nonMatching]
 */
export function partition<T>(
  array: T[],
  predicateFn: (item: T) => boolean
): [T[], T[]] {
  const matching: T[] = [];
  const nonMatching: T[] = [];
  for (const item of array) {
    if (predicateFn(item)) {
      matching.push(item);
    } else {
      nonMatching.push(item);
    }
  }
  return [matching, nonMatching];
}
