/**
 * Preferences memory module - stores user preferences for the project.
 */
import type { MemoryPreference } from '../types/memory.js';
/** Reads all user preferences from the memory file. */
export declare function readPreferences(cwd: string): MemoryPreference[];
/** Writes or updates a preference in the preferences memory file. */
export declare function writePreference(cwd: string, preference: MemoryPreference): Promise<void>;
