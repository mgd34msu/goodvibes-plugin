// Named exports
export const PI = 3.14159;
export const E = 2.71828;

export function square(n: number): number {
  return n * n;
}

export function cube(n: number): number {
  return n * n * n;
}

// Re-exports from other modules
export { calculateArea, isEven, MAX_RETRIES } from './sample-classes';
export { add, subtract, multiply, sum } from './sample-functions';
export type { IAnimal, IMovable, AnimalType } from './sample-classes';

// Default export
class MathHelper {
  static add(a: number, b: number): number { return a + b; }
  static subtract(a: number, b: number): number { return a - b; }
  static multiply(a: number, b: number): number { return a * b; }
  static divide(a: number, b: number): number {
    if (b === 0) throw new Error('Division by zero');
    return a / b;
  }
}

export default MathHelper;
