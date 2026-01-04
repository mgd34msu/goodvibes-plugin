/**
 * Error Recovery Pattern Library
 *
 * Provides recovery patterns for common error types encountered during tool use.
 * Matches error messages to known patterns and suggests fixes.
 */
import type { ErrorState, ErrorCategory } from '../types/errors.js';
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';
export interface RecoveryPattern {
    category: string;
    description: string;
    patterns: RegExp[];
    suggestedFix: string;
    severity: ErrorSeverity;
}
/**
 * Library of recovery patterns for common error types
 */
export declare const RECOVERY_PATTERNS: RecoveryPattern[];
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
 *   console.log(pattern.suggestedFix);  // 'Run `npx tsc --noEmit`...'
 * }
 */
export declare function findMatchingPattern(category: ErrorCategory, errorMessage: string): RecoveryPattern | null;
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
 * console.log(fix);  // 'Run `npm install` to ensure all dependencies...'
 */
export declare function getSuggestedFix(category: ErrorCategory, errorMessage: string, errorState: ErrorState): string;
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
 *   console.log('Immediate attention required');
 * }
 */
export declare function getHighestSeverity(patterns: RecoveryPattern[]): ErrorSeverity;
/**
 * Get research hints for an error based on category, message, and phase.
 * Returns documentation sources to consult, with official docs suggested
 * in phase 2 and community resources added in phase 3.
 *
 * @param category - The classified error category
 * @param errorMessage - The raw error message (currently unused, reserved for future use)
 * @param phase - Current escalation phase (1, 2, or 3)
 * @returns Object with `official` and `community` arrays of documentation hints
 *
 * @example
 * const hints = getResearchHints('typescript_error', errorMsg, 2);
 * // Returns: { official: ['typescriptlang.org error reference', ...], community: [] }
 *
 * @example
 * const hints = getResearchHints('typescript_error', errorMsg, 3);
 * // Returns: { official: [...], community: ['stackoverflow typescript', ...] }
 */
export declare function getResearchHints(category: ErrorCategory, errorMessage: string, phase: 1 | 2 | 3): {
    official: string[];
    community: string[];
};
