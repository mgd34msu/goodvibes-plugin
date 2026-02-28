/**
 * Splits an array into chunks of the specified size.
 * @param arr - The array to chunk
 * @param size - The size of each chunk (must be a positive integer >= 1)
 * @returns Array of chunks
 */
export function chunk<T>(arr: T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError(`chunk size must be a positive integer >= 1, got ${size}`);
  }
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

/**
 * Returns a new array with duplicate values removed.
 * Preserves the first occurrence of each value.
 * Uses reference equality (===) for objects — two distinct objects with
 * identical properties are treated as different values.
 * @param arr - The array to deduplicate
 * @returns Array with unique values
 */
export function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

/**
 * Recursively flattens a nested array to the specified depth.
 * @param arr - The array to flatten
 * @param depth - Maximum recursion depth (default: Infinity)
 * @returns Flattened array
 */
export function flatten<T>(arr: (T | T[])[], depth: number = Infinity): T[] {
  return arr.flat(depth) as T[];
}

/**
 * Returns a new array with elements shuffled in random order
 * using the Fisher-Yates algorithm.
 * @param arr - The array to shuffle
 * @returns New shuffled array (does not mutate input)
 */
export function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
