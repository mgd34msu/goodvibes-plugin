/**
 * Collection utilities module
 * Pure TypeScript, no external dependencies
 */

/**
 * Split array into chunks of given size.
 * Last chunk may be smaller if array length is not divisible by size.
 */
export function chunk<T>(array: T[], size: number): T[][] {
  if (size <= 0) throw new RangeError('chunk size must be greater than 0');
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

/**
 * Remove duplicate elements, preserving first-occurrence order.
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
 * Flatten one level deep.
 */
export function flatten<T>(array: (T | T[])[]): T[] {
  const result: T[] = [];
  for (const item of array) {
    if (Array.isArray(item)) {
      result.push(...item);
    } else {
      result.push(item);
    }
  }
  return result;
}

/**
 * Group array elements by a property key.
 */
export function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of array) {
    const groupKey = String(item[key]);
    if (!Object.prototype.hasOwnProperty.call(result, groupKey)) {
      result[groupKey] = [];
    }
    result[groupKey].push(item);
  }
  return result;
}

/**
 * Zip two arrays into pairs, truncating to the length of the shorter array.
 */
export function zip<T, U>(a: T[], b: U[]): [T, U][] {
  const length = Math.min(a.length, b.length);
  const result: [T, U][] = [];
  for (let i = 0; i < length; i++) {
    result.push([a[i], b[i]]);
  }
  return result;
}

/**
 * Return elements in array `a` that are not in array `b`.
 */
export function difference<T>(a: T[], b: T[]): T[] {
  const bSet = new Set<T>(b);
  return a.filter((item) => !bSet.has(item));
}

/**
 * Return elements present in both arrays.
 */
export function intersection<T>(a: T[], b: T[]): T[] {
  const bSet = new Set<T>(b);
  return a.filter((item) => bSet.has(item));
}

/**
 * Return a new array with elements shuffled using Fisher-Yates algorithm.
 */
export function shuffle<T>(array: T[]): T[] {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}

/**
 * Split array into two groups based on a predicate.
 * First tuple element contains items where predicate is true,
 * second contains items where predicate is false.
 */
export function partition<T>(
  array: T[],
  predicate: (item: T) => boolean
): [T[], T[]] {
  const pass: T[] = [];
  const fail: T[] = [];
  for (const item of array) {
    if (predicate(item)) {
      pass.push(item);
    } else {
      fail.push(item);
    }
  }
  return [pass, fail];
}

/**
 * Generate an array of numbers from start (inclusive) to end (exclusive)
 * with the given step (default 1).
 * Negative step generates descending ranges.
 */
export function range(start: number, end: number, step = 1): number[] {
  if (step === 0) throw new RangeError('range step must not be zero');
  const result: number[] = [];
  if (step > 0) {
    for (let i = start; i < end; i += step) {
      result.push(i);
    }
  } else {
    for (let i = start; i > end; i += step) {
      result.push(i);
    }
  }
  return result;
}
