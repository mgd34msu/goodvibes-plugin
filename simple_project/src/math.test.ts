import { describe, it, expect } from 'vitest';
import { add, subtract, multiply, divide, clamp, lerp } from './math.js';

describe('add', () => {
  it('adds two positive integers', () => {
    expect(add(2, 3)).toBe(5);
  });

  it('adds a positive and a negative number', () => {
    expect(add(10, -4)).toBe(6);
  });

  it('adds two negative numbers', () => {
    expect(add(-3, -7)).toBe(-10);
  });

  it('adds with zero', () => {
    expect(add(0, 5)).toBe(5);
    expect(add(5, 0)).toBe(5);
    expect(add(0, 0)).toBe(0);
  });

  it('handles floating-point numbers', () => {
    expect(add(0.1, 0.2)).toBeCloseTo(0.3);
  });

  it('handles Infinity', () => {
    expect(add(Infinity, 1)).toBe(Infinity);
    expect(add(-Infinity, 1)).toBe(-Infinity);
    expect(add(Infinity, -Infinity)).toBeNaN();
  });

  it('propagates NaN', () => {
    expect(add(NaN, 1)).toBeNaN();
    expect(add(1, NaN)).toBeNaN();
  });
});

describe('subtract', () => {
  it('subtracts two positive integers', () => {
    expect(subtract(10, 3)).toBe(7);
  });

  it('subtracts resulting in a negative number', () => {
    expect(subtract(3, 10)).toBe(-7);
  });

  it('subtracts negative from positive', () => {
    expect(subtract(5, -3)).toBe(8);
  });

  it('subtracts with zero', () => {
    expect(subtract(0, 0)).toBe(0);
    expect(subtract(5, 0)).toBe(5);
    expect(subtract(0, 5)).toBe(-5);
  });

  it('handles floating-point numbers', () => {
    expect(subtract(0.3, 0.1)).toBeCloseTo(0.2);
  });

  it('handles Infinity', () => {
    expect(subtract(Infinity, 1)).toBe(Infinity);
    expect(subtract(1, Infinity)).toBe(-Infinity);
    expect(subtract(Infinity, Infinity)).toBeNaN();
  });

  it('propagates NaN', () => {
    expect(subtract(NaN, 1)).toBeNaN();
    expect(subtract(1, NaN)).toBeNaN();
  });
});

describe('multiply', () => {
  it('multiplies two positive integers', () => {
    expect(multiply(4, 3)).toBe(12);
  });

  it('multiplies positive by negative', () => {
    expect(multiply(4, -3)).toBe(-12);
  });

  it('multiplies two negative numbers', () => {
    expect(multiply(-4, -3)).toBe(12);
  });

  it('multiplies by zero', () => {
    expect(multiply(5, 0)).toBe(0);
    expect(multiply(0, 5)).toBe(0);
  });

  it('multiplies by one (identity)', () => {
    expect(multiply(7, 1)).toBe(7);
    expect(multiply(1, 7)).toBe(7);
  });

  it('handles floating-point numbers', () => {
    expect(multiply(0.1, 0.2)).toBeCloseTo(0.02);
  });

  it('handles Infinity', () => {
    expect(multiply(Infinity, 2)).toBe(Infinity);
    expect(multiply(-Infinity, 2)).toBe(-Infinity);
    expect(multiply(Infinity, 0)).toBeNaN();
  });

  it('propagates NaN', () => {
    expect(multiply(NaN, 3)).toBeNaN();
    expect(multiply(3, NaN)).toBeNaN();
  });
});

describe('divide', () => {
  it('divides two positive integers', () => {
    expect(divide(10, 2)).toBe(5);
  });

  it('divides resulting in a fraction', () => {
    expect(divide(1, 3)).toBeCloseTo(0.3333, 4);
  });

  it('divides negative by positive', () => {
    expect(divide(-10, 2)).toBe(-5);
  });

  it('divides positive by negative', () => {
    expect(divide(10, -2)).toBe(-5);
  });

  it('divides zero by a non-zero number', () => {
    expect(divide(0, 5)).toBe(0);
  });

  it('throws RangeError when divisor is zero', () => {
    expect(() => divide(10, 0)).toThrow(RangeError);
    expect(() => divide(10, 0)).toThrow('Division by zero is not allowed');
  });

  it('throws RangeError when both operands are zero', () => {
    expect(() => divide(0, 0)).toThrow(RangeError);
  });

  it('handles Infinity as dividend', () => {
    expect(divide(Infinity, 2)).toBe(Infinity);
    expect(divide(-Infinity, 2)).toBe(-Infinity);
  });

  it('handles Infinity as divisor', () => {
    expect(divide(10, Infinity)).toBe(0);
    expect(divide(10, -Infinity)).toBe(-0);
  });

  it('propagates NaN', () => {
    expect(divide(NaN, 2)).toBeNaN();
    expect(divide(2, NaN)).toBeNaN();
  });
});

describe('clamp', () => {
  it('returns the value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamps to min when value is below range', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('clamps to max when value is above range', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('returns min when value equals min', () => {
    expect(clamp(0, 0, 10)).toBe(0);
  });

  it('returns max when value equals max', () => {
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it('works with negative ranges', () => {
    expect(clamp(-5, -10, -1)).toBe(-5);
    expect(clamp(-15, -10, -1)).toBe(-10);
    expect(clamp(0, -10, -1)).toBe(-1);
  });

  it('works when min equals max (degenerate range)', () => {
    expect(clamp(5, 3, 3)).toBe(3);
    expect(clamp(3, 3, 3)).toBe(3);
  });

  it('handles floating-point bounds', () => {
    expect(clamp(0.5, 0.1, 0.9)).toBeCloseTo(0.5);
    expect(clamp(1.5, 0.1, 0.9)).toBeCloseTo(0.9);
  });

  it('handles Infinity bounds', () => {
    expect(clamp(5, -Infinity, Infinity)).toBe(5);
    expect(clamp(5, 10, Infinity)).toBe(10);
    expect(clamp(5, -Infinity, 0)).toBe(0);
  });

  it('propagates NaN value', () => {
    expect(clamp(NaN, 0, 10)).toBeNaN();
  });

  it('throws RangeError when min is greater than max', () => {
    expect(() => clamp(5, 10, 0)).toThrow(RangeError);
    expect(() => clamp(5, 10, 0)).toThrow('min (10) must not be greater than max (0)');
    expect(() => clamp(0, 1, -1)).toThrow(RangeError);
  });
});

describe('lerp', () => {
  it('returns start when t is 0', () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(5, 100, 0)).toBe(5);
  });

  it('returns end when t is 1', () => {
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(5, 100, 1)).toBe(100);
  });

  it('returns midpoint when t is 0.5', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(2, 8, 0.5)).toBe(5);
  });

  it('interpolates at t = 0.25', () => {
    expect(lerp(0, 100, 0.25)).toBe(25);
  });

  it('interpolates at t = 0.75', () => {
    expect(lerp(0, 100, 0.75)).toBe(75);
  });

  it('works with negative start and end values', () => {
    expect(lerp(-10, 10, 0.5)).toBe(0);
    expect(lerp(-10, 10, 0)).toBe(-10);
    expect(lerp(-10, 10, 1)).toBe(10);
  });

  it('extrapolates when t is outside [0, 1]', () => {
    expect(lerp(0, 10, 2)).toBe(20);
    expect(lerp(0, 10, -1)).toBe(-10);
  });

  it('works when start equals end', () => {
    expect(lerp(5, 5, 0)).toBe(5);
    expect(lerp(5, 5, 0.5)).toBe(5);
    expect(lerp(5, 5, 1)).toBe(5);
  });

  it('handles Infinity', () => {
    expect(lerp(0, Infinity, 0.5)).toBe(Infinity);
    expect(lerp(-Infinity, Infinity, 0.5)).toBeNaN();
    expect(lerp(0, 10, Infinity)).toBe(Infinity);
  });

  it('propagates NaN', () => {
    expect(lerp(NaN, 10, 0.5)).toBeNaN();
    expect(lerp(0, NaN, 0.5)).toBeNaN();
    expect(lerp(0, 10, NaN)).toBeNaN();
  });
});
