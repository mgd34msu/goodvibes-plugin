import type { ErrorState, ErrorCategory } from '../types/errors.js';
import { generateErrorSignature, shouldEscalatePhase, escalatePhase, hasExhaustedRetries } from '../shared/error-handling-core.js';
export { generateErrorSignature, shouldEscalatePhase, escalatePhase, hasExhaustedRetries };
/**
 * Categorizes an error message into a known error category based on keywords.
 */
export declare function categorizeError(_toolName: string, errorMessage: string): ErrorCategory;
/**
 * Creates a new error state object for tracking fix attempts.
 */
export declare function createErrorState(signature: string, category: ErrorCategory): ErrorState;
/**
 * Builds a context string for the fix loop with error details and history.
 */
export declare function buildFixContext(state: ErrorState, error: string): string;
