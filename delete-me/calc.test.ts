import { describe, it, expect } from 'vitest';
import { add, subtract, multiply, divide } from './calc';

describe('add', () => {
  it('adds two positive numbers', () => {
    expect(add(3, 4)).toBe(7);
  });

  it('adds a positive and a negative number', () => {
    expect(add(10, -3)).toBe(7);
  });

  it('adds two negative numbers', () => {
    expect(add(-5, -2)).toBe(-7);
  });

  it('adds zero to a number', () => {
    expect(add(5, 0)).toBe(5);
  });

  it('adds zero to zero', () => {
    expect(add(0, 0)).toBe(0);
  });

  it('adds decimal numbers', () => {
    expect(add(1.1, 2.2)).toBeCloseTo(3.3);
  });

  it('adds a negative decimal and a positive decimal', () => {
    expect(add(-1.5, 2.5)).toBeCloseTo(1.0);
  });
});

describe('subtract', () => {
  it('subtracts two positive numbers', () => {
    expect(subtract(10, 4)).toBe(6);
  });

  it('subtracts a larger number from a smaller one (negative result)', () => {
    expect(subtract(3, 8)).toBe(-5);
  });

  it('subtracts a negative number', () => {
    expect(subtract(5, -3)).toBe(8);
  });

  it('subtracts two negative numbers', () => {
    expect(subtract(-4, -2)).toBe(-2);
  });

  it('subtracts zero from a number', () => {
    expect(subtract(7, 0)).toBe(7);
  });

  it('subtracts a number from zero', () => {
    expect(subtract(0, 5)).toBe(-5);
  });

  it('subtracts zero from zero', () => {
    expect(subtract(0, 0)).toBe(0);
  });

  it('subtracts decimal numbers', () => {
    expect(subtract(5.5, 2.2)).toBeCloseTo(3.3);
  });
});

describe('multiply', () => {
  it('multiplies two positive numbers', () => {
    expect(multiply(3, 4)).toBe(12);
  });

  it('multiplies a positive and a negative number', () => {
    expect(multiply(5, -3)).toBe(-15);
  });

  it('multiplies two negative numbers', () => {
    expect(multiply(-4, -3)).toBe(12);
  });

  it('multiplies by zero', () => {
    expect(multiply(7, 0)).toBe(0);
  });

  it('multiplies zero by zero', () => {
    expect(multiply(0, 0)).toBe(0);
  });

  it('multiplies decimal numbers', () => {
    expect(multiply(2.5, 4.0)).toBeCloseTo(10.0);
  });

  it('multiplies a negative decimal by a positive decimal', () => {
    expect(multiply(-1.5, 2.0)).toBeCloseTo(-3.0);
  });
});

describe('divide', () => {
  it('divides two positive numbers', () => {
    expect(divide(10, 2)).toBe(5);
  });

  it('divides with a negative dividend', () => {
    expect(divide(-10, 2)).toBe(-5);
  });

  it('divides with a negative divisor', () => {
    expect(divide(10, -2)).toBe(-5);
  });

  it('divides two negative numbers', () => {
    expect(divide(-10, -2)).toBe(5);
  });

  it('divides zero by a non-zero number', () => {
    expect(divide(0, 5)).toBe(0);
  });

  it('divides decimal numbers', () => {
    expect(divide(7.5, 2.5)).toBeCloseTo(3.0);
  });

  it('throws "Division by zero" when dividing by zero', () => {
    expect(() => divide(10, 0)).toThrow('Division by zero');
  });

  it('throws an Error instance when dividing by zero', () => {
    expect(() => divide(10, 0)).toThrow(Error);
  });

  it('throws when a negative number is divided by zero', () => {
    expect(() => divide(-5, 0)).toThrow('Division by zero');
  });

  it('throws when zero is divided by zero', () => {
    expect(() => divide(0, 0)).toThrow('Division by zero');
  });
});
