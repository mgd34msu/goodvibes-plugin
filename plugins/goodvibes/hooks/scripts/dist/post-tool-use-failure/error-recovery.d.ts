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
 * Find a matching recovery pattern for the given error category and message
 */
export declare function findMatchingPattern(category: ErrorCategory, errorMessage: string): RecoveryPattern | null;
/**
 * Get suggested fix for an error message, considering error state for phase-specific advice
 */
export declare function getSuggestedFix(category: ErrorCategory, errorMessage: string, errorState: ErrorState): string;
/**
 * Get all matching patterns for an error (may match multiple categories)
 */
export declare function findAllMatchingPatterns(error: string): RecoveryPattern[];
/**
 * Get the highest severity from a list of patterns
 */
export declare function getHighestSeverity(patterns: RecoveryPattern[]): ErrorSeverity;
/**
 * Get research hints for an error based on category, message, and phase
 */
export declare function getResearchHints(category: ErrorCategory, errorMessage: string, phase: 1 | 2 | 3): {
    official: string[];
    community: string[];
};
