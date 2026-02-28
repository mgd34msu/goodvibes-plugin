/**
 * Object utility functions.
 */

/**
 * Returns a new object containing only the specified keys.
 * @param obj - The source object.
 * @param keys - The keys to include.
 * @returns A new object with only the picked keys.
 */
export function pick<T extends object, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Returns a new object with the specified keys removed.
 * @param obj - The source object.
 * @param keys - The keys to exclude.
 * @returns A new object without the omitted keys.
 */
export function omit<T extends object, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj } as Record<string, unknown>;
  for (const key of keys) {
    delete result[key as string];
  }
  return result as Omit<T, K>;
}

/**
 * Creates a deep clone of a value using structured cloning.
 * Supports all structuredClone-compatible types.
 *
 * This is an abstraction point: swap the implementation here to add
 * a polyfill (e.g. for older environments) or custom serialisation
 * without touching call sites.
 *
 * @param value - The value to clone.
 * @returns A deep copy of the value.
 */
export function deepClone<T>(value: T): T {
  return structuredClone(value);
}

/**
 * Deeply merges source objects into a target object.
 * Arrays in source overwrite arrays in target (not concatenated).
 * @param target - The base object.
 * @param sources - Objects whose properties overwrite/extend the target.
 * @returns A new merged object (typed as T, but may contain additional source keys).
 */
export function merge<T extends object>(
  target: T,
  ...sources: object[]
): T {
  const result = deepClone(target);
  for (const source of sources) {
    mergeDeep(result as Record<string, unknown>, source as Record<string, unknown>);
  }
  return result;
}

function mergeDeep(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): void {
  for (const key of Object.keys(source)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    const sourceVal = source[key];
    const targetVal = target[key];
    if (
      sourceVal !== null &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal !== null &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      mergeDeep(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>
      );
    } else {
      target[key] = sourceVal;
    }
  }
}

/**
 * Checks whether a value is empty.
 * - null / undefined -> true
 * - string: length === 0 -> true
 * - array: length === 0 -> true
 * - object (plain): no own enumerable keys -> true
 * - any other value -> false
 * @param value - The value to check.
 * @returns true if the value is considered empty.
 */
export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') {
    return Object.keys(value as object).length === 0;
  }
  return false;
}
