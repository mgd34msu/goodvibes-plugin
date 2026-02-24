/**
 * State updater functions - immutable state update operations.
 */
import type { HooksState } from '../types/state.js';
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
export declare function updateSessionState(state: HooksState, updates: Partial<HooksState['session']>): HooksState;
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
export declare function updateTestState(state: HooksState, updates: Partial<HooksState['tests']>): HooksState;
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
export declare function updateBuildState(state: HooksState, updates: Partial<HooksState['build']>): HooksState;
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
export declare function updateGitState(state: HooksState, updates: Partial<HooksState['git']>): HooksState;
