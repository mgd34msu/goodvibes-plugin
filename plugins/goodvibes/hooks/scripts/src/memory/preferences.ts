/**
 * Preferences memory module - stores user preferences for the project.
 */

import * as path from 'path';

import {
  parseMemoryFile,
  ensureMemoryFile,
  appendMemoryEntry,
} from './parser.js';

import type { MemoryPreference } from '../types/memory.js';

const PREFERENCES_HEADER = `# User Preferences

This file stores user preferences for this project.
These preferences guide agent behavior and decision-making.

---

`;

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
 *   debug(`${pref.key}: ${pref.value}`);
 * }
 */
export async function readPreferences(
  cwd: string
): Promise<MemoryPreference[]> {
  const filePath = path.join(cwd, '.goodvibes', 'memory', 'preferences.md');

  return parseMemoryFile<MemoryPreference>(filePath, {
    primaryField: 'key',
    fields: {
      value: 'inline',
      date: 'inline',
      notes: 'text',
    },
    validate: (entry) => !!(entry.key && entry.value && entry.date),
    transform: (entry) => ({
      key: entry.key!,
      value: entry.value!,
      date: entry.date!,
      notes: entry.notes,
    }),
  });
}

/**
 * Writes or updates a preference in the preferences memory file.
 *
 * Creates the preferences.md file with a header if it doesn't exist,
 * then appends the preference in a structured markdown format. Note that
 * this appends rather than updates, so duplicate keys may exist.
 *
 * @param cwd - The current working directory (project root)
 * @param preference - The preference object to write
 *
 * @example
 * await writePreference('/path/to/project', {
 *   key: 'code-style',
 *   value: 'functional',
 *   date: '2024-01-04',
 *   notes: 'Prefer functional components over class components'
 * });
 */
export async function writePreference(
  cwd: string,
  preference: MemoryPreference
): Promise<void> {
  const filePath = path.join(cwd, '.goodvibes', 'memory', 'preferences.md');

  await ensureMemoryFile(filePath, PREFERENCES_HEADER);

  const entry = formatPreference(preference);
  await appendMemoryEntry(filePath, entry);
}

function formatPreference(preference: MemoryPreference): string {
  let md = `\n## ${preference.key}\n\n`;
  md += `**Value:** ${preference.value}\n`;
  md += `**Date:** ${preference.date}\n`;
  if (preference.notes) {
    md += '\n**Notes:**\n';
    md += `${preference.notes}\n`;
  }
  md += '\n---\n';
  return md;
}
