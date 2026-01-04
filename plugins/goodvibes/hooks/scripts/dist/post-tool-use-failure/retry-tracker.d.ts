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
 * Loads all retry entries from disk.
 * Reads from .goodvibes/state/retries.json and validates the structure.
 *
 * @param cwd - Current working directory containing the .goodvibes folder
 * @returns RetryData map of error signatures to retry entries, or empty object if none exist
 *
 * @example
 * const retries = loadRetries('/project');
 * console.log(Object.keys(retries).length);  // Number of tracked errors
 */
export declare function loadRetries(cwd: string): RetryData;
/**
 * Save a retry attempt for a given error signature.
 * Increments attempt counter and updates timestamp. Supports two call signatures
 * for backward compatibility.
 *
 * @param stateOrCwd - Either HooksState object or cwd string (legacy)
 * @param signature - Unique error signature identifying the error type
 * @param errorStateOrPhase - Either ErrorState object or phase number (legacy)
 *
 * @example
 * // New signature with state
 * saveRetry(state, 'ts_error_abc123', errorState);
 *
 * @example
 * // Legacy signature with cwd
 * saveRetry('/project', 'ts_error_abc123', 2);
 */
export declare function saveRetry(stateOrCwd: HooksState | string, signature: string, errorStateOrPhase: ErrorState | number): void;
/**
 * Returns the number of retry attempts for a given error signature.
 *
 * @param cwd - Current working directory containing the .goodvibes folder
 * @param signature - Unique error signature to look up
 * @returns Number of retry attempts, or 0 if signature not found
 *
 * @example
 * const count = getRetryCount('/project', 'ts_error_abc123');
 * console.log(`Attempted ${count} times`);
 */
export declare function getRetryCount(cwd: string, signature: string): number;
/**
 * Returns the current escalation phase for a given error signature.
 * Phases range from 1 (initial) to 3 (maximum escalation).
 *
 * @param cwd - Current working directory containing the .goodvibes folder
 * @param signature - Unique error signature to look up
 * @returns Current phase number (1-3), or 1 if signature not found
 *
 * @example
 * const phase = getCurrentPhase('/project', 'ts_error_abc123');
 * if (phase >= 3) {
 *   console.log('All retry phases exhausted');
 * }
 */
export declare function getCurrentPhase(cwd: string, signature: string): number;
/**
 * Check if the phase should be escalated based on retry attempts.
 * Escalation occurs when retry limit for current phase is reached and max phase not yet hit.
 * Supports both ErrorState-based and cwd/signature-based call signatures.
 *
 * @param cwdOrErrorState - Either cwd string or ErrorState object
 * @param signature - Error signature (required for cwd-based calls)
 * @param currentPhase - Current phase override (optional for cwd-based calls)
 * @param category - Error category for determining retry limits (default: 'unknown')
 * @returns True if phase should be escalated
 *
 * @example
 * // ErrorState-based
 * if (shouldEscalatePhase(errorState)) {
 *   const escalated = escalatePhase(errorState);
 * }
 *
 * @example
 * // cwd/signature-based (legacy)
 * if (shouldEscalatePhase('/project', 'ts_error_abc123', 1, 'typescript_error')) {
 *   console.log('Escalating to next phase');
 * }
 */
export declare function shouldEscalatePhase(cwdOrErrorState: string | ErrorState, signature?: string, currentPhase?: number, category?: ErrorCategory): boolean;
/**
 * Escalate to the next phase.
 * Increments the phase number and resets attempt counter.
 *
 * @param errorState - Current error state to escalate
 * @returns New ErrorState with incremented phase
 *
 * @example
 * if (shouldEscalatePhase(errorState)) {
 *   errorState = escalatePhase(errorState);
 *   console.log(`Now in phase ${errorState.phase}`);
 * }
 */
export declare function escalatePhase(errorState: ErrorState): ErrorState;
/**
 * Check if all phases have been exhausted.
 * Returns true when at maximum phase and retry limit reached.
 * Supports both ErrorState-based and cwd/signature-based call signatures.
 *
 * @param cwdOrErrorState - Either cwd string or ErrorState object
 * @param signature - Error signature (required for cwd-based calls)
 * @param category - Error category for determining retry limits (default: 'unknown')
 * @returns True if all retry phases have been exhausted
 *
 * @example
 * if (hasExhaustedRetries(errorState)) {
 *   console.log('All recovery attempts failed, requesting user intervention');
 * }
 */
export declare function hasExhaustedRetries(cwdOrErrorState: string | ErrorState, signature?: string, category?: ErrorCategory): boolean;
/**
 * Get human-readable phase description for messaging.
 * Maps phase numbers to descriptive strings for user-facing messages.
 *
 * @param phase - Phase number (1, 2, or 3)
 * @returns Description string like "initial attempt" or "escalated recovery"
 *
 * @example
 * const desc = getPhaseDescription(2);
 * console.log(`Currently in ${desc}`);  // 'Currently in documentation lookup'
 */
export declare function getPhaseDescription(phase: number): string;
/**
 * Get remaining attempts in current phase.
 * Calculates how many more retries are allowed before phase escalation.
 * Supports both ErrorState-based and cwd/signature-based call signatures.
 *
 * @param cwdOrErrorState - Either cwd string or ErrorState object
 * @param signature - Error signature (required for cwd-based calls)
 * @param category - Error category for determining retry limits (default: 'unknown')
 * @returns Number of remaining attempts in current phase
 *
 * @example
 * const remaining = getRemainingAttempts(errorState);
 * console.log(`${remaining} attempts left before escalation`);
 */
export declare function getRemainingAttempts(cwdOrErrorState: string | ErrorState, signature?: string, category?: ErrorCategory): number;
/**
 * Generate a signature for an error message.
 * Normalizes the error to group similar errors together by removing
 * dynamic values like paths, line numbers, and timestamps.
 *
 * @param error - The error message to generate a signature for
 * @param toolName - Optional tool name to include in the signature
 * @returns A stable signature string that groups similar errors
 *
 * @example
 * const sig1 = generateErrorSignature("Error at /path/file.ts:10", "Edit");
 * const sig2 = generateErrorSignature("Error at /other/file.ts:20", "Edit");
 * // sig1 and sig2 may be equal if they represent the same error type
 */
export declare function generateErrorSignature(error: string, toolName?: string): string;
/**
 * Clears retry data for a specific signature after successful fix.
 * Called when an error has been resolved to reset tracking.
 *
 * @param cwd - Current working directory containing the .goodvibes folder
 * @param signature - Error signature to clear from retry tracking
 *
 * @example
 * // After successfully fixing an error
 * clearRetry('/project', 'ts_error_abc123');
 */
export declare function clearRetry(cwd: string, signature: string): void;
/**
 * Removes retry entries older than the specified age.
 * Called periodically to clean up stale retry data from previous sessions.
 *
 * @param cwd - Current working directory containing the .goodvibes folder
 * @param maxAgeHours - Maximum age in hours for entries (default: 24)
 *
 * @example
 * // Prune entries older than 12 hours
 * pruneOldRetries('/project', 12);
 */
export declare function pruneOldRetries(cwd: string, maxAgeHours?: number): void;
/**
 * Returns aggregate retry statistics for the current session.
 * Provides overview of error recovery status across all tracked errors.
 *
 * @param cwd - Current working directory containing the .goodvibes folder
 * @returns Object with counts of signatures, attempts, and entries per phase
 *
 * @example
 * const stats = getRetryStats('/project');
 * console.log(`Tracking ${stats.totalSignatures} unique errors`);
 * console.log(`Phase 3 (critical): ${stats.phase3Count} errors`);
 */
export declare function getRetryStats(cwd: string): {
    totalSignatures: number;
    totalAttempts: number;
    phase1Count: number;
    phase2Count: number;
    phase3Count: number;
};
