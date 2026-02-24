/**
 * State persistence operations - loading and saving state to disk.
 */
import type { HooksState } from '../types/state.js';
/**
 * Options for state loading and saving.
 */
export interface StateOptions {
    /**
     * If true, errors will be thrown instead of silently caught and logged.
     * Default: false (errors are caught and logged)
     */
    throwOnError?: boolean;
}
/**
 * Loads hook state from disk, returning defaults if not found.
 *
 * Reads the persisted hooks state from the .goodvibes/state directory.
 * If the file doesn't exist or is corrupted, returns a fresh default state.
 *
 * @param cwd - The current working directory (project root)
 * @param options - Optional configuration for error handling
 * @returns Promise resolving to the loaded HooksState or default state
 *
 * @example
 * const state = await loadState('/path/to/project');
 * // => { session: { id: 'session_123', ... }, files: {...}, git: {...}, ... }
 * // OR (if file doesn't exist)
 * // => { session: { id: '', ... }, files: {...}, git: {...}, ... } (default state)
 */
export declare function loadState(cwd: string, options?: StateOptions): Promise<HooksState>;
/**
 * Persists hook state to disk with atomic write.
 *
 * Saves the hooks state to disk using an atomic write pattern (write to temp file,
 * then rename) to prevent corruption from interrupted writes.
 *
 * @param cwd - The current working directory (project root)
 * @param state - The HooksState object to persist
 * @param options - Optional configuration for error handling
 * @returns Promise that resolves when the state is saved
 *
 * @example
 * await saveState('/path/to/project', state);
 * // => undefined (state saved to .goodvibes/state/hooks-state.json)
 */
export declare function saveState(cwd: string, state: HooksState, options?: StateOptions): Promise<void>;
