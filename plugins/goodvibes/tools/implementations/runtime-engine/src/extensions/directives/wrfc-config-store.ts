/**
 * WRFC Config Store — Extensions Layer
 *
 * Stores WRFC runtime configuration (min review score, max fix attempts, etc.)
 * received from the config:loaded hook event. Extracted from DirectiveQueue
 * to maintain single responsibility — queues should only manage queueing.
 */
import { createLogger } from '../../shared/logger.js';

const logger = createLogger('wrfc-config-store');

/**
 * Validates and sanitises raw WRFC config from a config:loaded event.
 *
 * Accepts an unknown value and returns only the fields that pass validation.
 * Invalid fields are rejected with a warning log and omitted from the result.
 *
 * @param raw - The raw wrfc config object from the hook event payload.
 * @returns A validated Record containing only safe, typed fields.
 */
export function validateWRFCConfig(raw: Record<string, unknown>): Record<string, unknown> {
  const validated: Record<string, unknown> = {};

  // Accept both 'score_threshold' (primary) and 'min_review_score' (legacy alias)
  const scoreValue = raw.score_threshold ?? raw.min_review_score;
  if (typeof scoreValue === 'number' && scoreValue >= 0 && scoreValue <= 10) {
    validated.score_threshold = scoreValue;
  } else if (scoreValue !== undefined) {
    logger.warn('Invalid score_threshold/min_review_score rejected', { value: scoreValue, expected: 'number 0-10' });
  }
  if (typeof raw.max_fix_attempts === 'number' && Number.isInteger(raw.max_fix_attempts) && raw.max_fix_attempts > 0) {
    validated.max_fix_attempts = raw.max_fix_attempts;
  } else if (raw.max_fix_attempts !== undefined) {
    logger.warn('Invalid max_fix_attempts rejected', { value: raw.max_fix_attempts, expected: 'positive integer' });
  }
  if (typeof raw.auto_commit === 'boolean') {
    validated.auto_commit = raw.auto_commit;
  } else if (raw.auto_commit !== undefined) {
    logger.warn('Invalid auto_commit rejected', { value: raw.auto_commit, expected: 'boolean' });
  }
  if (
    Array.isArray(raw.require_review_types) &&
    (raw.require_review_types as unknown[]).every((t: unknown) => typeof t === 'string' && (t as string).length > 0)
  ) {
    validated.require_review_types = raw.require_review_types;
  } else if (raw.require_review_types !== undefined) {
    logger.warn('Invalid require_review_types rejected', { value: raw.require_review_types, expected: 'string[]' });
  }

  return validated;
}

export class WRFCConfigStore {
  private config: Record<string, unknown> = {};

  /** Store validated WRFC config from config:loaded hook event. */
  set(config: Record<string, unknown>): void {
    this.config = config;
    logger.debug('WRFC config stored', { keys: Object.keys(config) });
  }

  /** Get the current WRFC config. */
  get(): Record<string, unknown> {
    return this.config;
  }
}
