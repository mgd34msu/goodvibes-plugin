/**
 * Error Handling Core
 *
 * Consolidated error handling utilities shared between automation/fix-loop.ts
 * and post-tool-use-failure/retry-tracker.ts.
 *
 * Provides:
 * - Error signature generation for deduplication
 * - Phase escalation logic
 * - Retry exhaustion checking
 */
import { type ErrorCategory, type ErrorState } from '../types/errors.js';
/** Maximum phase number before exhaustion. */
export declare const MAX_PHASE = 3;
/** Default retry limit when category not found. */
export declare const DEFAULT_RETRY_LIMIT = 2;
/**
 * Generates a stable signature from tool name and error message for deduplication.
 *
 * This implementation combines the best of both approaches:
 * - Normalizes variable parts (numbers, strings, paths, timestamps)
 * - Creates a deterministic signature for grouping similar errors
 * - Supports optional tool name for more specific signatures
 *
 * @param errorOrToolName - Either the error message (single arg) or tool name (two args)
 * @param errorMessage - The error message when tool name is provided
 * @returns A stable signature string for the error
 *
 * @example
 * // With tool name (fix-loop style)
 * generateErrorSignature('Bash', 'Error at line 42: file.ts')
 * // Returns: 'Bash:bm9ybWFsaXplZF9lcnI='
 *
 * @example
 * // Without tool name (retry-tracker style)
 * generateErrorSignature('Error at line 42: file.ts')
 * // Returns: 'err_a1b2c3d4'
 */
export declare function generateErrorSignature(errorOrToolName: string, errorMessage?: string): string;
/**
 * Determines if the current phase should escalate based on retry limits.
 *
 * Escalation occurs when the number of attempts in the current phase
 * reaches the limit for the error's category and we're not already
 * at the maximum phase.
 *
 * @param state - The current error state
 * @returns True if the phase should be escalated
 *
 * @example
 * const state = { category: 'typescript_error', phase: 1, attemptsThisPhase: 3 };
 * shouldEscalatePhase(state); // true (typescript_error limit is 3)
 */
export declare function shouldEscalatePhase(state: ErrorState): boolean;
/**
 * Escalates the error state to the next phase, resetting attempt counter.
 *
 * If already at MAX_PHASE, returns the state unchanged.
 *
 * @param state - The current error state
 * @returns A new error state with incremented phase and reset attempts
 *
 * @example
 * const state = { phase: 1, attemptsThisPhase: 3, ... };
 * const escalated = escalatePhase(state);
 * // { phase: 2, attemptsThisPhase: 0, ... }
 */
export declare function escalatePhase(state: ErrorState): ErrorState;
/**
 * Checks if all retry phases have been exhausted for the error.
 *
 * Returns true when:
 * - The error is at the maximum phase (3)
 * - AND the attempts in this phase have reached the category limit
 *
 * @param state - The current error state
 * @returns True if retries are exhausted and escalation to user is needed
 *
 * @example
 * const state = { category: 'npm_install', phase: 3, attemptsThisPhase: 2 };
 * hasExhaustedRetries(state); // true (npm_install limit is 2)
 */
export declare function hasExhaustedRetries(state: ErrorState): boolean;
/**
 * Gets the retry limit for a given error category.
 *
 * @param category - The error category
 * @returns The retry limit for the category
 */
export declare function getRetryLimit(category: ErrorCategory): number;
/**
 * Gets the remaining attempts in the current phase.
 *
 * @param state - The current error state
 * @returns Number of attempts remaining before phase escalation
 */
export declare function getRemainingAttemptsInPhase(state: ErrorState): number;
/**
 * Gets a human-readable description of the current phase.
 *
 * @param phase - The phase number (1, 2, or 3)
 * @returns Description of what the phase represents
 */
export declare function getPhaseDescription(phase: number): string;
