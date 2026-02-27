/**
 * Shared Utilities
 *
 * Common pure utility functions used across the runtime engine. All functions
 * are synchronous and side-effect free unless otherwise noted.
 */

import { randomUUID } from 'node:crypto';

/**
 * Generates a universally unique identifier using Node's built-in crypto module.
 *
 * @returns A RFC 4122 v4 UUID string.
 */
export function generateId(): string {
  return randomUUID();
}

/**
 * Returns the current time as an ISO-8601 string.
 *
 * @returns A string in the form "2026-02-23T12:34:56.789Z".
 */
export function timestamp(): string {
  return new Date().toISOString();
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
    throw new Error(
      `Invalid relative time format: "${input}". Expected a number followed by s/m/h/d (e.g. "5m", "30s", "2h").`
    );
  }
  const value = parseFloat(match[1]);
  const unit = match[2] as keyof typeof DURATION_UNITS;
  const ms = value * DURATION_UNITS[unit];
  return new Date(Date.now() + ms);
}
