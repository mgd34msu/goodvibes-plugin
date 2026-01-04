/**
 * State management for GoodVibes hooks.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { HooksState } from './types/state.js';
import { createDefaultState } from './types/state.js';
import { ensureGoodVibesDir } from './shared.js';
import { debug } from './shared/logging.js';

/** Relative path to the state file within .goodvibes directory. */
const STATE_FILE = 'state/hooks-state.json';

/** Loads hook state from disk, returning defaults if not found. */
export async function loadState(cwd: string): Promise<HooksState> {
  const goodvibesDir = path.join(cwd, '.goodvibes');
  const statePath = path.join(goodvibesDir, STATE_FILE);

  if (!fs.existsSync(statePath)) {
    return createDefaultState();
  }

  try {
    const content = fs.readFileSync(statePath, 'utf-8');
    const state = JSON.parse(content) as HooksState;
    return state;
  } catch (error) {
    debug('Failed to load state, using defaults', error);
    return createDefaultState();
  }
}

/** Persists hook state to disk with atomic write. */
export async function saveState(cwd: string, state: HooksState): Promise<void> {
  await ensureGoodVibesDir(cwd);
  const statePath = path.join(cwd, '.goodvibes', STATE_FILE);

  // Ensure state directory exists
  const stateDir = path.dirname(statePath);
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }

  try {
    // Atomic write: write to temp file, then rename
    const tempPath = statePath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2));
    fs.renameSync(tempPath, statePath);
  } catch (error) {
    debug('Failed to save state', error);
  }
}

/** Updates session-related state with partial data. */
export function updateSessionState(
  state: HooksState,
  updates: Partial<HooksState['session']>
): void {
  state.session = { ...state.session, ...updates };
}

/** Updates test-related state with partial data. */
export function updateTestState(
  state: HooksState,
  updates: Partial<HooksState['tests']>
): void {
  state.tests = { ...state.tests, ...updates };
}

/** Updates build-related state with partial data. */
export function updateBuildState(
  state: HooksState,
  updates: Partial<HooksState['build']>
): void {
  state.build = { ...state.build, ...updates };
}

/** Updates git-related state with partial data. */
export function updateGitState(
  state: HooksState,
  updates: Partial<HooksState['git']>
): void {
  state.git = { ...state.git, ...updates };
}

/** Tracks an error by its signature for retry management. */
export function trackError(
  state: HooksState,
  signature: string,
  errorState: HooksState['errors'][string]
): void {
  state.errors[signature] = errorState;
}

/** Removes a tracked error by its signature. */
export function clearError(state: HooksState, signature: string): void {
  delete state.errors[signature];
}

/** Retrieves error state by signature, if it exists. */
export function getErrorState(
  state: HooksState,
  signature: string
): HooksState['errors'][string] | undefined {
  return state.errors[signature];
}

/** Initializes a new session with the given ID and clears session-specific data. */
export function initializeSession(state: HooksState, sessionId: string): void {
  state.session.id = sessionId;
  state.session.startedAt = new Date().toISOString();
  state.files.modifiedThisSession = [];
  state.files.createdThisSession = [];
}

/** Resets state for a new session while preserving git and error history. */
export function resetForNewSession(state: HooksState): HooksState {
  const newState = createDefaultState();
  // Preserve some state across sessions
  newState.git = state.git;
  newState.errors = state.errors;
  return newState;
}
