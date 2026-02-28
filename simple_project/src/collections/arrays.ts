/**
 * Array utility functions.
 */

/**
 * Splits an array into chunks of a specified size.
 * @param arr - The array to chunk.
 * @param size - The chunk size (must be >= 1).
 * @returns Array of chunks.
 */
export function chunk<T>(arr: T[], size: number): T[][] {
  if (typeof size !== 'number' || isNaN(size) || !isFinite(size)) {
    throw new RangeError('chunk: size must be a finite number');
  }
  const normalizedSize = Math.floor(size);
  if (normalizedSize < 1) throw new RangeError('chunk: size must be >= 1');
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += normalizedSize) {
    result.push(arr.slice(i, i + normalizedSize));
  }
  return result;
}

/**
 * Flattens a nested array one level deep.
 * @param arr - The nested array to flatten.
 * @returns A new flattened array.
 */
export function flatten<T>(arr: T[][]): T[] {
  return arr.flat(1) as T[];
}

/**
 * Returns unique elements of an array (preserves first occurrence).
 * @param arr - The input array.
 * @returns Array with duplicate values removed.
 */
export function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

/**
 * Returns elements present in both arrays (set intersection).
 * @param a - First array.
 * @param b - Second array.
 * @returns Array of elements in both a and b.
 */
export function intersection<T>(a: T[], b: T[]): T[] {
  const setB = new Set(b);
  return [...new Set(a)].filter((item) => setB.has(item));
}

/**
 * Returns elements in the first array that are not in the second (set difference).
 * @param a - Source array.
 * @param b - Array of values to exclude.
 * @returns Array of elements in a but not in b.
 */
export function difference<T>(a: T[], b: T[]): T[] {
  const setB = new Set(b);
  return a.filter((item) => !setB.has(item));
}

/**
 * Combines two arrays into pairs. Stops at the shorter array.
 * @param a - First array.
 * @param b - Second array.
 * @returns Array of [a[i], b[i]] tuples.
 */
export function zip<A, B>(a: A[], b: B[]): [A, B][] {
  const length = Math.min(a.length, b.length);
  const result: [A, B][] = [];
  for (let i = 0; i < length; i++) {
    result.push([a[i], b[i]]);
  }
  return result;
}

/**
 * Groups array elements by a key derived from each element.
 * @param arr - The array to group.
 * @param keyFn - Function that returns the group key for each element.
 * @returns A record mapping each key to the array of elements with that key.
 */
export function groupBy<T, K extends string | number | symbol>(
  arr: T[],
  keyFn: (item: T) => K
): Record<K, T[]> {
  return arr.reduce(
    (acc, item) => {
      const key = keyFn(item);
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(item);
      return acc;
    },
    {} as Record<K, T[]>
  );
}
