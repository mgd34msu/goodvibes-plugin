/**
 * Pure mathematical utility functions.
 * All functions are stateless and have no side effects.
 */

/**
 * Adds two numbers together.
 * @param a - The first operand.
 * @param b - The second operand.
 * @returns The sum of `a` and `b`.
 */
export function add(a: number, b: number): number {
  return a + b;
}

/**
 * Subtracts the second number from the first.
 * @param a - The minuend.
 * @param b - The subtrahend.
 * @returns The difference `a - b`.
 */
export function subtract(a: number, b: number): number {
  return a - b;
}

/**
 * Multiplies two numbers together.
 * @param a - The first factor.
 * @param b - The second factor.
 * @returns The product of `a` and `b`.
 */
export function multiply(a: number, b: number): number {
  return a * b;
}

/**
 * Divides the first number by the second.
 * Throws a RangeError if the divisor is zero.
 *
 * Per IEEE 754 semantics:
 * - If either operand is `NaN`, returns `NaN`.
 * - `Infinity / finite` returns `±Infinity`.
 * - `finite / Infinity` returns `±0`.
 * - `Infinity / Infinity` returns `NaN`.
 *
 * @param a - The dividend.
 * @param b - The divisor. Must not be zero.
 * @throws {RangeError} When `b` is zero (including `-0`).
 * @returns The quotient `a / b`.
 */
export function divide(a: number, b: number): number {
  if (b === 0) {
    throw new RangeError('Division by zero is not allowed');
  }
  return a / b;
}

/**
 * Clamps a value within the inclusive range [min, max].
 * If `value` is less than `min`, returns `min`.
 * If `value` is greater than `max`, returns `max`.
 * Otherwise returns `value`.
 * @param value - The number to clamp.
 * @param min - The lower bound of the range.
 * @param max - The upper bound of the range (must be >= min).
 * @throws {RangeError} When `min` is greater than `max`.
 * @returns The clamped value. If `value` is NaN, returns NaN (IEEE 754 NaN propagation via `Math.min`/`Math.max`).
 */
export function clamp(value: number, min: number, max: number): number {
  if (min > max) {
    throw new RangeError(`min (${min}) must not be greater than max (${max})`);
  }
  return Math.min(Math.max(value, min), max);
}

/**
 * Linearly interpolates between two values.
 * At `t = 0` returns `start`; at `t = 1` returns `end`.
 * Values of `t` outside [0, 1] extrapolate beyond the range.
 * @param start - The start value (returned when `t === 0`).
 * @param end - The end value (returned when `t === 1`).
 * @param t - The interpolation factor.
 * @returns The interpolated value `start + (end - start) * t`. If any argument is NaN, returns NaN (IEEE 754 NaN propagation).
 */
export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}
