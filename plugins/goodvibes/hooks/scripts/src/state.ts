/**
 * State management for GoodVibes hooks.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { HooksState } from './types/state.js';
import { createDefaultState } from './types/state.js';
import { ensureGoodVibesDir, fileExistsAsync as fileExists } from './shared.js';
import { debug } from './shared/logging.js';

/** Relative path to the state file within .goodvibes directory. */
const STATE_FILE = 'state/hooks-state.json';

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
export async function loadState(cwd: string): Promise<HooksState> {
  const goodvibesDir = path.join(cwd, '.goodvibes');
  const statePath = path.join(goodvibesDir, STATE_FILE);

  if (!(await fileExists(statePath))) {
    return createDefaultState();
  }

  try {
    const content = await fs.readFile(statePath, 'utf-8');
    const state = JSON.parse(content) as HooksState;
    return state;
  } catch (error: unknown) {
    debug('Failed to load state, using defaults', error);
    return createDefaultState();
  }
}

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
export async function saveState(cwd: string, state: HooksState): Promise<void> {
  await ensureGoodVibesDir(cwd);
  const statePath = path.join(cwd, '.goodvibes', STATE_FILE);

  // Ensure state directory exists
  const stateDir = path.dirname(statePath);
  if (!(await fileExists(stateDir))) {
    await fs.mkdir(stateDir, { recursive: true });
  }

  try {
    // Atomic write: write to temp file, then rename
    const tempPath = statePath + '.tmp';
    await fs.writeFile(tempPath, JSON.stringify(state, null, 2));
    await fs.rename(tempPath, statePath);
  } catch (error: unknown) {
    debug('Failed to save state', error);
  }
}

/**
 * Updates session-related state with partial data.
 *
 * Merges the provided updates into the session state object.
 * This mutates the state object directly.
 *
 * @param state - The HooksState object to update
 * @param updates - Partial session state properties to merge
 *
 * @example
 * updateSessionState(state, { id: 'new-id', startedAt: new Date().toISOString() });
 */
export function updateSessionState(
  state: HooksState,
  updates: Partial<HooksState['session']>
): void {
  state.session = { ...state.session, ...updates };
}

/**
 * Updates test-related state with partial data.
 *
 * Merges the provided updates into the tests state object.
 * This mutates the state object directly.
 *
 * @param state - The HooksState object to update
 * @param updates - Partial tests state properties to merge
 *
 * @example
 * updateTestState(state, { lastRun: new Date().toISOString(), passing: true });
 */
export function updateTestState(
  state: HooksState,
  updates: Partial<HooksState['tests']>
): void {
  state.tests = { ...state.tests, ...updates };
}

/**
 * Updates build-related state with partial data.
 *
 * Merges the provided updates into the build state object.
 * This mutates the state object directly.
 *
 * @param state - The HooksState object to update
 * @param updates - Partial build state properties to merge
 *
 * @example
 * updateBuildState(state, { lastRun: new Date().toISOString(), passing: true });
 */
export function updateBuildState(
  state: HooksState,
  updates: Partial<HooksState['build']>
): void {
  state.build = { ...state.build, ...updates };
}

/**
 * Updates git-related state with partial data.
 *
 * Merges the provided updates into the git state object.
 * This mutates the state object directly.
 *
 * @param state - The HooksState object to update
 * @param updates - Partial git state properties to merge
 *
 * @example
 * updateGitState(state, { currentBranch: 'feature/new-feature', isRepo: true });
 */
export function updateGitState(
  state: HooksState,
  updates: Partial<HooksState['git']>
): void {
  state.git = { ...state.git, ...updates };
}

/**
 * Tracks an error by its signature for retry management.
 *
 * Records an error state keyed by a unique signature string. This allows
 * the system to track error occurrences and manage retry attempts.
 *
 * @param state - The HooksState object to update
 * @param signature - A unique identifier for the error (e.g., hash of error message)
 * @param errorState - The error state object containing retry count and details
 *
 * @example
 * trackError(state, 'build-failed-abc123', { count: 1, lastSeen: Date.now() });
 */
export function trackError(
  state: HooksState,
  signature: string,
  errorState: HooksState['errors'][string]
): void {
  state.errors[signature] = errorState;
}

/**
 * Removes a tracked error by its signature.
 *
 * Deletes the error state entry for the given signature, typically called
 * when an error has been resolved or retries have been exhausted.
 *
 * @param state - The HooksState object to update
 * @param signature - The unique identifier of the error to remove
 *
 * @example
 * clearError(state, 'build-failed-abc123');
 */
export function clearError(state: HooksState, signature: string): void {
  delete state.errors[signature];
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

/**
 * Initializes a new session with the given ID and clears session-specific data.
 *
 * Sets up the session state with a new ID and timestamp, and resets
 * the file tracking arrays for the new session.
 *
 * @param state - The HooksState object to initialize
 * @param sessionId - The unique identifier for the new session
 *
 * @example
 * initializeSession(state, 'session-2024-01-04-abc123');
 */
export function initializeSession(state: HooksState, sessionId: string): void {
  state.session.id = sessionId;
  state.session.startedAt = new Date().toISOString();
  state.files.modifiedThisSession = [];
  state.files.createdThisSession = [];
}

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
export function resetForNewSession(state: HooksState): HooksState {
  const newState = createDefaultState();
  // Preserve some state across sessions
  newState.git = state.git;
  newState.errors = state.errors;
  return newState;
}
