/**
 * Preferences memory module - stores user preferences for the project.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { MemoryPreference } from '../types/memory.js';
import { debug } from '../shared/logging.js';
import { fileExistsAsync as fileExists } from '../shared/file-utils.js';

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
 *   console.log(`${pref.key}: ${pref.value}`);
 * }
 */
export async function readPreferences(cwd: string): Promise<MemoryPreference[]> {
  const filePath = path.join(cwd, '.goodvibes', 'memory', 'preferences.md');

  if (!(await fileExists(filePath))) {
    return [];
  }

  const content = await fs.readFile(filePath, 'utf-8');
  return parsePreferences(content);
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
export async function writePreference(cwd: string, preference: MemoryPreference): Promise<void> {
  const filePath = path.join(cwd, '.goodvibes', 'memory', 'preferences.md');

  // Ensure file exists with header
  if (!(await fileExists(filePath))) {
    const dir = path.dirname(filePath);
    if (!(await fileExists(dir))) {
      await fs.mkdir(dir, { recursive: true });
    }
    await fs.writeFile(filePath, PREFERENCES_HEADER);
  }

  const entry = formatPreference(preference);
  await fs.appendFile(filePath, entry);
}

function parsePreferences(content: string): MemoryPreference[] {
  const preferences: MemoryPreference[] = [];
  const blocks = content.split(/\n## /).slice(1);

  for (const block of blocks) {
    try {
      const lines = block.split('\n');
      const key = lines[0]?.trim() || '';

      let value = '';
      let date = '';
      let notes = '';

      let currentSection = '';

      for (const line of lines.slice(1)) {
        // Skip separator lines
        if (line.trim() === '---') {
          continue;
        }

        if (line.startsWith('**Value:**')) {
          value = line.replace('**Value:**', '').trim();
        } else if (line.startsWith('**Date:**')) {
          date = line.replace('**Date:**', '').trim();
        } else if (line.startsWith('**Notes:**')) {
          currentSection = 'notes';
        } else if (currentSection === 'notes' && line.trim()) {
          notes += line.trim() + ' ';
        }
      }

      if (key && value && date) {
        preferences.push({
          key,
          value,
          date,
          notes: notes.trim() || undefined,
        });
      }
    } catch (error: unknown) {
      debug('Skipping malformed preference entry', { error: String(error), block: block.substring(0, 100) });
      continue;
    }
  }

  return preferences;
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
