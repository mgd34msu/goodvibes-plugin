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
/**
 * Loads retry tracking data from disk.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to retry data map or empty object if file doesn't exist
 */
export declare function loadRetries(cwd: string): Promise<RetryData>;
/**
 * Saves a retry attempt to disk, incrementing the count and updating phase.
 *
 * @param stateOrCwd - Either HooksState or directory path
 * @param signature - Unique error signature
 * @param errorStateOrPhase - Error state object or phase number
 * @returns Promise that resolves when retry is saved
 */
export declare function saveRetry(stateOrCwd: HooksState | string, signature: string, errorStateOrPhase: ErrorState | number): Promise<void>;
/**
 * Gets the number of retry attempts for an error signature.
 *
 * @param cwd - The current working directory (project root)
 * @param signature - Unique error signature
 * @returns Promise resolving to retry count or 0 if not found
 */
export declare function getRetryCount(cwd: string, signature: string): Promise<number>;
/**
 * Gets the current fix phase for an error signature.
 *
 * @param cwd - The current working directory (project root)
 * @param signature - Unique error signature
 * @returns Promise resolving to phase number (1-3) or 1 if not found
 */
export declare function getCurrentPhase(cwd: string, signature: string): Promise<number>;
/**
 * Determines if the error should escalate to the next fix phase.
 *
 * @param cwdOrErrorState - Either directory path or error state object
 * @param signature - Unique error signature (required if cwdOrErrorState is a path)
 * @param currentPhase - Current phase number (optional)
 * @param category - Error category for retry limit lookup
 * @returns Promise resolving to true if phase should escalate
 */
export declare function shouldEscalatePhase(cwdOrErrorState: string | ErrorState, signature?: string, currentPhase?: number, category?: ErrorCategory): Promise<boolean>;
/**
 * Escalates error state to the next phase.
 *
 * @param errorState - The current error state
 * @returns New error state with incremented phase
 */
export declare function escalatePhase(errorState: ErrorState): ErrorState;
/**
 * Checks if all retry attempts have been exhausted across all phases.
 *
 * @param cwdOrErrorState - Either directory path or error state object
 * @param signature - Unique error signature (required if cwdOrErrorState is a path)
 * @param category - Error category for retry limit lookup
 * @returns Promise resolving to true if all retries exhausted
 */
export declare function hasExhaustedRetries(cwdOrErrorState: string | ErrorState, signature?: string, category?: ErrorCategory): Promise<boolean>;
/**
 * Gets a human-readable description of a fix phase.
 *
 * @param phase - The phase number (1-3)
 * @returns Description string for the phase
 */
export declare function getPhaseDescription(phase: number): string;
/**
 * Gets the number of remaining retry attempts in the current phase.
 *
 * @param cwdOrErrorState - Either directory path or error state object
 * @param signature - Unique error signature (required if cwdOrErrorState is a path)
 * @param category - Error category for retry limit lookup
 * @returns Promise resolving to number of remaining attempts
 */
export declare function getRemainingAttempts(cwdOrErrorState: string | ErrorState, signature?: string, category?: ErrorCategory): Promise<number>;
/**
 * Generates a unique signature for an error based on its message and tool.
 *
 * @param error - The error message
 * @param toolName - The name of the tool that failed (optional)
 * @returns Unique error signature string
 */
export declare function generateErrorSignature(error: string, toolName?: string): string;
/**
 * Clears retry tracking data for a specific error signature.
 *
 * @param cwd - The current working directory (project root)
 * @param signature - Unique error signature to clear
 * @returns Promise that resolves when retry is cleared
 */
export declare function clearRetry(cwd: string, signature: string): Promise<void>;
/**
 * Removes retry tracking data older than specified hours.
 *
 * @param cwd - The current working directory (project root)
 * @param maxAgeHours - Maximum age in hours before pruning (default: 24)
 * @returns Promise that resolves when old retries are pruned
 */
export declare function pruneOldRetries(cwd: string, maxAgeHours?: number): Promise<void>;
/**
 * Gets statistics about retry tracking data.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to retry statistics object
 */
export declare function getRetryStats(cwd: string): Promise<{
    totalSignatures: number;
    totalAttempts: number;
    phase1Count: number;
    phase2Count: number;
    phase3Count: number;
}>;
