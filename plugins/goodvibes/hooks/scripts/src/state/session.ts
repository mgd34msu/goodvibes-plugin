/**
 * Session management operations - initializing and resetting sessions.
 */

import { createDefaultState } from '../types/state.js';

import type { HooksState } from '../types/state.js';

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
export function initializeSession(
  state: HooksState,
  sessionId: string
): HooksState {
  return {
    ...state,
    session: {
      ...state.session,
      id: sessionId,
      startedAt: new Date().toISOString(),
    },
    files: {
      ...state.files,
      modifiedThisSession: [],
      createdThisSession: [],
    },
  };
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
  return {
    ...newState,
    git: { ...state.git },
    errors: { ...state.errors },
  };
}
