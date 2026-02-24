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
 * Type guard to check if a value is a RetryData object.
 *
 * @param value - The value to check
 * @returns True if value is a valid RetryData record
 */
export declare function isRetryData(value: unknown): value is RetryData;
/**
 * Type guard to check if a value is an ErrorState object.
 *
 * @param value - The value to check
 * @returns True if value is a valid ErrorState
 */
export declare function isErrorState(value: unknown): value is ErrorState;
/** Default maximum age for retry entries in hours. */
export declare const DEFAULT_MAX_AGE_HOURS = 24;
