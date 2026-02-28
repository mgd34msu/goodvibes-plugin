/**
 * Math utilities module
 */

/**
 * Clamp a number to [min, max] range.
 * @throws {RangeError} if min > max
 */
export function clamp(value: number, min: number, max: number): number {
  if (min > max) {
    throw new RangeError(`clamp: min (${min}) must not be greater than max (${max})`);
  }
  return Math.min(Math.max(value, min), max);
}

/**
 * Linear interpolation between a and b by factor t.
 * t=0 returns a, t=1 returns b. t outside [0,1] extrapolates.
 * If any argument is NaN or Infinity, the result propagates NaN/Infinity
 * per IEEE 754 arithmetic — this is mathematically correct behavior.
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Round a number to N decimal places.
 * Uses exponential notation to avoid IEEE 754 floating-point precision errors.
 * If value is NaN or Infinity, returns NaN or Infinity per IEEE 754 arithmetic.
 * @throws {RangeError} if decimals is negative or non-integer
 */
export function roundTo(value: number, decimals: number): number {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new RangeError(`roundTo: decimals must be a non-negative integer, got ${decimals}`);
  }
  if (!isFinite(value)) return value;
  return Number(Math.round(Number(`${value}e${decimals}`)) + `e-${decimals}`);
}

/**
 * Sum an array of numbers. Returns 0 for an empty array.
 * If any element is NaN or Infinity, the result propagates NaN/Infinity
 * per IEEE 754 arithmetic — this is mathematically correct behavior.
 */
export function sum(numbers: number[]): number {
  return numbers.reduce((acc, n) => acc + n, 0);
}

/**
 * Average of an array of numbers.
 * @throws {RangeError} if the array is empty
 */
export function average(numbers: number[]): number {
  if (numbers.length === 0) {
    throw new RangeError('average: cannot compute average of an empty array');
  }
  return sum(numbers) / numbers.length;
}
