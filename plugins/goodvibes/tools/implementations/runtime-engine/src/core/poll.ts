/**
 * Poll — Core Layer
 *
 * Deadline-based polling utility.
 * Repeatedly calls a check function until it returns a truthy value or timeout.
 */

import { createLogger } from '../shared/logger.js';

const logger = createLogger('core:poll');

/**
 * Options for pollUntil.
 */
export interface PollOptions {
  /** Maximum time to poll in milliseconds. */
  timeoutMs: number;
  /** Interval between polls in milliseconds (default: 100). */
  intervalMs?: number;
}

/**
 * Poll `check` at `intervalMs` intervals until it returns a non-null/undefined
 * value, or until `timeoutMs` elapses. Returns null on timeout.
 *
 * If `check` throws, the error propagates immediately (no retry).
 */
export function pollUntil<T>(
  check: () => T | null | undefined,
  opts: PollOptions,
): Promise<T | null> {
  const intervalMs = opts.intervalMs ?? 100;
  const deadline = Date.now() + opts.timeoutMs;

  if (opts.timeoutMs < 0) throw new Error('timeoutMs must be >= 0');
  if (intervalMs <= 0) throw new Error('intervalMs must be > 0');

  return new Promise<T | null>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    /** Cancel any pending interval timer. Called before every resolve/reject. */
    const cleanup = (): void => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const tick = (): void => {
      try {
        const result = check();
        if (result !== null && result !== undefined) {
          cleanup();
          resolve(result);
          return;
        }
      } catch (err) {
        cleanup();
        reject(err);
        return;
      }

      if (Date.now() >= deadline) {
        logger.debug('pollUntil timed out', { timeoutMs: opts.timeoutMs });
        cleanup();
        resolve(null);
        return;
      }

      timer = setTimeout(tick, intervalMs);
    };

    tick();
  });
}
