/**
 * Adds two numbers together.
 * @param a - First operand
 * @param b - Second operand
 * @returns The sum of a and b
 */
export function add(a: number, b: number): number {
  return a + b;
}

/**
 * Subtracts the second number from the first.
 * @param a - Minuend
 * @param b - Subtrahend
 * @returns The difference of a minus b
 */
export function subtract(a: number, b: number): number {
  return a - b;
}

/**
 * Multiplies two numbers together.
 * @param a - First factor
 * @param b - Second factor
 * @returns The product of a and b
 */
export function multiply(a: number, b: number): number {
  return a * b;
}

/**
 * Divides the first number by the second.
 * @param a - Dividend
 * @param b - Divisor (must not be zero)
 * @returns The quotient of a divided by b
 * @throws {Error} When b is zero
 * @throws {Error} When a or b is NaN
 * @remarks When a or b is Infinity, follows IEEE 754 rules:
 *   - Infinity / finite = Infinity
 *   - finite / Infinity = 0
 *   - Infinity / Infinity = NaN (but NaN inputs are rejected before this occurs)
 */
export function divide(a: number, b: number): number {
  if (Number.isNaN(a) || Number.isNaN(b)) {
    throw new Error('NaN inputs are not allowed');
  }
  if (b === 0) {
    throw new Error('Division by zero is not allowed');
  }
  return a / b;
}
