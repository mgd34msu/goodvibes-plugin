/**
 * State updater functions - immutable state update operations.
 */

import type { HooksState } from '../types/state.js';

/**
 * Generic helper to update a nested state property.
 *
 * Returns a new state object with the updated nested property.
 * Does not mutate the original state.
 *
 * @internal
 * @param state - The HooksState object to update
 * @param key - The key of the nested state property to update
 * @param updates - Partial updates to merge into the nested property
 * @returns A new HooksState object with the updated nested property
 *
 * @example
 * const newState = updateNestedState(state, 'session', { id: 'new-id' });
 */
function updateNestedState<K extends keyof HooksState>(
  state: HooksState,
  key: K,
  updates: Partial<HooksState[K]>
): HooksState {
  return {
    ...state,
    [key]: { ...state[key], ...updates },
  };
}

/**
 * Updates session-related state with partial data.
 *
 * Returns a new state object with the updated session properties.
 * Does not mutate the original state.
 *
 * @param state - The HooksState object to update
 * @param updates - Partial session state properties to merge
 * @returns A new HooksState object with updated session
 *
 * @example
 * const newState = updateSessionState(state, { id: 'new-id', startedAt: new Date().toISOString() });
 */
export function updateSessionState(
  state: HooksState,
  updates: Partial<HooksState['session']>
): HooksState {
  return updateNestedState(state, 'session', updates);
}

/**
 * Updates test-related state with partial data.
 *
 * Returns a new state object with the updated tests properties.
 * Does not mutate the original state.
 *
 * @param state - The HooksState object to update
 * @param updates - Partial tests state properties to merge
 * @returns A new HooksState object with updated tests
 *
 * @example
 * const newState = updateTestState(state, { lastRun: new Date().toISOString(), passing: true });
 */
export function updateTestState(
  state: HooksState,
  updates: Partial<HooksState['tests']>
): HooksState {
  return updateNestedState(state, 'tests', updates);
}

/**
 * Updates build-related state with partial data.
 *
 * Returns a new state object with the updated build properties.
 * Does not mutate the original state.
 *
 * @param state - The HooksState object to update
 * @param updates - Partial build state properties to merge
 * @returns A new HooksState object with updated build
 *
 * @example
 * const newState = updateBuildState(state, { lastRun: new Date().toISOString(), passing: true });
 */
export function updateBuildState(
  state: HooksState,
  updates: Partial<HooksState['build']>
): HooksState {
  return updateNestedState(state, 'build', updates);
}

/**
 * Updates git-related state with partial data.
 *
 * Returns a new state object with the updated git properties.
 * Does not mutate the original state.
 *
 * @param state - The HooksState object to update
 * @param updates - Partial git state properties to merge
 * @returns A new HooksState object with updated git
 *
 * @example
 * const newState = updateGitState(state, { currentBranch: 'feature/new-feature', isRepo: true });
 */
export function updateGitState(
  state: HooksState,
  updates: Partial<HooksState['git']>
): HooksState {
  return updateNestedState(state, 'git', updates);
}
