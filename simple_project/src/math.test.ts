import { describe, it, expect } from 'vitest';
import {
  add,
  subtract,
  multiply,
  divide,
  clamp,
  lerp,
  isPrime,
  factorial,
  gcd,
  fibonacci,
} from './math.js';

describe('add', () => {
  it('adds two positive numbers', () => {
    expect(add(2, 3)).toBe(5);
  });
  it('adds negative numbers', () => {
    expect(add(-2, -3)).toBe(-5);
  });
  it('adds positive and negative', () => {
    expect(add(5, -3)).toBe(2);
  });
  it('adds zero', () => {
    expect(add(0, 0)).toBe(0);
    expect(add(5, 0)).toBe(5);
  });
  it('handles large numbers', () => {
    expect(add(1e15, 1e15)).toBe(2e15);
  });
});

describe('subtract', () => {
  it('subtracts two positive numbers', () => {
    expect(subtract(5, 3)).toBe(2);
  });
  it('subtracts resulting in negative', () => {
    expect(subtract(3, 5)).toBe(-2);
  });
  it('subtracts negative numbers', () => {
    expect(subtract(-3, -5)).toBe(2);
  });
  it('subtracts zero', () => {
    expect(subtract(5, 0)).toBe(5);
    expect(subtract(0, 0)).toBe(0);
  });
});

describe('multiply', () => {
  it('multiplies two positive numbers', () => {
    expect(multiply(3, 4)).toBe(12);
  });
  it('multiplies by zero', () => {
    expect(multiply(5, 0)).toBe(0);
    expect(multiply(0, 0)).toBe(0);
  });
  it('multiplies negative numbers', () => {
    expect(multiply(-3, 4)).toBe(-12);
    expect(multiply(-3, -4)).toBe(12);
  });
  it('handles large numbers', () => {
    expect(multiply(1e7, 1e7)).toBe(1e14);
  });
});

describe('divide', () => {
  it('divides two positive numbers', () => {
    expect(divide(10, 2)).toBe(5);
  });
  it('divides resulting in fraction', () => {
    expect(divide(1, 4)).toBe(0.25);
  });
  it('divides negative numbers', () => {
    expect(divide(-10, 2)).toBe(-5);
    expect(divide(-10, -2)).toBe(5);
  });
  it('divides zero by non-zero', () => {
    expect(divide(0, 5)).toBe(0);
  });
  it('throws on division by zero', () => {
    expect(() => divide(10, 0)).toThrow('Division by zero');
    expect(() => divide(0, 0)).toThrow('Division by zero');
  });
});

describe('clamp', () => {
  it('returns value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
  it('clamps to minimum when below range', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });
  it('clamps to maximum when above range', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });
  it('returns min when value equals min', () => {
    expect(clamp(0, 0, 10)).toBe(0);
  });
  it('returns max when value equals max', () => {
    expect(clamp(10, 0, 10)).toBe(10);
  });
  it('handles negative range', () => {
    expect(clamp(-5, -10, -1)).toBe(-5);
    expect(clamp(-15, -10, -1)).toBe(-10);
    expect(clamp(0, -10, -1)).toBe(-1);
  });
});

describe('lerp', () => {
  it('returns a when t=0', () => {
    expect(lerp(0, 10, 0)).toBe(0);
  });
  it('returns b when t=1', () => {
    expect(lerp(0, 10, 1)).toBe(10);
  });
  it('returns midpoint when t=0.5', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
  });
  it('works with negative values', () => {
    expect(lerp(-10, 10, 0.5)).toBe(0);
  });
  it('extrapolates beyond t=1', () => {
    expect(lerp(0, 10, 2)).toBe(20);
  });
  it('extrapolates below t=0', () => {
    expect(lerp(0, 10, -1)).toBe(-10);
  });
});

describe('isPrime', () => {
  it('returns false for numbers <= 1', () => {
    expect(isPrime(0)).toBe(false);
    expect(isPrime(1)).toBe(false);
    expect(isPrime(-5)).toBe(false);
  });
  it('returns true for 2 (smallest prime)', () => {
    expect(isPrime(2)).toBe(true);
  });
  it('returns true for 3', () => {
    expect(isPrime(3)).toBe(true);
  });
  it('returns false for 4', () => {
    expect(isPrime(4)).toBe(false);
  });
  it('returns true for known primes', () => {
    expect(isPrime(5)).toBe(true);
    expect(isPrime(7)).toBe(true);
    expect(isPrime(11)).toBe(true);
    expect(isPrime(13)).toBe(true);
    expect(isPrime(17)).toBe(true);
    expect(isPrime(97)).toBe(true);
  });
  it('returns false for known composites', () => {
    expect(isPrime(6)).toBe(false);
    expect(isPrime(9)).toBe(false);
    expect(isPrime(25)).toBe(false);
    expect(isPrime(49)).toBe(false);
  });
  it('handles divisible by 3 branch', () => {
    expect(isPrime(9)).toBe(false);
    expect(isPrime(3)).toBe(true);
  });
});

describe('factorial', () => {
  it('returns 1 for 0', () => {
    expect(factorial(0)).toBe(1);
  });
  it('returns 1 for 1', () => {
    expect(factorial(1)).toBe(1);
  });
  it('computes factorial of positive integers', () => {
    expect(factorial(2)).toBe(2);
    expect(factorial(3)).toBe(6);
    expect(factorial(4)).toBe(24);
    expect(factorial(5)).toBe(120);
    expect(factorial(10)).toBe(3628800);
  });
  it('throws for negative numbers', () => {
    expect(() => factorial(-1)).toThrow('Factorial is not defined for negative numbers');
    expect(() => factorial(-100)).toThrow();
  });
});

describe('gcd', () => {
  it('returns gcd of two positive numbers', () => {
    expect(gcd(12, 8)).toBe(4);
    expect(gcd(100, 75)).toBe(25);
  });
  it('returns the number itself when other is zero', () => {
    expect(gcd(5, 0)).toBe(5);
    expect(gcd(0, 5)).toBe(5);
  });
  it('returns 0 when both are zero', () => {
    expect(gcd(0, 0)).toBe(0);
  });
  it('returns 1 for coprime numbers', () => {
    expect(gcd(7, 13)).toBe(1);
    expect(gcd(3, 5)).toBe(1);
  });
  it('handles negative numbers', () => {
    expect(gcd(-12, 8)).toBe(4);
    expect(gcd(12, -8)).toBe(4);
    expect(gcd(-12, -8)).toBe(4);
  });
  it('handles equal numbers', () => {
    expect(gcd(5, 5)).toBe(5);
  });
});

describe('fibonacci', () => {
  it('returns 0 for n=0', () => {
    expect(fibonacci(0)).toBe(0);
  });
  it('returns 1 for n=1', () => {
    expect(fibonacci(1)).toBe(1);
  });
  it('computes fibonacci sequence', () => {
    expect(fibonacci(2)).toBe(1);
    expect(fibonacci(3)).toBe(2);
    expect(fibonacci(4)).toBe(3);
    expect(fibonacci(5)).toBe(5);
    expect(fibonacci(6)).toBe(8);
    expect(fibonacci(10)).toBe(55);
  });
  it('handles larger values', () => {
    expect(fibonacci(20)).toBe(6765);
  });
  it('throws for negative indices', () => {
    expect(() => fibonacci(-1)).toThrow('Fibonacci is not defined for negative indices');
    expect(() => fibonacci(-10)).toThrow();
  });
});
