/**
 * Retry — Core Layer
 *
 * Backoff computation and generic async retry.
 * Used by error-handler.ts and available for all layers.
 */

import { createLogger } from '../../shared/logger.js';
import { ProcessingError } from '../../shared/errors.js';

const logger = createLogger('core:retry');

/**
 * Compute the delay for the nth attempt (0-indexed).
 */
export function computeDelay(
  backoff: 'fixed' | 'exponential',
  baseMs: number,
  attempt: number,
): number {
  if (backoff === 'exponential') {
    return baseMs * Math.pow(2, attempt);
  }
  return baseMs;
}

/**
 * Options for the generic retry helper.
 */
export interface RetryOptions {
  /** Maximum attempts including the first (default: 3). */
  maxAttempts?: number;
  /** Backoff strategy (default: 'exponential'). */
  backoff?: 'fixed' | 'exponential';
  /** Base delay in ms between attempts (default: 1000). */
  delayMs?: number;
  /** Optional predicate — return false to abort retries early. */
  shouldRetry?: (err: unknown) => boolean;
}

/**
 * Execute `fn` with retry logic. Throws the last error if all attempts fail.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  opts?: RetryOptions,
): Promise<T> {
  const maxAttempts = opts?.maxAttempts ?? 3;
  const backoff = opts?.backoff ?? 'exponential';
  const delayMs = opts?.delayMs ?? 1000;
  const shouldRetry = opts?.shouldRetry ?? (() => true);

  if (maxAttempts < 1) throw new ProcessingError('maxAttempts must be >= 1');

  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt + 1 >= maxAttempts) break;
      if (!shouldRetry(err)) break;
      const delay = computeDelay(backoff, delayMs, attempt);
      logger.debug('retrying', { attempt: attempt + 1, delay_ms: delay });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
