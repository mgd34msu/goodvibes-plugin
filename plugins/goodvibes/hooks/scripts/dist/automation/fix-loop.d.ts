import type { ErrorState, ErrorCategory } from '../types/errors.js';
/**
 * Generates a stable signature from tool name and error message for deduplication.
 */
export declare function generateErrorSignature(toolName: string, errorMessage: string): string;
/**
 * Categorizes an error message into a known error category based on keywords.
 */
export declare function categorizeError(_toolName: string, errorMessage: string): ErrorCategory;
/**
 * Creates a new error state object for tracking fix attempts.
 */
export declare function createErrorState(signature: string, category: ErrorCategory): ErrorState;
/**
 * Determines if the current phase should escalate based on retry limits.
 */
export declare function shouldEscalatePhase(state: ErrorState): boolean;
/**
 * Escalates the error state to the next phase, resetting attempt counter.
 */
export declare function escalatePhase(state: ErrorState): ErrorState;
/**
 * Checks if all retry phases have been exhausted for the error.
 */
export declare function hasExhaustedRetries(state: ErrorState): boolean;
/**
 * Builds a context string for the fix loop with error details and history.
 */
export declare function buildFixContext(state: ErrorState, error: string): string;
