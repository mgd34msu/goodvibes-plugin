/**
 * Retry Tracker
 *
 * Tracks retry attempts per error signature to enable phase-based escalation.
 * Stores retry data in .goodvibes/state/retries.json.
 */
import { type ErrorCategory, type ErrorState } from '../types/errors.js';
import type { HooksState } from '../types/state.js';
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
/** Loads all retry entries from disk */
export declare function loadRetries(cwd: string): RetryData;
/**
 * Save a retry attempt for a given error signature
 * Can be called with (state, signature, errorState) or (cwd, signature, phase)
 */
export declare function saveRetry(stateOrCwd: HooksState | string, signature: string, errorStateOrPhase: ErrorState | number): void;
/** Returns the number of retry attempts for a given error signature */
export declare function getRetryCount(cwd: string, signature: string): number;
/** Returns the current escalation phase for a given error signature */
export declare function getCurrentPhase(cwd: string, signature: string): number;
/**
 * Check if the phase should be escalated based on retry attempts
 * Supports both ErrorState-based and cwd/signature-based signatures
 */
export declare function shouldEscalatePhase(cwdOrErrorState: string | ErrorState, signature?: string, currentPhase?: number, category?: ErrorCategory): boolean;
/**
 * Escalate to the next phase
 */
export declare function escalatePhase(errorState: ErrorState): ErrorState;
/**
 * Check if all phases have been exhausted
 * Supports both ErrorState-based and cwd/signature-based signatures
 */
export declare function hasExhaustedRetries(cwdOrErrorState: string | ErrorState, signature?: string, category?: ErrorCategory): boolean;
/**
 * Get phase description for messaging
 */
export declare function getPhaseDescription(phase: number): string;
/**
 * Get remaining attempts in current phase
 * Supports both ErrorState-based and cwd/signature-based signatures
 */
export declare function getRemainingAttempts(cwdOrErrorState: string | ErrorState, signature?: string, category?: ErrorCategory): number;
/**
 * Generate a signature for an error message
 * Normalizes the error to group similar errors together
 *
 * Note: This wrapper maintains the original API where error comes first
 * and toolName is optional. The core implementation supports both orderings.
 */
export declare function generateErrorSignature(error: string, toolName?: string): string;
/** Clears retry data for a specific signature after successful fix */
export declare function clearRetry(cwd: string, signature: string): void;
/** Removes retry entries older than the specified age */
export declare function pruneOldRetries(cwd: string, maxAgeHours?: number): void;
/** Returns aggregate retry statistics for the current session */
export declare function getRetryStats(cwd: string): {
    totalSignatures: number;
    totalAttempts: number;
    phase1Count: number;
    phase2Count: number;
    phase3Count: number;
};
