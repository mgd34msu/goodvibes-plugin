/**
 * MCP argument-normalization helpers shared by the search/read trio.
 * Ported from v1 `precision-engine/src/utils/index.ts` (`ensureArray`,
 * `parseJsonField`), these handle client serialization quirks (arrays
 * arriving as JSON strings or as `{"0":..,"1":..}` objects, a single object
 * sent instead of a one-element array).
 */

/** Parse a field that might be a JSON string into its actual type; passes through non-strings. */
export function parseJsonField<T>(value: T | string | undefined): T | undefined {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  }
  return value;
}

/**
 * Ensure a value is an array, handling MCP serialization edge cases:
 * a JSON string, an object with numeric keys (array-as-object), or a single
 * object that looks like one array element (common LLM mistake). Returns null
 * when the value cannot be converted.
 */
export function ensureArray<T>(value: unknown): T[] | null {
  if (value === undefined || value === null) {return null;}
  if (Array.isArray(value)) {return value as T[];}
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {return parsed as T[];}
      value = parsed;
    } catch {
      return null;
    }
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length > 0 && keys.every((k) => /^\d+$/.test(k))) {
      return keys
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => (value as Record<string, unknown>)[k]) as T[];
    }
    const KNOWN_SPEC_KEYS = new Set(['path', 'file', 'id', 'pattern', 'patterns']);
    if (keys.some((k) => KNOWN_SPEC_KEYS.has(k))) {
      return [value] as T[];
    }
  }
  return null;
}

/** Decode a base64 string field, throwing a clear error on invalid input. */
export function decodeBase64(fieldName: string, value: string): string {
  try {
    return Buffer.from(value, 'base64').toString('utf-8');
  } catch (e) {
    throw new Error(`Invalid base64 in ${fieldName}: ${(e as Error).message}`);
  }
}

/**
 * Resolve a string field that may arrive as a direct value or a `${field}_base64`
 * alternate. Throws when both are provided (mutual exclusivity).
 */
export function resolveStringOrBase64(
  obj: Record<string, unknown>,
  fieldName: string,
): string | undefined {
  const direct = obj[fieldName];
  const base64 = obj[`${fieldName}_base64`];
  if (direct !== undefined && base64 !== undefined) {
    throw new Error(
      `Multiple input sources provided for '${fieldName}'. Found: ${fieldName}, ${fieldName}_base64. ` +
        `Provide only one.`,
    );
  }
  if (typeof base64 === 'string') {return decodeBase64(`${fieldName}_base64`, base64);}
  if (typeof direct === 'string') {return direct;}
  return undefined;
}
