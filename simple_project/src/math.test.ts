import { describe, it, expect } from 'vitest';
import { add, subtract, multiply, divide } from './math.js';

describe('add', () => {
  it('adds two positive numbers', () => {
    expect(add(2, 3)).toBe(5);
  });

  it('adds a positive and a negative number', () => {
    expect(add(10, -4)).toBe(6);
  });

  it('adds two negative numbers', () => {
    expect(add(-3, -7)).toBe(-10);
  });

  it('adds zero to a number', () => {
    expect(add(5, 0)).toBe(5);
    expect(add(0, 5)).toBe(5);
  });

  it('adds two zeros', () => {
    expect(add(0, 0)).toBe(0);
  });

  it('handles floating point numbers', () => {
    expect(add(0.1, 0.2)).toBeCloseTo(0.3);
  });

  it('handles large numbers', () => {
    expect(add(1_000_000, 2_000_000)).toBe(3_000_000);
  });
});

describe('subtract', () => {
  it('subtracts two positive numbers', () => {
    expect(subtract(10, 4)).toBe(6);
  });

  it('subtracts a larger number from a smaller one', () => {
    expect(subtract(3, 7)).toBe(-4);
  });

  it('subtracts zero from a number', () => {
    expect(subtract(5, 0)).toBe(5);
  });

  it('subtracts a number from itself', () => {
    expect(subtract(9, 9)).toBe(0);
  });

  it('subtracts two negative numbers', () => {
    expect(subtract(-5, -3)).toBe(-2);
  });

  it('handles floating point numbers', () => {
    expect(subtract(1.5, 0.5)).toBeCloseTo(1.0);
  });

  it('handles large numbers', () => {
    expect(subtract(1_000_000, 999_999)).toBe(1);
  });
});

describe('multiply', () => {
  it('multiplies two positive numbers', () => {
    expect(multiply(3, 4)).toBe(12);
  });

  it('multiplies a positive and a negative number', () => {
    expect(multiply(5, -2)).toBe(-10);
  });

  it('multiplies two negative numbers', () => {
    expect(multiply(-3, -4)).toBe(12);
  });

  it('multiplies by zero', () => {
    expect(multiply(100, 0)).toBe(0);
    expect(multiply(0, 100)).toBe(0);
  });

  it('multiplies by one', () => {
    expect(multiply(7, 1)).toBe(7);
    expect(multiply(1, 7)).toBe(7);
  });

  it('handles floating point numbers', () => {
    expect(multiply(0.5, 0.4)).toBeCloseTo(0.2);
  });

  it('handles large numbers', () => {
    expect(multiply(1_000, 1_000)).toBe(1_000_000);
  });
});

describe('divide', () => {
  it('divides two positive numbers', () => {
    expect(divide(10, 2)).toBe(5);
  });

  it('divides a positive by a negative number', () => {
    expect(divide(10, -2)).toBe(-5);
  });

  it('divides two negative numbers', () => {
    expect(divide(-12, -3)).toBe(4);
  });

  it('divides zero by a non-zero number', () => {
    expect(divide(0, 5)).toBe(0);
  });

  it('returns a fractional result', () => {
    expect(divide(1, 4)).toBe(0.25);
  });

  it('handles floating point division', () => {
    expect(divide(7.5, 2.5)).toBeCloseTo(3.0);
  });

  it('throws an error when dividing by zero', () => {
    expect(() => divide(10, 0)).toThrow('Division by zero is not allowed');
  });

  it('throws an error when dividing zero by zero', () => {
    expect(() => divide(0, 0)).toThrow('Division by zero is not allowed');
  });

  it('throws an Error instance when dividing by zero', () => {
    expect(() => divide(5, 0)).toThrowError(Error);
  });

  it('handles large number division', () => {
    expect(divide(1_000_000, 1_000)).toBe(1_000);
  });

  it('throws when dividend is NaN', () => {
    expect(() => divide(NaN, 2)).toThrow('NaN inputs are not allowed');
  });

  it('throws when divisor is NaN', () => {
    expect(() => divide(10, NaN)).toThrow('NaN inputs are not allowed');
  });

  it('returns Infinity when dividing Infinity by a finite number', () => {
    expect(divide(Infinity, 2)).toBe(Infinity);
  });

  it('returns 0 when dividing a finite number by Infinity', () => {
    expect(divide(10, Infinity)).toBe(0);
  });

  it('handles Number.MAX_SAFE_INTEGER divided by 1', () => {
    expect(divide(Number.MAX_SAFE_INTEGER, 1)).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('edge cases (all operations)', () => {
  it('add with Infinity', () => {
    expect(add(Infinity, 1)).toBe(Infinity);
    expect(add(-Infinity, 1)).toBe(-Infinity);
  });

  it('add with NaN propagates NaN', () => {
    expect(add(NaN, 1)).toBeNaN();
  });

  it('add with Number.MAX_SAFE_INTEGER', () => {
    expect(add(Number.MAX_SAFE_INTEGER, 0)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('subtract with Infinity', () => {
    expect(subtract(Infinity, 1)).toBe(Infinity);
  });

  it('subtract with NaN propagates NaN', () => {
    expect(subtract(NaN, 1)).toBeNaN();
  });

  it('subtract with Number.MAX_SAFE_INTEGER', () => {
    expect(subtract(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)).toBe(0);
  });

  it('multiply with Infinity', () => {
    expect(multiply(Infinity, 2)).toBe(Infinity);
    expect(multiply(Infinity, -1)).toBe(-Infinity);
  });

  it('multiply with NaN propagates NaN', () => {
    expect(multiply(NaN, 5)).toBeNaN();
  });

  it('multiply with Number.MAX_SAFE_INTEGER and 1', () => {
    expect(multiply(Number.MAX_SAFE_INTEGER, 1)).toBe(Number.MAX_SAFE_INTEGER);
  });
});
