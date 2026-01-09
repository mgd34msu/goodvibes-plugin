/**
 * Pattern Matching for Error Recovery
 *
 * Functions to match error messages against recovery patterns and
 * provide suggested fixes based on error state.
 */
import type { RecoveryPattern, ErrorSeverity } from './recovery-types.js';
import type { ErrorState, ErrorCategory } from '../types/errors.js';
/**
 * Find a matching recovery pattern for the given error category and message.
 * First attempts to match by category mapping, then falls back to pattern matching.
 * Returns the first pattern whose regex matches the error message.
 *
 * @param category - The classified error category (e.g., 'typescript_error', 'test_failure')
 * @param errorMessage - The raw error message text to match against patterns
 * @returns The matching RecoveryPattern with suggested fix, or null if no match found
 *
 * @example
 * const pattern = findMatchingPattern('typescript_error', "Type 'string' is not assignable to type 'number'");
 * if (pattern) {
 *   debug(pattern.suggestedFix);  // 'Run `npx tsc --noEmit`...'
 * }
 */
export declare function findMatchingPattern(category: ErrorCategory, errorMessage: string): RecoveryPattern | null;
/**
 * Get all matching patterns for an error (may match multiple categories).
 * Unlike findMatchingPattern, this returns all patterns that match,
 * useful for complex errors that span multiple categories.
 *
 * @param error - The raw error message to analyze
 * @returns Array of all RecoveryPatterns whose regex matches the error
 *
 * @example
 * const patterns = findAllMatchingPatterns('Error: Cannot find module "foo"');
 * // May return both 'missing_import' and 'npm_error' patterns
 */
export declare function findAllMatchingPatterns(error: string): RecoveryPattern[];
/**
 * Get the highest severity from a list of patterns.
 * Severity order from lowest to highest: low, medium, high, critical.
 *
 * @param patterns - Array of RecoveryPatterns to evaluate
 * @returns The highest ErrorSeverity found, or 'low' if array is empty
 *
 * @example
 * const patterns = findAllMatchingPatterns(errorMessage);
 * const severity = getHighestSeverity(patterns);
 * if (severity === 'critical') {
 *   debug('Immediate attention required');
 * }
 */
export declare function getHighestSeverity(patterns: RecoveryPattern[]): ErrorSeverity;
/**
 * Get suggested fix for an error message, considering error state for phase-specific advice.
 * Uses pattern matching to find relevant recovery advice and appends phase-specific
 * guidance when previous fix attempts have failed.
 *
 * @param category - The classified error category
 * @param errorMessage - The raw error message to analyze
 * @param errorState - Current error state with phase and attempted strategies
 * @returns A string containing the suggested fix approach
 *
 * @example
 * const fix = getSuggestedFix('npm_install', 'Module not found: lodash', errorState);
 * debug(fix);  // 'Run `npm install` to ensure all dependencies...'
 */
export declare function getSuggestedFix(category: ErrorCategory, errorMessage: string, errorState: ErrorState): string;
