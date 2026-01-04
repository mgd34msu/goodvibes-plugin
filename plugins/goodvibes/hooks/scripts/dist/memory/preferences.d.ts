/**
 * Preferences memory module - stores user preferences for the project.
 */
import type { MemoryPreference } from '../types/memory.js';
/**
 * Reads all user preferences from the memory file.
 *
 * Parses the preferences.md file and returns an array of structured preference objects.
 * Returns an empty array if the file doesn't exist or is empty.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to array of MemoryPreference objects parsed from the file
 *
 * @example
 * const preferences = await readPreferences('/path/to/project');
 * for (const pref of preferences) {
 *   console.log(`${pref.key}: ${pref.value}`);
 * }
 */
export declare function readPreferences(cwd: string): Promise<MemoryPreference[]>;
/**
 * Writes or updates a preference in the preferences memory file.
 *
 * Creates the preferences.md file with a header if it doesn't exist,
 * then appends the preference in a structured markdown format. Note that
 * this appends rather than updates, so duplicate keys may exist.
 *
 * @param cwd - The current working directory (project root)
 * @param preference - The preference object to write
 * @returns Promise that resolves when the preference is written
 *
 * @example
 * await writePreference('/path/to/project', {
 *   key: 'code-style',
 *   value: 'functional',
 *   date: '2024-01-04',
 *   notes: 'Prefer functional components over class components'
 * });
 */
export declare function writePreference(cwd: string, preference: MemoryPreference): Promise<void>;
