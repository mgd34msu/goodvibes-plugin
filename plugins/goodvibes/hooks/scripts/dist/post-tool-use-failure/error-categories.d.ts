/**
 * Error Categorization Logic
 *
 * Contains category mappings and pattern matching functions
 * for categorizing errors and finding relevant recovery patterns.
 */
import type { ErrorCategory } from '../types/errors.js';
/** Maps ErrorCategory to pattern category names for lookup */
export declare const ERROR_CATEGORY_MAP: Record<ErrorCategory, string[]>;
/** Maps ErrorCategory to a single pattern category for hints lookup */
export declare const CATEGORY_TO_PATTERN_MAP: Record<ErrorCategory, string>;
export { findMatchingPattern, findAllMatchingPatterns, getHighestSeverity, } from './pattern-matcher.js';
