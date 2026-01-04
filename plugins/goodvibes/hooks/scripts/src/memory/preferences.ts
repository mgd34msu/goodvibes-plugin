/**
 * Preferences memory module - stores user preferences for the project.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { MemoryPreference } from '../types/memory.js';
import { debug } from '../shared/logging.js';

const PREFERENCES_HEADER = `# User Preferences

This file stores user preferences for this project.
These preferences guide agent behavior and decision-making.

---

`;

/** Reads all user preferences from the memory file. */
export function readPreferences(cwd: string): MemoryPreference[] {
  const filePath = path.join(cwd, '.goodvibes', 'memory', 'preferences.md');

  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  return parsePreferences(content);
}

/** Writes or updates a preference in the preferences memory file. */
export function writePreference(cwd: string, preference: MemoryPreference): void {
  const filePath = path.join(cwd, '.goodvibes', 'memory', 'preferences.md');

  // Ensure file exists with header
  if (!fs.existsSync(filePath)) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, PREFERENCES_HEADER);
  }

  const entry = formatPreference(preference);
  fs.appendFileSync(filePath, entry);
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
    } catch (error) {
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
