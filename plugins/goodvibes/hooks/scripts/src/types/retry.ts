/**
 * Type definitions for retry tracking.
 */

import type { ErrorState } from './errors.js';

/** A single retry tracking entry */
export interface RetryEntry {
  /** Unique signature identifying the error */
  signature: string;
  /** Number of retry attempts */
  attempts: number;
  /** ISO timestamp of the last attempt */
  lastAttempt: string;
  /** Current escalation phase (1-3) */
  phase: number;
}

/** Map of error signatures to retry entries */
export type RetryData = Record<string, RetryEntry>;

/**
 * Type guard to check if a value is a RetryEntry object.
 *
 * @param value - The value to check
 * @returns True if value is a valid RetryEntry
 */
function isRetryEntry(value: unknown): value is RetryEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const entry = value as RetryEntry;
  return (
    typeof entry.signature === 'string' &&
    typeof entry.attempts === 'number' &&
    typeof entry.lastAttempt === 'string' &&
    typeof entry.phase === 'number'
  );
}

/**
 * Type guard to check if a value is a RetryData object.
 *
 * @param value - The value to check
 * @returns True if value is a valid RetryData record
 */
export function isRetryData(value: unknown): value is RetryData {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return Object.values(value as Record<string, unknown>).every(isRetryEntry);
}

/**
 * Type guard to check if a value is an ErrorState object.
 *
 * @param value - The value to check
 * @returns True if value is a valid ErrorState
 */
export function isErrorState(value: unknown): value is ErrorState {
  return (
    value !== null &&
    typeof value === 'object' &&
    'category' in value &&
    'phase' in value &&
    'attemptsThisPhase' in value
  );
}

/** Default maximum age for retry entries in hours. */
export const DEFAULT_MAX_AGE_HOURS = 24;
