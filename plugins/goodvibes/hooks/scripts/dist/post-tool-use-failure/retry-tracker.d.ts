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
export declare function loadRetries(cwd: string): Promise<RetryData>;
export declare function saveRetry(stateOrCwd: HooksState | string, signature: string, errorStateOrPhase: ErrorState | number): Promise<void>;
export declare function getRetryCount(cwd: string, signature: string): Promise<number>;
export declare function getCurrentPhase(cwd: string, signature: string): Promise<number>;
export declare function shouldEscalatePhase(cwdOrErrorState: string | ErrorState, signature?: string, currentPhase?: number, category?: ErrorCategory): Promise<boolean>;
export declare function escalatePhase(errorState: ErrorState): ErrorState;
export declare function hasExhaustedRetries(cwdOrErrorState: string | ErrorState, signature?: string, category?: ErrorCategory): Promise<boolean>;
export declare function getPhaseDescription(phase: number): string;
export declare function getRemainingAttempts(cwdOrErrorState: string | ErrorState, signature?: string, category?: ErrorCategory): Promise<number>;
export declare function generateErrorSignature(error: string, toolName?: string): string;
export declare function clearRetry(cwd: string, signature: string): Promise<void>;
export declare function pruneOldRetries(cwd: string, maxAgeHours?: number): Promise<void>;
export declare function getRetryStats(cwd: string): Promise<{
    totalSignatures: number;
    totalAttempts: number;
    phase1Count: number;
    phase2Count: number;
    phase3Count: number;
}>;
