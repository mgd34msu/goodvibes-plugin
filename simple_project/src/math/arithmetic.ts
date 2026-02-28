/**
 * Arithmetic utilities providing basic math operations.
 */

/**
 * Throws if any argument is not a finite number (rejects NaN, Infinity, -Infinity).
 */
function assertFinite(...args: number[]): void {
  for (const n of args) {
    if (!Number.isFinite(n)) {
      throw new Error(`Input must be a finite number, got ${n}`);
    }
  }
}

/**
 * Adds two numbers.
 * @throws {Error} When either input is NaN or non-finite.
 */
export function add(a: number, b: number): number {
  assertFinite(a, b);
  return a + b;
}

/**
 * Subtracts b from a.
 * @throws {Error} When either input is NaN or non-finite.
 */
export function subtract(a: number, b: number): number {
  assertFinite(a, b);
  return a - b;
}

/**
 * Multiplies two numbers.
 * @throws {Error} When either input is NaN or non-finite.
 */
export function multiply(a: number, b: number): number {
  assertFinite(a, b);
  return a * b;
}

/**
 * Divides a by b.
 * @throws {Error} When either input is NaN or non-finite.
 * @throws {Error} When b is zero.
 */
export function divide(a: number, b: number): number {
  assertFinite(a, b);
  if (b === 0) {
    throw new Error('Division by zero is not allowed');
  }
  return a / b;
}

/**
 * Returns the remainder of a divided by b (modulo).
 * @throws {Error} When either input is NaN or non-finite.
 * @throws {Error} When b is zero.
 */
export function modulo(a: number, b: number): number {
  assertFinite(a, b);
  if (b === 0) {
    throw new Error('Modulo by zero is not allowed');
  }
  return a % b;
}
