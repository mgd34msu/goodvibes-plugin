/**
 * Shared Utilities
 *
 * Common pure utility functions used across the runtime engine. All functions
 * are synchronous and side-effect free unless otherwise noted.
 */

import { randomUUID } from 'node:crypto';
import { ParseError } from './errors.js';

/**
 * Generates a universally unique identifier using Node's built-in crypto module.
 *
 * @returns A RFC 4122 v4 UUID string.
 */
export function generateId(): string {
  return randomUUID();
}

/**
 * Returns the current time as epoch milliseconds (Unix timestamp).
 *
 * @returns A number representing milliseconds since the Unix epoch.
 */
export function timestamp(): number {
  return Date.now();
}

/**
 * Generates a prefixed unique identifier for events.
 *
 * @returns A string in the form "evt_<uuid>".
 */
export function generateEventId(): string {
  return `evt_${randomUUID()}`;
}

/**
 * Generates a prefixed unique identifier for workflows.
 *
 * @returns A string in the form "wf_<uuid>".
 */
export function generateWorkflowId(): string {
  return `wf_${randomUUID()}`;
}

/** Extract a human-readable message from an unknown caught value. */
export function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Asserts that a value is a string, throwing a TypeError if not.
 *
 * Use instead of `value as string` for runtime type safety on unknown inputs.
 *
 * @param value     - The value to check.
 * @param fieldName - The field name to include in the error message.
 * @returns The value cast to string.
 * @throws {TypeError} If value is not a string.
 */
export function assertString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') throw new TypeError(`${fieldName} must be a string, got ${typeof value}`);
  return value;
}

/**
 * Asserts that a value is a string or absent (null/undefined).
 *
 * Use instead of `value as string | undefined` for runtime type safety.
 *
 * @param value     - The value to check.
 * @param fieldName - The field name to include in the error message.
 * @returns The value as string, or undefined if null/undefined.
 * @throws {TypeError} If value is neither a string nor null/undefined.
 */
export function assertOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  return assertString(value, fieldName);
}

/**
 * Safely parse a JSON string, returning a fallback value on failure.
 *
 * Use this instead of bare `JSON.parse` for external-facing input where
 * malformed JSON should not throw. Optionally logs parse errors via the
 * structured logger when `logError` is provided.
 *
 * @param input    - Raw JSON string to parse.
 * @param fallback - Value returned when parsing fails.
 * @param logError - Optional callback invoked with the parse error message.
 * @returns Parsed value on success, `fallback` on any error.
 *
 * @example
 * const data = safeJsonParse(rawInput, null);
 * if (data !== null) {
 *   // use data
 * }
 */
export function safeJsonParse<T>(input: string, fallback: T, logError?: (msg: string) => void): T {
  try {
    return JSON.parse(input) as T;
  } catch (err) {
    if (logError) {
      logError(err instanceof Error ? err.message : String(err));
    }
    return fallback;
  }
}

/**
 * TypeScript exhaustiveness helper for switch statements.
 *
 * Use in the `default` case of an exhaustive switch to get a compile-time
 * error if a new variant is added to the discriminated union without handling it.
 *
 * @param value - The value that should never reach this point.
 * @throws {Error} Always throws at runtime (unreachable code path).
 *
 * @example
 * switch (op) {
 *   case 'eq': return a === b;
 *   default: assertNever(op);
 * }
 */
export function assertNever(value: never): never {
  throw new Error(`Unhandled discriminated union member: ${String(value)}`);
}

/** Supported duration unit suffixes for {@link parseRelativeTime} */
const DURATION_UNITS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/**
 * Parses a relative time string (e.g. "5m", "1h", "30s") into an absolute
 * {@link Date} relative to the current instant.
 *
 * Supported suffixes: `s` (seconds), `m` (minutes), `h` (hours), `d` (days).
 *
 * @param input - Relative time string such as "30s", "5m", "2h", or "1d".
 * @returns An absolute {@link Date} `input` duration from now.
 * @throws {Error} If the input string is not a recognised relative time format.
 *
 * @example
 * const deadline = parseRelativeTime("5m");
 * // Returns a Date 5 minutes in the future.
 */
export function parseRelativeTime(input: string): Date {
  const match = /^(\d+(?:\.\d+)?)(s|m|h|d)$/.exec(input.trim());
  if (!match) {
    throw new ParseError(
      `Invalid relative time format: "${input}". Expected a number followed by s/m/h/d (e.g. "5m", "30s", "2h").`
    );
  }
  const value = parseFloat(match[1]);
  const unit = match[2] as keyof typeof DURATION_UNITS;
  const ms = value * DURATION_UNITS[unit];
  return new Date(Date.now() + ms);
}
