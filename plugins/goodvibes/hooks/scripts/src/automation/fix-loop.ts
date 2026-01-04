import type { ErrorState, ErrorCategory } from '../types/errors.js';
import { PHASE_RETRY_LIMITS } from '../types/errors.js';

/** Maximum length for normalized error message before hashing. */
const ERROR_NORMALIZE_MAX_LENGTH = 100;

/** Maximum length for base64 signature suffix. */
const SIGNATURE_MAX_LENGTH = 20;

/** Maximum length for error message in fix context. */
const ERROR_PREVIEW_MAX_LENGTH = 200;

/** Maximum length for documentation content in fix context. */
const DOCS_CONTENT_MAX_LENGTH = 2000;

/** Number of recent fix attempts to show in context. */
const RECENT_ATTEMPTS_COUNT = 3;

/** Maximum phase number before exhaustion. */
const MAX_PHASE = 3;

/** Default retry limit when category not found. */
const DEFAULT_RETRY_LIMIT = 2;

/**
 * Generates a stable signature from tool name and error message for deduplication.
 */
export function generateErrorSignature(toolName: string, errorMessage: string): string {
  // Create a stable signature from the error
  const normalized = errorMessage
    .replace(/\d+/g, 'N')  // Replace numbers
    .replace(/(['"])[^'"]*\1/g, 'STR')  // Replace strings
    .slice(0, ERROR_NORMALIZE_MAX_LENGTH);
  return `${toolName}:${Buffer.from(normalized).toString('base64').slice(0, SIGNATURE_MAX_LENGTH)}`;
}

/**
 * Categorizes an error message into a known error category based on keywords.
 */
export function categorizeError(_toolName: string, errorMessage: string): ErrorCategory {
  const lower = errorMessage.toLowerCase();

  if (lower.includes('eresolve') || lower.includes('npm') || lower.includes('peer dep')) {
    return 'npm_install';
  }
  if (lower.includes('ts') && (lower.includes('error') || lower.includes('type'))) {
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
  if (lower.includes('database') || lower.includes('prisma') || lower.includes('sql')) {
    return 'database_error';
  }
  if (lower.includes('api') || lower.includes('fetch') || lower.includes('request')) {
    return 'api_error';
  }

  return 'unknown';
}

/**
 * Creates a new error state object for tracking fix attempts.
 */
export function createErrorState(signature: string, category: ErrorCategory): ErrorState {
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
 * Determines if the current phase should escalate based on retry limits.
 */
export function shouldEscalatePhase(state: ErrorState): boolean {
  const maxPerPhase = PHASE_RETRY_LIMITS[state.category as ErrorCategory] || DEFAULT_RETRY_LIMIT;
  return state.attemptsThisPhase >= maxPerPhase;
}

/**
 * Escalates the error state to the next phase, resetting attempt counter.
 */
export function escalatePhase(state: ErrorState): ErrorState {
  if (state.phase >= MAX_PHASE) return state;

  return {
    ...state,
    phase: (state.phase + 1) as 1 | 2 | 3,
    attemptsThisPhase: 0,
  };
}

/**
 * Checks if all retry phases have been exhausted for the error.
 */
export function hasExhaustedRetries(state: ErrorState): boolean {
  const maxPerPhase = PHASE_RETRY_LIMITS[state.category as ErrorCategory] || DEFAULT_RETRY_LIMIT;
  return state.phase >= MAX_PHASE && state.attemptsThisPhase >= maxPerPhase;
}

/**
 * Builds a context string for the fix loop with error details and history.
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
    for (const attempt of state.fixStrategiesAttempted.slice(-RECENT_ATTEMPTS_COUNT)) {
      parts.push(`- ${attempt.strategy}`);
    }
    parts.push('Try a DIFFERENT approach.');
  }

  return parts.join('\n');
}
