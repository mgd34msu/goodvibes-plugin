/**
 * Failures memory module - stores failed approaches to avoid repeating.
 */
import * as path from 'path';
import { parseMemoryFile, ensureMemoryFile, appendMemoryEntry, } from './parser.js';
const FAILURES_HEADER = `# Failed Approaches

This file records approaches that were tried and failed.
Reference this to avoid repeating unsuccessful strategies.

---

`;
/**
 * Reads all known failures from the memory file.
 *
 * Parses the failures.md file and returns an array of structured failure objects.
 * Returns an empty array if the file doesn't exist or is empty.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to array of MemoryFailure objects parsed from the file
 *
 * @example
 * const failures = await readFailures('/path/to/project');
 * for (const failure of failures) {
 *   console.log(`Avoid: ${failure.approach} - ${failure.reason}`);
 * }
 */
export async function readFailures(cwd) {
    const filePath = path.join(cwd, '.goodvibes', 'memory', 'failures.md');
    return parseMemoryFile(filePath, {
        primaryField: 'approach',
        fields: {
            date: 'inline',
            reason: 'text',
            context: 'text',
            suggestion: 'text',
        },
        validate: (entry) => !!(entry.approach && entry.date && entry.reason),
        transform: (entry) => ({
            approach: entry.approach,
            date: entry.date,
            reason: entry.reason,
            context: entry.context,
            suggestion: entry.suggestion,
        }),
    });
}
/**
 * Appends a new failure record to the failures memory file.
 *
 * Creates the failures.md file with a header if it doesn't exist,
 * then appends the failure in a structured markdown format. Used to
 * document approaches that didn't work to prevent repeating mistakes.
 *
 * @param cwd - The current working directory (project root)
 * @param failure - The failure object to write
 *
 * @example
 * await writeFailure('/path/to/project', {
 *   approach: 'Direct DOM manipulation in React',
 *   date: '2024-01-04',
 *   reason: 'Conflicts with React virtual DOM, causes bugs',
 *   context: 'Tried to optimize performance',
 *   suggestion: 'Use refs or state management instead'
 * });
 */
export async function writeFailure(cwd, failure) {
    const filePath = path.join(cwd, '.goodvibes', 'memory', 'failures.md');
    await ensureMemoryFile(filePath, FAILURES_HEADER);
    const entry = formatFailure(failure);
    await appendMemoryEntry(filePath, entry);
}
function formatFailure(failure) {
    let md = `\n## ${failure.approach}\n\n`;
    md += `**Date:** ${failure.date}\n`;
    md += '\n**Reason:**\n';
    md += `${failure.reason}\n`;
    if (failure.context) {
        md += '\n**Context:**\n';
        md += `${failure.context}\n`;
    }
    if (failure.suggestion) {
        md += '\n**Suggestion:**\n';
        md += `${failure.suggestion}\n`;
    }
    md += '\n---\n';
    return md;
}
