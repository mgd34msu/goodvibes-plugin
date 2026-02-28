import { describe, it, expect } from 'vitest';
import { add, subtract, multiply, divide, clamp } from './math.js';

describe('add', () => {
  it('adds two positive numbers', () => {
    expect(add(2, 3)).toBe(5);
  });

  it('adds a positive and a negative number', () => {
    expect(add(5, -3)).toBe(2);
  });

  it('adds two negative numbers', () => {
    expect(add(-4, -6)).toBe(-10);
  });

  it('adds zero to a number', () => {
    expect(add(7, 0)).toBe(7);
    expect(add(0, 7)).toBe(7);
  });

  it('handles floating point numbers', () => {
    expect(add(0.1, 0.2)).toBeCloseTo(0.3);
  });
});

describe('subtract', () => {
  it('subtracts a smaller number from a larger one', () => {
    expect(subtract(10, 4)).toBe(6);
  });

  it('subtracts resulting in a negative number', () => {
    expect(subtract(3, 9)).toBe(-6);
  });

  it('subtracts zero', () => {
    expect(subtract(5, 0)).toBe(5);
  });

  it('subtracts negative numbers', () => {
    expect(subtract(-3, -5)).toBe(2);
  });

  it('handles floating point numbers', () => {
    expect(subtract(0.3, 0.1)).toBeCloseTo(0.2);
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
    expect(multiply(999, 0)).toBe(0);
    expect(multiply(0, 999)).toBe(0);
  });

  it('multiplies by one', () => {
    expect(multiply(7, 1)).toBe(7);
  });

  it('handles floating point numbers', () => {
    expect(multiply(0.1, 3)).toBeCloseTo(0.3);
  });
});

describe('divide', () => {
  it('divides two positive numbers', () => {
    expect(divide(10, 2)).toBe(5);
  });

  it('divides resulting in a fraction', () => {
    expect(divide(1, 4)).toBe(0.25);
  });

  it('divides a negative by a positive number', () => {
    expect(divide(-9, 3)).toBe(-3);
  });

  it('divides two negative numbers', () => {
    expect(divide(-8, -4)).toBe(2);
  });

  it('divides zero by a non-zero number', () => {
    expect(divide(0, 5)).toBe(0);
  });

  it('throws RangeError on division by zero', () => {
    expect(() => divide(10, 0)).toThrow(RangeError);
    expect(() => divide(10, 0)).toThrow('Division by zero is not allowed');
  });

  it('throws RangeError when dividing zero by zero', () => {
    expect(() => divide(0, 0)).toThrow(RangeError);
  });
});

describe('clamp', () => {
  it('returns value when within range', () => {
    expect(clamp(5, 1, 10)).toBe(5);
  });

  it('returns min when value is below min', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('returns max when value exceeds max', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('returns min when value equals min (boundary)', () => {
    expect(clamp(0, 0, 10)).toBe(0);
  });

  it('returns max when value equals max (boundary)', () => {
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it('returns value when min equals max and value equals that', () => {
    expect(clamp(5, 5, 5)).toBe(5);
  });

  it('clamps to the single allowed value when min equals max', () => {
    expect(clamp(99, 5, 5)).toBe(5);
    expect(clamp(-99, 5, 5)).toBe(5);
  });

  it('handles negative ranges', () => {
    expect(clamp(-3, -10, -1)).toBe(-3);
    expect(clamp(0, -10, -1)).toBe(-1);
    expect(clamp(-20, -10, -1)).toBe(-10);
  });

  it('handles floating point boundaries', () => {
    expect(clamp(0.5, 0.0, 1.0)).toBeCloseTo(0.5);
    expect(clamp(1.5, 0.0, 1.0)).toBeCloseTo(1.0);
  });

  it('throws RangeError when min is greater than max', () => {
    expect(() => clamp(5, 10, 0)).toThrow(RangeError);
    expect(() => clamp(5, 10, 0)).toThrow('min (10) must not be greater than max (0)');
  });
});
