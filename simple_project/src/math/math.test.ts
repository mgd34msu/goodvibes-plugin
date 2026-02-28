import { describe, it, expect } from 'vitest';
import {
  add,
  subtract,
  multiply,
  divide,
  modulo,
} from './arithmetic.js';
import {
  mean,
  median,
  mode,
  standardDeviation,
  variance,
} from './statistics.js';

// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------

describe('add', () => {
  it('adds two positive integers', () => {
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
  });

  it('adds floating point numbers', () => {
    expect(add(0.1, 0.2)).toBeCloseTo(0.3);
  });

  it('handles very large numbers', () => {
    expect(add(Number.MAX_SAFE_INTEGER, 1)).toBe(Number.MAX_SAFE_INTEGER + 1);
  });

  it('throws on NaN input (first arg)', () => {
    expect(() => add(NaN, 1)).toThrow('Input must be a finite number');
  });

  it('throws on NaN input (second arg)', () => {
    expect(() => add(1, NaN)).toThrow('Input must be a finite number');
  });

  it('throws on Infinity input', () => {
    expect(() => add(Infinity, 1)).toThrow('Input must be a finite number');
  });

  it('throws on -Infinity input', () => {
    expect(() => add(1, -Infinity)).toThrow('Input must be a finite number');
  });
});

describe('subtract', () => {
  it('subtracts two positive integers', () => {
    expect(subtract(10, 4)).toBe(6);
  });

  it('subtracts producing a negative result', () => {
    expect(subtract(3, 8)).toBe(-5);
  });

  it('subtracts a negative number', () => {
    expect(subtract(5, -3)).toBe(8);
  });

  it('subtracts zero', () => {
    expect(subtract(9, 0)).toBe(9);
  });

  it('subtracts floats', () => {
    expect(subtract(1.5, 0.5)).toBeCloseTo(1.0);
  });

  it('handles very large numbers', () => {
    expect(subtract(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)).toBe(0);
  });

  it('throws on NaN input', () => {
    expect(() => subtract(NaN, 1)).toThrow('Input must be a finite number');
  });

  it('throws on Infinity input', () => {
    expect(() => subtract(Infinity, 1)).toThrow('Input must be a finite number');
  });

  it('throws on -Infinity input', () => {
    expect(() => subtract(1, -Infinity)).toThrow('Input must be a finite number');
  });
});

describe('multiply', () => {
  it('multiplies two positive integers', () => {
    expect(multiply(3, 4)).toBe(12);
  });

  it('multiplies by zero', () => {
    expect(multiply(99, 0)).toBe(0);
  });

  it('multiplies two negative numbers', () => {
    expect(multiply(-3, -4)).toBe(12);
  });

  it('multiplies positive and negative', () => {
    expect(multiply(5, -2)).toBe(-10);
  });

  it('multiplies floats', () => {
    expect(multiply(2.5, 4)).toBeCloseTo(10);
  });

  it('handles very large numbers', () => {
    expect(multiply(Number.MAX_SAFE_INTEGER, 1)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('throws on NaN input', () => {
    expect(() => multiply(NaN, 2)).toThrow('Input must be a finite number');
  });

  it('throws on Infinity input', () => {
    expect(() => multiply(Infinity, 2)).toThrow('Input must be a finite number');
  });

  it('throws on -Infinity input', () => {
    expect(() => multiply(2, -Infinity)).toThrow('Input must be a finite number');
  });
});

describe('divide', () => {
  it('divides two positive integers evenly', () => {
    expect(divide(10, 2)).toBe(5);
  });

  it('divides producing a float', () => {
    expect(divide(7, 2)).toBe(3.5);
  });

  it('divides a negative numerator', () => {
    expect(divide(-9, 3)).toBe(-3);
  });

  it('divides by a negative denominator', () => {
    expect(divide(9, -3)).toBe(-3);
  });

  it('divides zero by a number', () => {
    expect(divide(0, 5)).toBe(0);
  });

  it('throws on division by zero (integer)', () => {
    expect(() => divide(5, 0)).toThrow('Division by zero is not allowed');
  });

  it('throws on division by zero (float zero)', () => {
    expect(() => divide(1.5, 0)).toThrow('Division by zero is not allowed');
  });

  it('handles very large numerator', () => {
    expect(divide(Number.MAX_SAFE_INTEGER, 1)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('throws on NaN input', () => {
    expect(() => divide(NaN, 2)).toThrow('Input must be a finite number');
  });

  it('throws on Infinity numerator', () => {
    expect(() => divide(Infinity, 2)).toThrow('Input must be a finite number');
  });

  it('throws on -Infinity denominator', () => {
    expect(() => divide(1, -Infinity)).toThrow('Input must be a finite number');
  });
});

describe('modulo', () => {
  it('returns remainder of positive division', () => {
    expect(modulo(10, 3)).toBe(1);
  });

  it('returns zero when divisible evenly', () => {
    expect(modulo(9, 3)).toBe(0);
  });

  it('handles negative dividend', () => {
    expect(modulo(-7, 3)).toBe(-1);
  });

  it('handles negative divisor', () => {
    expect(modulo(7, -3)).toBe(1);
  });

  it('throws on modulo by zero', () => {
    expect(() => modulo(5, 0)).toThrow('Modulo by zero is not allowed');
  });

  it('handles very large dividend', () => {
    expect(modulo(Number.MAX_SAFE_INTEGER, 3)).toBe(Number.MAX_SAFE_INTEGER % 3);
  });

  it('throws on NaN input', () => {
    expect(() => modulo(NaN, 3)).toThrow('Input must be a finite number');
  });

  it('throws on Infinity input', () => {
    expect(() => modulo(Infinity, 3)).toThrow('Input must be a finite number');
  });

  it('throws on -Infinity divisor', () => {
    expect(() => modulo(3, -Infinity)).toThrow('Input must be a finite number');
  });
});

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

describe('mean', () => {
  it('computes mean of a single value', () => {
    expect(mean([5])).toBe(5);
  });

  it('computes mean of positive integers', () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
  });

  it('computes mean of negative numbers', () => {
    expect(mean([-2, -4, -6])).toBe(-4);
  });

  it('computes mean of mixed positive/negative', () => {
    expect(mean([-1, 0, 1])).toBe(0);
  });

  it('computes mean of floats', () => {
    expect(mean([1.5, 2.5, 3.0])).toBeCloseTo(2.333);
  });

  it('handles very large values', () => {
    expect(mean([Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER])).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('throws on empty array', () => {
    expect(() => mean([])).toThrow('Cannot compute mean of an empty array');
  });

  it('throws on NaN value', () => {
    expect(() => mean([1, NaN, 3])).toThrow('All values must be finite numbers');
  });

  it('throws on Infinity value', () => {
    expect(() => mean([1, Infinity, 3])).toThrow('All values must be finite numbers');
  });

  it('throws on -Infinity value', () => {
    expect(() => mean([1, -Infinity, 3])).toThrow('All values must be finite numbers');
  });
});

describe('median', () => {
  it('returns the middle value for odd-length array', () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it('returns average of two middle values for even-length array', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('returns value for single-element array', () => {
    expect(median([42])).toBe(42);
  });

  it('handles negative numbers', () => {
    expect(median([-5, -1, -3])).toBe(-3);
  });

  it('does not mutate the input array', () => {
    const input = [5, 3, 1];
    median(input);
    expect(input).toEqual([5, 3, 1]);
  });

  it('handles already-sorted array', () => {
    expect(median([1, 2, 3, 4, 5])).toBe(3);
  });

  it('handles very large values', () => {
    expect(median([Number.MAX_SAFE_INTEGER, 1, 2])).toBe(2);
  });

  it('throws on empty array', () => {
    expect(() => median([])).toThrow('Cannot compute median of an empty array');
  });

  it('throws on NaN value', () => {
    expect(() => median([1, NaN, 3])).toThrow('All values must be finite numbers');
  });

  it('throws on Infinity value', () => {
    expect(() => median([Infinity, 2, 3])).toThrow('All values must be finite numbers');
  });
});

describe('mode', () => {
  it('returns single mode', () => {
    expect(mode([1, 2, 2, 3])).toEqual([2]);
  });

  it('returns multiple modes sorted when there is a tie', () => {
    expect(mode([1, 1, 2, 2, 3])).toEqual([1, 2]);
  });

  it('returns single element for single-element array', () => {
    expect(mode([7])).toEqual([7]);
  });

  it('returns all values when all appear once (all modes)', () => {
    expect(mode([3, 1, 2])).toEqual([1, 2, 3]);
  });

  it('handles negative numbers', () => {
    expect(mode([-1, -1, 2, 3])).toEqual([-1]);
  });

  it('handles float modes', () => {
    expect(mode([1.5, 1.5, 2.5])).toEqual([1.5]);
  });

  it('throws on empty array', () => {
    expect(() => mode([])).toThrow('Cannot compute mode of an empty array');
  });

  it('throws on NaN value', () => {
    expect(() => mode([1, NaN, 2])).toThrow('All values must be finite numbers');
  });

  it('throws on Infinity value', () => {
    expect(() => mode([Infinity, 1, 2])).toThrow('All values must be finite numbers');
  });
});

describe('variance', () => {
  it('returns zero for a single-element array', () => {
    expect(variance([5])).toBe(0);
  });

  it('computes population variance of [2, 4, 4, 4, 5, 5, 7, 9]', () => {
    // mean = 5, variance = 4
    expect(variance([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(4);
  });

  it('computes variance of identical values as zero', () => {
    expect(variance([3, 3, 3])).toBe(0);
  });

  it('computes variance of [1, 2, 3]', () => {
    // mean = 2, variance = (1+0+1)/3 = 2/3
    expect(variance([1, 2, 3])).toBeCloseTo(2 / 3);
  });

  it('handles negative values', () => {
    expect(variance([-2, 0, 2])).toBeCloseTo(8 / 3);
  });

  it('handles very large values', () => {
    expect(variance([Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER])).toBe(0);
  });

  it('throws on empty array', () => {
    expect(() => variance([])).toThrow('Cannot compute variance of an empty array');
  });

  it('throws on NaN value', () => {
    expect(() => variance([1, NaN, 3])).toThrow('All values must be finite numbers');
  });

  it('throws on Infinity value', () => {
    expect(() => variance([Infinity, 1, 2])).toThrow('All values must be finite numbers');
  });
});

describe('standardDeviation', () => {
  it('returns zero for a single-element array', () => {
    expect(standardDeviation([5])).toBe(0);
  });

  it('computes standard deviation of [2, 4, 4, 4, 5, 5, 7, 9]', () => {
    // variance = 4, stddev = 2
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2);
  });

  it('returns zero for all identical values', () => {
    expect(standardDeviation([7, 7, 7])).toBe(0);
  });

  it('computes standard deviation of [1, 2, 3]', () => {
    expect(standardDeviation([1, 2, 3])).toBeCloseTo(Math.sqrt(2 / 3));
  });

  it('handles negative values', () => {
    expect(standardDeviation([-2, 0, 2])).toBeCloseTo(Math.sqrt(8 / 3));
  });

  it('handles very large values', () => {
    expect(standardDeviation([Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER])).toBe(0);
  });

  it('throws on empty array', () => {
    expect(() => standardDeviation([])).toThrow('Cannot compute standard deviation of an empty array');
  });

  it('throws on NaN value', () => {
    expect(() => standardDeviation([1, NaN, 3])).toThrow('All values must be finite numbers');
  });

  it('throws on Infinity value', () => {
    expect(() => standardDeviation([Infinity, 1, 2])).toThrow('All values must be finite numbers');
  });
});
