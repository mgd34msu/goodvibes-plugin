/**
 * Error Handler — Layer 1
 *
 * Wraps trigger handler execution with retry logic and dead-letter routing.
 *
 * Guarantees:
 *  - Never throws — always returns a result or error object
 *  - Evaluates retry policy (fixed / exponential backoff)
 *  - Routes to dead-letter queue on exhaustion
 *  - Produces error events so Layer 2/3 can react
 */

import { createLogger } from '../../shared/logger.js';
import { computeDelay } from '../utils/retry.js';
import { generateEventId } from '../../shared/utils.js';
import type {
  RuntimeEvent,
  HandlerResult,
  RetryPolicy,
  Action,
  TriggerHandlerFn,
  ErrorHandlerInterface,
  ErrorHandlerResult,
} from '../types.js';
import type { DeadLetterQueueInterface } from '../types.js';

const logger = createLogger('core:error-handler');

/**
 * Re-export for backwards compatibility — prefer TriggerHandlerFn from types.ts.
 * @deprecated Use `TriggerHandlerFn` from `'./types.js'` instead.
 *   Migration: replace `import { TriggerHandler } from './error-handler.js'`
 *   with `import type { TriggerHandlerFn } from './types.js'`
 * @removal next-major
 */
export type TriggerHandler = TriggerHandlerFn;

export interface ErrorHandlerOptions {
  /** Dead-letter queue for events that exhaust retries. */
  deadLetter: DeadLetterQueueInterface;
}

/**
 * Re-export for backwards compatibility — prefer ErrorHandlerResult from types.ts.
 * @deprecated Use `ErrorHandlerResult` from `'./types.js'` instead.
 *   Migration: replace `import { ExecutionResult } from './error-handler.js'`
 *   with `import type { ErrorHandlerResult } from './types.js'`
 * @removal next-major
 */
export type ExecutionResult = ErrorHandlerResult;

/**
 * Sleep for `ms` milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Builds an error event to enqueue when a handler fails.
 */
function buildErrorEvent(
  trigger_id: string,
  error: Error,
  original_event: RuntimeEvent,
): RuntimeEvent {
  return {
    id: generateEventId(),
    source: { kind: 'internal' as const },
    type: 'core:handler_error',
    payload: {
      type: 'core:handler_error' as const,
      data: {
        trigger_id,
        error_message: error.message,
        original_event_id: original_event.id,
        original_event_type: original_event.type,
      },
    },
    timestamp: Date.now(),
    priority: -1, // low priority — processed after normal events
    metadata: { session_id: '', sequence: 0, version: 1 as const },
    context: {
      workflow_id: original_event.context?.workflow_id,
      parent_event_id: original_event.id,
      chain_depth: (original_event.context?.chain_depth ?? 0) + 1,
    },
  };
}

/**
 * Wraps trigger handler execution with retry and dead-letter routing.
 */
export class ErrorHandler implements ErrorHandlerInterface {
  private readonly deadLetter: DeadLetterQueueInterface;

  constructor(options: ErrorHandlerOptions) {
    this.deadLetter = options.deadLetter;
  }

  /**
   * Execute a handler with retry logic.
   *
   * - If no retry policy: single attempt.
   * - If retry policy: up to `max_attempts` total attempts with configured backoff.
   * - On final failure: move to dead-letter queue and produce an error event.
   * - Never throws.
   */
  async execute(
    trigger_id: string,
    handler: TriggerHandlerFn,
    event: RuntimeEvent,
    retry?: RetryPolicy,
  ): Promise<ErrorHandlerResult> {
    const maxAttempts = retry?.max_attempts ?? 1;
    let lastError: Error | undefined;
    const error_events: RuntimeEvent[] = [];

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Apply backoff before retry (not before the first attempt)
      if (attempt > 0 && retry) {
        const delay = computeDelay(retry.backoff, retry.delay_ms, attempt - 1);
        logger.debug('Retrying handler', { trigger_id, attempt, delay_ms: delay });
        await sleep(delay);
      }

      try {
        const result = await handler(event);
        if (result.error) {
          // Handler returned a non-fatal error
          lastError = result.error;
          logger.warn('Handler returned error result', {
            trigger_id,
            attempt: attempt + 1,
            error: result.error.message,
          });
          // If the handler provided an error in its result but we still have
          // the result, treat as soft error and proceed
          if (attempt < maxAttempts - 1) {
            continue;
          }
        } else {
          // Success
          logger.debug('Handler executed successfully', {
            trigger_id,
            attempts: attempt + 1,
          });
          return { success: true, result, attempts: attempt + 1, error_events };
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        logger.warn('Handler threw exception', {
          trigger_id,
          attempt: attempt + 1,
          maxAttempts,
          error: lastError.message,
        });
      }
    }

    // Exhausted all attempts
    const finalError = lastError ?? new Error('Handler failed with unknown error');
    logger.error('Handler exhausted retries; dead-lettering event', {
      trigger_id,
      event_id: event.id,
      event_type: event.type,
      attempts: maxAttempts,
      error: finalError.message,
    });

    // Move to dead-letter queue
    this.deadLetter.add({
      event,
      error: finalError.message,
      dead_lettered_at: Date.now(),
      attempt_count: maxAttempts,
      trigger_id,
    });

    // Produce error event for Layer 2/3 to react
    error_events.push(buildErrorEvent(trigger_id, finalError, event));

    return {
      success: false,
      error: finalError,
      attempts: maxAttempts,
      error_events,
    };
  }

  /**
   * Build the set of actions from a failed execution.
   * Returns cancel_event action and any handler-provided actions.
   */
  buildFailureActions(trigger_id: string): Action[] {
    return [
      {
        type: 'cancel_event',
        params: { trigger_id, reason: 'handler_exhausted' },
      },
    ];
  }
}
