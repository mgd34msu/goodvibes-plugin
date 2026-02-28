/**
 * Statistical utilities for numeric datasets.
 * Variance and standardDeviation use population statistics (divided by n).
 */

/**
 * Shared numeric ascending sort comparator.
 */
const numericAsc = (a: number, b: number): number => a - b;

/**
 * Throws if any value in the array is not finite (rejects NaN, Infinity, -Infinity).
 */
function assertFiniteValues(values: readonly number[]): void {
  for (const v of values) {
    if (!Number.isFinite(v)) {
      throw new Error(`All values must be finite numbers, got ${v}`);
    }
  }
}

/**
 * Computes the arithmetic mean of an array of numbers.
 * @throws {Error} When the array is empty or contains non-finite values.
 */
export function mean(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error('Cannot compute mean of an empty array');
  }
  assertFiniteValues(values);
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Computes the median of an array of numbers.
 * For even-length arrays, returns the average of the two middle values.
 * @throws {Error} When the array is empty or contains non-finite values.
 */
export function median(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error('Cannot compute median of an empty array');
  }
  assertFiniteValues(values);
  const sorted = [...values].sort(numericAsc);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Computes the mode(s) of an array of numbers.
 * Returns all values that appear most frequently.
 * Result is sorted in ascending order.
 * @throws {Error} When the array is empty or contains non-finite values.
 */
export function mode(values: readonly number[]): number[] {
  if (values.length === 0) {
    throw new Error('Cannot compute mode of an empty array');
  }
  assertFiniteValues(values);

  const frequency = new Map<number, number>();
  for (const v of values) {
    frequency.set(v, (frequency.get(v) ?? 0) + 1);
  }

  let maxFreq = 0;
  for (const count of frequency.values()) {
    if (count > maxFreq) maxFreq = count;
  }

  return Array.from(frequency.entries())
    .filter(([, count]) => count === maxFreq)
    .map(([v]) => v)
    .sort(numericAsc);
}

/**
 * Computes the population variance of an array of numbers.
 * @throws {Error} When the array is empty or contains non-finite values.
 */
export function variance(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error('Cannot compute variance of an empty array');
  }
  assertFiniteValues(values);
  const avg = mean(values);
  return values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
}

/**
 * Computes the population standard deviation of an array of numbers.
 * @throws {Error} When the array is empty or contains non-finite values.
 */
export function standardDeviation(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error('Cannot compute standard deviation of an empty array');
  }
  assertFiniteValues(values);
  return Math.sqrt(variance(values));
}
