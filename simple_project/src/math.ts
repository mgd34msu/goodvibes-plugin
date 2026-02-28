/**
 * Math utility functions.
 * All functions are pure and handle edge cases explicitly.
 */

/**
 * Adds two numbers.
 */
export function add(a: number, b: number): number {
  return a + b;
}

/**
 * Subtracts b from a.
 */
export function subtract(a: number, b: number): number {
  return a - b;
}

/**
 * Multiplies two numbers.
 */
export function multiply(a: number, b: number): number {
  return a * b;
}

/**
 * Divides a by b.
 * @throws {RangeError} When b is zero.
 */
export function divide(a: number, b: number): number {
  if (b === 0) {
    throw new RangeError('Division by zero is not allowed');
  }
  return a / b;
}

/**
 * Clamps value between min and max (inclusive).
 * @throws {RangeError} When min is greater than max.
 */
export function clamp(value: number, min: number, max: number): number {
  if (min > max) {
    throw new RangeError(`min (${min}) must not be greater than max (${max})`);
  }
  return Math.min(Math.max(value, min), max);
}
