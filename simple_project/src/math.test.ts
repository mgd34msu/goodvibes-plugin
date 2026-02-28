import { describe, it, expect } from 'vitest';
import { clamp, lerp, roundTo, sum, average } from './math.js';

describe('clamp', () => {
  it('returns value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('returns min when value is below range', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('returns max when value is above range', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('returns min when value equals min', () => {
    expect(clamp(0, 0, 10)).toBe(0);
  });

  it('returns max when value equals max', () => {
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it('works with negative ranges', () => {
    expect(clamp(-3, -10, -1)).toBe(-3);
    expect(clamp(0, -10, -1)).toBe(-1);
    expect(clamp(-20, -10, -1)).toBe(-10);
  });

  it('works when min equals max', () => {
    expect(clamp(5, 3, 3)).toBe(3);
    expect(clamp(3, 3, 3)).toBe(3);
  });

  it('works with floating point values', () => {
    expect(clamp(0.5, 0.1, 0.9)).toBe(0.5);
    expect(clamp(1.5, 0.1, 0.9)).toBe(0.9);
  });

  it('throws RangeError when min > max', () => {
    expect(() => clamp(5, 10, 0)).toThrow(RangeError);
    expect(() => clamp(5, 10, 0)).toThrow('min (10) must not be greater than max (0)');
  });

  it('returns NaN when value is NaN', () => {
    expect(clamp(NaN, 0, 10)).toBeNaN();
  });

  it('returns min when min is NaN (NaN comparisons are false)', () => {
    expect(clamp(5, NaN, 10)).toBeNaN();
  });
});

describe('lerp', () => {
  it('returns a when t=0', () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(5, 20, 0)).toBe(5);
  });

  it('returns b when t=1', () => {
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(5, 20, 1)).toBe(20);
  });

  it('returns midpoint when t=0.5', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(10, 20, 0.5)).toBe(15);
  });

  it('interpolates correctly for arbitrary t', () => {
    expect(lerp(0, 100, 0.25)).toBe(25);
    expect(lerp(0, 100, 0.75)).toBe(75);
  });

  it('extrapolates when t < 0', () => {
    expect(lerp(0, 10, -1)).toBe(-10);
  });

  it('extrapolates when t > 1', () => {
    expect(lerp(0, 10, 2)).toBe(20);
  });

  it('works with negative values', () => {
    expect(lerp(-10, 10, 0.5)).toBe(0);
    expect(lerp(-20, -10, 0.5)).toBe(-15);
  });

  it('returns a when a equals b', () => {
    expect(lerp(5, 5, 0.5)).toBe(5);
  });

  it('propagates NaN when t is NaN', () => {
    expect(lerp(0, 10, NaN)).toBeNaN();
  });

  it('propagates NaN when a or b is NaN', () => {
    expect(lerp(NaN, 10, 0.5)).toBeNaN();
    expect(lerp(0, NaN, 0.5)).toBeNaN();
  });
});

describe('roundTo', () => {
  it('rounds to 0 decimal places', () => {
    expect(roundTo(3.7, 0)).toBe(4);
    expect(roundTo(3.2, 0)).toBe(3);
  });

  it('rounds to 1 decimal place', () => {
    expect(roundTo(3.14159, 1)).toBe(3.1);
    expect(roundTo(3.75, 1)).toBe(3.8);
  });

  it('rounds to 2 decimal places', () => {
    expect(roundTo(3.14159, 2)).toBe(3.14);
    expect(roundTo(3.145, 2)).toBe(3.15);
  });

  it('rounds to many decimal places', () => {
    expect(roundTo(1.23456789, 5)).toBe(1.23457);
  });

  it('rounds negative numbers correctly', () => {
    expect(roundTo(-3.7, 0)).toBe(-4);
    expect(roundTo(-3.14159, 2)).toBe(-3.14);
  });

  it('returns integer when already rounded', () => {
    expect(roundTo(5, 2)).toBe(5);
    expect(roundTo(1.5, 1)).toBe(1.5);
  });

  it('throws RangeError for negative decimals', () => {
    expect(() => roundTo(3.14, -1)).toThrow(RangeError);
    expect(() => roundTo(3.14, -1)).toThrow('decimals must be a non-negative integer');
  });

  it('throws RangeError for non-integer decimals', () => {
    expect(() => roundTo(3.14, 1.5)).toThrow(RangeError);
    expect(() => roundTo(3.14, 1.5)).toThrow('decimals must be a non-negative integer');
  });

  it('fixes IEEE 754 floating-point precision (1.255 rounds to 1.26)', () => {
    expect(roundTo(1.255, 2)).toBe(1.26);
  });

  it('returns NaN when value is NaN', () => {
    expect(roundTo(NaN, 2)).toBeNaN();
  });

  it('returns Infinity when value is Infinity', () => {
    expect(roundTo(Infinity, 2)).toBe(Infinity);
    expect(roundTo(-Infinity, 2)).toBe(-Infinity);
  });
});

describe('sum', () => {
  it('returns 0 for an empty array', () => {
    expect(sum([])).toBe(0);
  });

  it('returns the single element for a one-element array', () => {
    expect(sum([5])).toBe(5);
    expect(sum([-3])).toBe(-3);
  });

  it('sums positive numbers', () => {
    expect(sum([1, 2, 3, 4, 5])).toBe(15);
  });

  it('sums negative numbers', () => {
    expect(sum([-1, -2, -3])).toBe(-6);
  });

  it('sums mixed positive and negative numbers', () => {
    expect(sum([-5, 5, -3, 3])).toBe(0);
  });

  it('sums floating point numbers', () => {
    expect(sum([0.1, 0.2, 0.3])).toBeCloseTo(0.6);
  });

  it('sums large arrays', () => {
    const numbers = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(sum(numbers)).toBe(5050);
  });

  it('propagates NaN when array contains NaN', () => {
    expect(sum([1, NaN, 3])).toBeNaN();
  });

  it('propagates Infinity when array contains Infinity', () => {
    expect(sum([1, Infinity, 3])).toBe(Infinity);
  });
});

describe('average', () => {
  it('throws RangeError for an empty array', () => {
    expect(() => average([])).toThrow(RangeError);
    expect(() => average([])).toThrow('cannot compute average of an empty array');
  });

  it('returns the single element for a one-element array', () => {
    expect(average([5])).toBe(5);
    expect(average([-3])).toBe(-3);
  });

  it('computes average of positive numbers', () => {
    expect(average([1, 2, 3, 4, 5])).toBe(3);
  });

  it('computes average of negative numbers', () => {
    expect(average([-1, -2, -3])).toBe(-2);
  });

  it('computes average of mixed numbers', () => {
    expect(average([-5, 5])).toBe(0);
    expect(average([1, 3])).toBe(2);
  });

  it('computes average of floating point numbers', () => {
    expect(average([1.5, 2.5, 3.0])).toBeCloseTo(2.3333, 4);
  });

  it('computes average of equal numbers', () => {
    expect(average([7, 7, 7, 7])).toBe(7);
  });

  it('propagates Infinity when array contains Infinity', () => {
    expect(average([Infinity, 1])).toBe(Infinity);
  });

  it('propagates NaN when array contains NaN', () => {
    expect(average([1, NaN, 3])).toBeNaN();
  });
});
