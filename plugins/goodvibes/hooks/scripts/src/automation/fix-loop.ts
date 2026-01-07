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

import type { ErrorState, ErrorCategory } from '../types/errors.js';
import { PHASE_RETRY_LIMITS } from '../types/errors.js';
import {
  generateErrorSignature,
  shouldEscalatePhase,
  escalatePhase,
  hasExhaustedRetries,
  MAX_PHASE,
  DEFAULT_RETRY_LIMIT,
} from '../shared/error-handling-core.js';

// Re-export consolidated functions for backwards compatibility
export {
  generateErrorSignature,
  shouldEscalatePhase,
  escalatePhase,
  hasExhaustedRetries,
};

/** Maximum length for error message in fix context. */
const ERROR_PREVIEW_MAX_LENGTH = 200;

/** Maximum length for documentation content in fix context. */
const DOCS_CONTENT_MAX_LENGTH = 2000;

/** Number of recent fix attempts to show in context. */
const RECENT_ATTEMPTS_COUNT = 3;

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
export function categorizeError(errorMessage: string): ErrorCategory {
  const lower = errorMessage.toLowerCase();

  if (
    lower.includes('eresolve') ||
    lower.includes('npm') ||
    lower.includes('peer dep')
  ) {
    return 'npm_install';
  }
  if (
    lower.includes('ts') &&
    (lower.includes('error') || lower.includes('type'))
  ) {
    return 'typescript_error';
  }
  if (lower.includes('test') && lower.includes('fail')) {
    return 'test_failure';
  }
  if (lower.includes('build') || lower.includes('compile')) {
    return 'build_failure';
  }
  if (lower.includes('enoent') || lower.includes('not found')) {
    return 'file_not_found';
  }
  if (lower.includes('conflict') || lower.includes('merge')) {
    return 'git_conflict';
  }
  if (
    lower.includes('database') ||
    lower.includes('prisma') ||
    lower.includes('sql')
  ) {
    return 'database_error';
  }
  if (
    lower.includes('api') ||
    lower.includes('fetch') ||
    lower.includes('request')
  ) {
    return 'api_error';
  }

  return 'unknown';
}

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
export function createErrorState(
  signature: string,
  category: ErrorCategory
): ErrorState {
  return {
    signature,
    category,
    phase: 1,
    attemptsThisPhase: 0,
    totalAttempts: 0,
    officialDocsSearched: [],
    officialDocsContent: '',
    unofficialDocsSearched: [],
    unofficialDocsContent: '',
    fixStrategiesAttempted: [],
  };
}

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
export function buildFixContext(state: ErrorState, error: string): string {
  const parts: string[] = [];

  parts.push(`[GoodVibes Fix Loop - Phase ${state.phase}/${MAX_PHASE}]`);
  parts.push(`Error: ${error.slice(0, ERROR_PREVIEW_MAX_LENGTH)}`);
  parts.push(`Attempt: ${state.attemptsThisPhase + 1} this phase`);
  parts.push(`Total attempts: ${state.totalAttempts}`);

  if (state.phase >= 2 && state.officialDocsContent) {
    parts.push('\n--- Official Documentation ---');
    parts.push(state.officialDocsContent.slice(0, DOCS_CONTENT_MAX_LENGTH));
  }

  if (state.phase >= MAX_PHASE && state.unofficialDocsContent) {
    parts.push('\n--- Community Solutions ---');
    parts.push(state.unofficialDocsContent.slice(0, DOCS_CONTENT_MAX_LENGTH));
  }

  if (state.fixStrategiesAttempted.length > 0) {
    parts.push('\n--- Previously Attempted (failed) ---');
    for (const attempt of state.fixStrategiesAttempted.slice(
      -RECENT_ATTEMPTS_COUNT
    )) {
      parts.push(`- ${attempt.strategy}`);
    }
    parts.push('Try a DIFFERENT approach.');
  }

  return parts.join('\n');
}
