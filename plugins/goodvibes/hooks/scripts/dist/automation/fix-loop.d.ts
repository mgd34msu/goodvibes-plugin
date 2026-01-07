/**
 * Fix Loop
 *
 * Error categorization and fix loop orchestration for automated error recovery.
 * Builds context messages with error details, documentation, and previously attempted fixes
 * to guide the AI through multi-phase error resolution strategies.
 *
 * @module automation/fix-loop
 * @see {@link ../post-tool-use-failure} for error pattern matching and recovery
 */
import { generateErrorSignature, shouldEscalatePhase, escalatePhase, hasExhaustedRetries } from '../shared/error-handling-core.js';
import type { ErrorState, ErrorCategory } from '../types/errors.js';
export { generateErrorSignature, shouldEscalatePhase, escalatePhase, hasExhaustedRetries, };
/**
 * Categorizes an error message into a known error category based on keywords.
 * Analyzes the error message content to determine the type of error for
 * appropriate fix strategy selection.
 *
 * @param errorMessage - The error message to categorize
 * @returns The ErrorCategory that best matches the error message
 *
 * @example
 * const category = categorizeError('npm ERR! ERESOLVE could not resolve');
 * // Returns: 'npm_install'
 */
export declare function categorizeError(errorMessage: string): ErrorCategory;
/**
 * Creates a new error state object for tracking fix attempts.
 * Initializes all counters and tracking arrays for a fresh error fixing session.
 *
 * @param signature - A unique signature identifying this specific error
 * @param category - The category of error being tracked
 * @returns A new ErrorState object initialized with default values
 *
 * @example
 * const state = createErrorState('hash123', 'typescript_error');
 * // Returns initialized error state ready for fix tracking
 */
export declare function createErrorState(signature: string, category: ErrorCategory): ErrorState;
/**
 * Builds a context string for the fix loop with error details and history.
 * Creates a formatted message containing the current phase, error preview,
 * attempt counts, relevant documentation, and previously attempted fixes.
 *
 * @param state - The current error state with fix attempt history
 * @param error - The error message to include in the context
 * @returns A formatted string containing all relevant fix context
 *
 * @example
 * const context = buildFixContext(errorState, 'Cannot find module...');
 * // Returns multi-line string with phase, error, docs, and history
 */
export declare function buildFixContext(state: ErrorState, error: string): string;
