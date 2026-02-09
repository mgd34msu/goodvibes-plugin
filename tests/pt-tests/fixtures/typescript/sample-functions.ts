// Sample TypeScript file with various function types

export const arrowFunction = (x: number): number => x * 2;

export const asyncArrowFunction = async (url: string): Promise<string> => {
  const response = await fetch(url);
  return response.text();
};

export async function* asyncGenerator(start: number, end: number) {
  for (let i = start; i <= end; i++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    yield i;
  }
}

export function genericFunction<T>(value: T): T {
  return value;
}

export function multiGeneric<T, U>(first: T, second: U): [T, U] {
  return [first, second];
}

export const higherOrderFunction = (fn: (x: number) => number) => {
  return (x: number) => fn(x) * 2;
};

export function functionWithDefaults(
  required: string,
  optional: number = 10,
  flag: boolean = false
): void {
  console.log(required, optional, flag);
}

type Handler = (event: Event) => void;

export function acceptsCallback(handler: Handler): void {
  // Implementation
}
