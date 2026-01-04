/**
 * Preferences memory module - stores user preferences for the project.
 */
import * as fs from 'fs';
import * as path from 'path';
import { ensureGoodVibesDir } from '../shared.js';
/** Reads all user preferences from the memory file. */
export function readPreferences(cwd) {
    const filePath = path.join(cwd, '.goodvibes', 'memory', 'preferences.md');
    if (!fs.existsSync(filePath)) {
        return [];
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return parsePreferences(content);
}
/** Writes or updates a preference in the preferences memory file. */
export async function writePreference(cwd, preference) {
    await ensureGoodVibesDir(cwd);
    const filePath = path.join(cwd, '.goodvibes', 'memory', 'preferences.md');
    let content = '';
    if (fs.existsSync(filePath)) {
        content = fs.readFileSync(filePath, 'utf-8');
    }
    else {
        content = '# User Preferences\n\n';
    }
    // Check if preference already exists and update it
    const prefRegex = new RegExp(`^- \\*\\*${preference.key}:\\*\\*.*$`, 'm');
    const newEntry = formatPreference(preference);
    if (prefRegex.test(content)) {
        content = content.replace(prefRegex, newEntry.trim());
    }
    else {
        content += newEntry;
    }
    fs.writeFileSync(filePath, content);
}
function parsePreferences(content) {
    const preferences = [];
    const lines = content.split('\n');
    for (const line of lines) {
        const match = line.match(/^- \*\*(.+):\*\*\s*(.+?)(?:\s*\((.+)\))?$/);
        if (match) {
            preferences.push({
                key: match[1],
                value: match[2].trim(),
                note: match[3]?.trim(),
            });
        }
    }
    return preferences;
}
function formatPreference(pref) {
    let entry = `- **${pref.key}:** ${pref.value}`;
    if (pref.note) {
        entry += ` (${pref.note})`;
    }
    entry += '\n';
    return entry;
}
