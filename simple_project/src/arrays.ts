/**
 * Array utilities module.
 * Provides common array operations with full TypeScript generics.
 */

/**
 * Splits an array into chunks of the specified size.
 * The last chunk may be smaller if the array length is not evenly divisible.
 *
 * @param arr - The array to split
 * @param size - The maximum size of each chunk (must be a positive integer)
 * @returns An array of chunks
 * @throws {RangeError} If size is not a positive integer
 */
export function chunk<T>(arr: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size <= 0) {
    throw new RangeError(`chunk: size must be a positive integer, got ${size}`);
  }
  if (arr.length === 0) {
    return [];
  }
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

/**
 * Returns the unique elements of an array, preserving insertion order.
 * Uses strict equality (===) for comparison via Set.
 *
 * @param arr - The array to deduplicate
 * @returns A new array containing only the first occurrence of each element
 */
export function unique<T>(arr: readonly T[]): T[] {
  return Array.from(new Set(arr));
}

/**
 * Groups array elements by a key derived from each element.
 *
 * @param arr - The array to group
 * @param keyFn - A function that returns the group key string for each element
 * @returns An object whose keys are the group keys and values are arrays of elements
 */
export function groupBy<T>(
  arr: readonly T[],
  keyFn: (item: T) => string,
): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of arr) {
    const key = keyFn(item);
    const group = result[key] ?? (result[key] = []);
    group.push(item);
  }
  return result;
}

/**
 * Elements accepted by {@link flatten}: scalars or one-level-deep arrays.
 *
 * The one-level constraint is a deliberate design choice — `flatten` is
 * intentionally shallow. Callers needing deep flattening should use a
 * recursive utility instead.
 */
type Flattenable<T> = readonly (T | readonly T[])[];

/**
 * Flattens an array one level deep.
 * Elements that are arrays are spread into the result;
 * non-array elements are included as-is.
 *
 * @param arr - The array to flatten (elements may be T or T[])
 * @returns A new flat array of type T[]
 */
export function flatten<T>(arr: Flattenable<T>): T[] {
  // The `as T[]` cast is safe: `Flattenable<T>` constrains elements to exactly
  // one level of nesting (T | readonly T[]), so `flat(1)` always produces T[].
  // TypeScript cannot verify this statically because `flat`'s return type is
  // widened for arbitrary depth.
  return [...arr].flat(1) as T[];
}

/**
 * Returns the intersection of two arrays — elements present in both.
 * The result preserves the order of elements as they appear in `a`
 * and contains no duplicates.
 *
 * @param a - First array
 * @param b - Second array
 * @returns A new array of elements common to both arrays
 */
export function intersect<T>(a: readonly T[], b: readonly T[]): T[] {
  const setB = new Set(b);
  const seen = new Set<T>();
  const result: T[] = [];
  for (const item of a) {
    if (setB.has(item) && !seen.has(item)) {
      result.push(item);
      seen.add(item);
    }
  }
  return result;
}
