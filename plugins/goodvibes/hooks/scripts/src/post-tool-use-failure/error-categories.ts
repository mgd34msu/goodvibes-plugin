/**
 * Error Categorization Logic
 *
 * Contains category mappings and pattern matching functions
 * for categorizing errors and finding relevant recovery patterns.
 */

import type { ErrorCategory } from '../types/errors.js';
import { RECOVERY_PATTERNS, type RecoveryPattern, type ErrorSeverity } from './error-patterns.js';

/** Maps ErrorCategory to pattern category names for lookup */
export const ERROR_CATEGORY_MAP: Record<ErrorCategory, string[]> = {
  npm_install: ['missing_import', 'npm_error'],
  typescript_error: ['typescript_type_error', 'typescript_config_error', 'type_mismatch'],
  test_failure: ['test_failure'],
  build_failure: ['build_failure'],
  file_not_found: ['file_not_found'],
  git_conflict: ['git_error'],
  database_error: ['database_error'],
  api_error: ['api_error'],
  unknown: ['undefined_reference', 'lint_error', 'permission_error', 'resource_error', 'syntax_error'],
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

/**
 * Find a matching recovery pattern for the given error category and message.
 * First attempts to match by category mapping, then falls back to pattern matching.
 *
 * @param category - The classified error category
 * @param errorMessage - The raw error message text to match against patterns
 * @returns The matching RecoveryPattern with suggested fix, or null if no match found
 */
export function findMatchingPattern(
  category: ErrorCategory,
  errorMessage: string
): RecoveryPattern | null {
  const patternCategories = ERROR_CATEGORY_MAP[category] || [];

  // First try to match by mapped category
  for (const pattern of RECOVERY_PATTERNS) {
    if (patternCategories.includes(pattern.category)) {
      for (const regex of pattern.patterns) {
        if (regex.test(errorMessage)) {
          return pattern;
        }
      }
    }
  }

  // Fall back to matching by pattern only
  for (const pattern of RECOVERY_PATTERNS) {
    for (const regex of pattern.patterns) {
      if (regex.test(errorMessage)) {
        return pattern;
      }
    }
  }

  return null;
}

/**
 * Get all matching patterns for an error (may match multiple categories).
 *
 * @param error - The raw error message to analyze
 * @returns Array of all RecoveryPatterns whose regex matches the error
 */
export function findAllMatchingPatterns(error: string): RecoveryPattern[] {
  const matches: RecoveryPattern[] = [];

  for (const pattern of RECOVERY_PATTERNS) {
    for (const regex of pattern.patterns) {
      if (regex.test(error)) {
        matches.push(pattern);
        break; // Only add each pattern once
      }
    }
  }

  return matches;
}

/**
 * Get the highest severity from a list of patterns.
 * Severity order: low < medium < high < critical.
 *
 * @param patterns - Array of RecoveryPatterns to evaluate
 * @returns The highest ErrorSeverity found, or 'low' if array is empty
 */
export function getHighestSeverity(patterns: RecoveryPattern[]): ErrorSeverity {
  const severityOrder: ErrorSeverity[] = ['low', 'medium', 'high', 'critical'];
  let highest: ErrorSeverity = 'low';

  for (const pattern of patterns) {
    if (severityOrder.indexOf(pattern.severity) > severityOrder.indexOf(highest)) {
      highest = pattern.severity;
    }
  }

  return highest;
}
