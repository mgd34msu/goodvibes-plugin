/**
 * Error tracking operations - managing error state and retry logic.
 */

import type { HooksState } from '../types/state.js';

/**
 * Tracks an error by its signature for retry management.
 *
 * Records an error state keyed by a unique signature string. This allows
 * the system to track error occurrences and manage retry attempts.
 * Returns a new state object with the updated errors.
 *
 * @param state - The HooksState object to update
 * @param signature - A unique identifier for the error (e.g., hash of error message)
 * @param errorState - The error state object containing retry count and details
 * @returns A new HooksState object with updated errors
 *
 * @example
 * const newState = trackError(state, 'build-failed-abc123', { count: 1, lastSeen: Date.now() });
 */
export function trackError(
  state: HooksState,
  signature: string,
  errorState: HooksState['errors'][string]
): HooksState {
  return {
    ...state,
    errors: {
      ...state.errors,
      [signature]: errorState,
    },
  };
}

/**
 * Removes a tracked error by its signature.
 *
 * Deletes the error state entry for the given signature, typically called
 * when an error has been resolved or retries have been exhausted.
 * Returns a new state object without the specified error.
 *
 * @param state - The HooksState object to update
 * @param signature - The unique identifier of the error to remove
 * @returns A new HooksState object without the specified error
 *
 * @example
 * const newState = clearError(state, 'build-failed-abc123');
 */
export function clearError(state: HooksState, signature: string): HooksState {
  // Intentional: Using destructuring to omit the error with matching signature
  // The underscore is a common convention for intentionally unused variables
  const { [signature]: _removed, ...remainingErrors } = state.errors;
  return {
    ...state,
    errors: remainingErrors,
  };
}

/**
 * Retrieves error state by signature, if it exists.
 *
 * Looks up the error tracking information for a given signature.
 * Returns undefined if no error with that signature is being tracked.
 *
 * @param state - The HooksState object to query
 * @param signature - The unique identifier of the error to retrieve
 * @returns The error state object if found, undefined otherwise
 *
 * @example
 * const errorState = getErrorState(state, 'build-failed-abc123');
 * if (errorState && errorState.count > 3) {
 *   console.log('Too many retries');
 * }
 */
export function getErrorState(
  state: HooksState,
  signature: string
): HooksState['errors'][string] | undefined {
  return state.errors[signature];
}
