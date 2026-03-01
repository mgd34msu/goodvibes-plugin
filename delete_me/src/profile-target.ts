/**
 * Functions for runtime profiling.
 */

/** Compute fibonacci recursively */
export function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

/** Sort an array using bubble sort */
export function sortArray(arr: number[]): number[] {
  const result = [...arr];
  for (let i = 0; i < result.length; i++) {
    for (let j = 0; j < result.length - i - 1; j++) {
      if (result[j] > result[j + 1]) {
        [result[j], result[j + 1]] = [result[j + 1], result[j]];
      }
    }
  }
  return result;
}

/** Process data with simulated work */
export async function processData(items: string[]): Promise<string[]> {
  const results: string[] = [];
  for (const item of items) {
    // Simulate async work
    await new Promise(resolve => setTimeout(resolve, 1));
    results.push(item.trim().toLowerCase());
  }
  return results;
}
