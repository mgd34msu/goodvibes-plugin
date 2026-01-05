/**
 * State management for GoodVibes hooks.
 */
import type { HooksState } from './types/state.js';
/**
 * Loads hook state from disk, returning defaults if not found.
 *
 * Reads the persisted hooks state from the .goodvibes/state directory.
 * If the file doesn't exist or is corrupted, returns a fresh default state.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to the loaded HooksState or default state
 *
 * @example
 * const state = await loadState('/path/to/project');
 * console.log(state.session.id);
 */
export declare function loadState(cwd: string): Promise<HooksState>;
/**
 * Persists hook state to disk with atomic write.
 *
 * Saves the hooks state to disk using an atomic write pattern (write to temp file,
 * then rename) to prevent corruption from interrupted writes.
 *
 * @param cwd - The current working directory (project root)
 * @param state - The HooksState object to persist
 * @returns Promise that resolves when the state is saved
 *
 * @example
 * const state = await loadState(cwd);
 * state.session.id = 'new-session-id';
 * await saveState(cwd, state);
 */
export declare function saveState(cwd: string, state: HooksState): Promise<void>;
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
export declare function trackError(state: HooksState, signature: string, errorState: HooksState['errors'][string]): HooksState;
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
export declare function clearError(state: HooksState, signature: string): HooksState;
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
export declare function getErrorState(state: HooksState, signature: string): HooksState['errors'][string] | undefined;
/**
 * Initializes a new session with the given ID and clears session-specific data.
 *
 * Sets up the session state with a new ID and timestamp, and resets
 * the file tracking arrays for the new session.
 * Returns a new state object with initialized session.
 *
 * @param state - The HooksState object to initialize
 * @param sessionId - The unique identifier for the new session
 * @returns A new HooksState object with initialized session
 *
 * @example
 * const newState = initializeSession(state, 'session-2024-01-04-abc123');
 */
export declare function initializeSession(state: HooksState, sessionId: string): HooksState;
/**
 * Resets state for a new session while preserving git and error history.
 *
 * Creates a new default state but preserves certain information that should
 * persist across sessions, such as git repository state and error tracking history.
 *
 * @param state - The current HooksState to extract preserved data from
 * @returns A new HooksState with default values but preserved git and errors
 *
 * @example
 * const freshState = resetForNewSession(oldState);
 * await saveState(cwd, freshState);
 */
export declare function resetForNewSession(state: HooksState): HooksState;
