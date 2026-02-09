// Arrow functions
export const add = (a: number, b: number): number => a + b;
export const subtract = (a: number, b: number): number => a - b;
export const multiply = (a: number, b: number) => a * b;

// Async functions
export async function fetchData(url: string): Promise<string> {
  const response = await fetch(url);
  return response.text();
}

export async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Generator function
export function* fibonacci(): Generator<number> {
  let a = 0, b = 1;
  while (true) {
    yield a;
    [a, b] = [b, a + b];
  }
}

// Async generator
export async function* streamData(items: string[]): AsyncGenerator<string> {
  for (const item of items) {
    await delay(100);
    yield item;
  }
}

// Generic function
export function identity<T>(value: T): T {
  return value;
}

export function pair<A, B>(a: A, b: B): [A, B] {
  return [a, b];
}

// Higher-order function
export function createMultiplier(factor: number): (n: number) => number {
  return (n: number) => n * factor;
}

export function compose<A, B, C>(
  f: (b: B) => C,
  g: (a: A) => B
): (a: A) => C {
  return (a: A) => f(g(a));
}

// Function with overloads
export function format(value: string): string;
export function format(value: number): string;
export function format(value: string | number): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  return value.toFixed(2);
}

// Default parameters
export function greet(name: string, greeting: string = 'Hello'): string {
  return `${greeting}, ${name}!`;
}

// Rest parameters
export function sum(...numbers: number[]): number {
  return numbers.reduce((acc, n) => acc + n, 0);
}

// Destructured parameters
export function createUser({ name, age, email }: { name: string; age: number; email: string }) {
  return { id: Math.random(), name, age, email, createdAt: new Date() };
}
