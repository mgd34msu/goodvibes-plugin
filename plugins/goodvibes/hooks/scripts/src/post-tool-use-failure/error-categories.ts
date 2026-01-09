/**
 * Error Categorization Logic
 *
 * Contains category mappings and pattern matching functions
 * for categorizing errors and finding relevant recovery patterns.
 */

import type { ErrorCategory } from '../types/errors.js';

/** Maps ErrorCategory to pattern category names for lookup */
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

/** Maps ErrorCategory to a single pattern category for hints lookup */
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

// Re-export pattern matching functions from pattern-matcher module
export {
  findMatchingPattern,
  findAllMatchingPatterns,
  getHighestSeverity,
} from './pattern-matcher.js';
