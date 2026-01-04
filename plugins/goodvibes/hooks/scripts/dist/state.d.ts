/**
 * State management for GoodVibes hooks.
 */
import type { HooksState } from './types/state.js';
/** Loads hook state from disk, returning defaults if not found. */
export declare function loadState(cwd: string): Promise<HooksState>;
/** Persists hook state to disk with atomic write. */
export declare function saveState(cwd: string, state: HooksState): Promise<void>;
/** Updates session-related state with partial data. */
export declare function updateSessionState(state: HooksState, updates: Partial<HooksState['session']>): void;
/** Updates test-related state with partial data. */
export declare function updateTestState(state: HooksState, updates: Partial<HooksState['tests']>): void;
/** Updates build-related state with partial data. */
export declare function updateBuildState(state: HooksState, updates: Partial<HooksState['build']>): void;
/** Updates git-related state with partial data. */
export declare function updateGitState(state: HooksState, updates: Partial<HooksState['git']>): void;
/** Tracks an error by its signature for retry management. */
export declare function trackError(state: HooksState, signature: string, errorState: HooksState['errors'][string]): void;
/** Removes a tracked error by its signature. */
export declare function clearError(state: HooksState, signature: string): void;
/** Retrieves error state by signature, if it exists. */
export declare function getErrorState(state: HooksState, signature: string): HooksState['errors'][string] | undefined;
/** Initializes a new session with the given ID and clears session-specific data. */
export declare function initializeSession(state: HooksState, sessionId: string): void;
/** Resets state for a new session while preserving git and error history. */
export declare function resetForNewSession(state: HooksState): HooksState;
