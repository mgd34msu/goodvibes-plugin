/**
 * Error Categorization Logic
 *
 * Contains category mappings and pattern matching functions
 * for categorizing errors and finding relevant recovery patterns.
 */
import { type RecoveryPattern, type ErrorSeverity } from './error-patterns.js';
import type { ErrorCategory } from '../types/errors.js';
/** Maps ErrorCategory to pattern category names for lookup */
export declare const ERROR_CATEGORY_MAP: Record<ErrorCategory, string[]>;
/** Maps ErrorCategory to a single pattern category for hints lookup */
export declare const CATEGORY_TO_PATTERN_MAP: Record<ErrorCategory, string>;
/**
 * Find a matching recovery pattern for the given error category and message.
 * First attempts to match by category mapping, then falls back to pattern matching.
 *
 * @param category - The classified error category
 * @param errorMessage - The raw error message text to match against patterns
 * @returns The matching RecoveryPattern with suggested fix, or null if no match found
 */
export declare function findMatchingPattern(category: ErrorCategory, errorMessage: string): RecoveryPattern | null;
/**
 * Get all matching patterns for an error (may match multiple categories).
 *
 * @param error - The raw error message to analyze
 * @returns Array of all RecoveryPatterns whose regex matches the error
 */
export declare function findAllMatchingPatterns(error: string): RecoveryPattern[];
/**
 * Get the highest severity from a list of patterns.
 * Severity order: low < medium < high < critical.
 *
 * @param patterns - Array of RecoveryPatterns to evaluate
 * @returns The highest ErrorSeverity found, or 'low' if array is empty
 */
export declare function getHighestSeverity(patterns: RecoveryPattern[]): ErrorSeverity;
