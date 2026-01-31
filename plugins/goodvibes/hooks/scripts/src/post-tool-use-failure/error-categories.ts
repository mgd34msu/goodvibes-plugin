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
export const ERROR_CATEGORY_MAP: Record<ErrorCategory, string[]> = {
  npm_install: ['missing_import', 'npm_error'],
  typescript_error: [
    'typescript_type_error',
    'typescript_config_error',
    'type_mismatch',
  ],
  test_failure: ['test_failure'],
  build_failure: ['build_failure'],
  file_not_found: ['file_not_found'],
  git_conflict: ['git_error'],
  database_error: ['database_error'],
  api_error: ['api_error'],
  unknown: [
    'undefined_reference',
    'lint_error',
    'permission_error',
    'resource_error',
    'syntax_error',
  ],
};

/**
 * Maps ErrorCategory enum values to a single primary pattern category.
 * Used for research hints lookup where only one pattern category is needed.
 * Each ErrorCategory maps to its most representative pattern category.
 *
 * @example
 * CATEGORY_TO_PATTERN_MAP['npm_install']
 * // => 'npm_error'
 */
export const CATEGORY_TO_PATTERN_MAP: Record<ErrorCategory, string> = {
  npm_install: 'npm_error',
  typescript_error: 'typescript_type_error',
  test_failure: 'test_failure',
  build_failure: 'build_failure',
  file_not_found: 'file_not_found',
  git_conflict: 'git_error',
  database_error: 'database_error',
  api_error: 'api_error',
  unknown: 'undefined_reference',
};
