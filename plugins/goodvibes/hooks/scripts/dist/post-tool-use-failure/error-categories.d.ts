/**
 * Error Categorization Logic
 *
 * Contains category mappings for categorizing errors
 * and finding relevant recovery patterns.
 */
import type { ErrorCategory } from '../types/errors.js';
/**
 * Maps ErrorCategory enum values to arrays of pattern category names.
 * Used by pattern-matcher to find relevant recovery patterns for each error type.
 * Multiple pattern categories can be associated with a single ErrorCategory.
 *
 * @example
 * ERROR_CATEGORY_MAP['typescript_error']
 * // => ['typescript_type_error', 'typescript_config_error', 'type_mismatch']
 */
export declare const ERROR_CATEGORY_MAP: Record<ErrorCategory, string[]>;
/**
 * Maps ErrorCategory enum values to a single primary pattern category.
 * Used for research hints lookup where only one pattern category is needed.
 * Each ErrorCategory maps to its most representative pattern category.
 *
 * @example
 * CATEGORY_TO_PATTERN_MAP['npm_install']
 * // => 'npm_error'
 */
export declare const CATEGORY_TO_PATTERN_MAP: Record<ErrorCategory, string>;
