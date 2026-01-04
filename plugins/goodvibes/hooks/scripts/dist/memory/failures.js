/**
 * Failures memory module - stores failed approaches to avoid repeating.
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import { debug } from '../shared/logging.js';
const FAILURES_HEADER = `# Failed Approaches

This file records approaches that were tried and failed.
Reference this to avoid repeating unsuccessful strategies.

---

`;
/**
 * Checks if a file exists asynchronously.
 *
 * @param filePath - The path to check
 * @returns Promise resolving to true if file exists, false otherwise
 */
async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
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
    if (!(await fileExists(filePath))) {
        return [];
    }
    const content = await fs.readFile(filePath, 'utf-8');
    return parseFailures(content);
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
    // Ensure file exists with header
    if (!(await fileExists(filePath))) {
        const dir = path.dirname(filePath);
        if (!(await fileExists(dir))) {
            await fs.mkdir(dir, { recursive: true });
        }
        await fs.writeFile(filePath, FAILURES_HEADER);
    }
    const entry = formatFailure(failure);
    await fs.appendFile(filePath, entry);
}
function parseFailures(content) {
    const failures = [];
    const blocks = content.split(/\n## /).slice(1);
    for (const block of blocks) {
        try {
            const lines = block.split('\n');
            const approach = lines[0]?.trim() || '';
            let date = '';
            let reason = '';
            let context = '';
            let suggestion = '';
            let currentSection = '';
            for (const line of lines.slice(1)) {
                // Skip separator lines
                if (line.trim() === '---') {
                    continue;
                }
                if (line.startsWith('**Date:**')) {
                    date = line.replace('**Date:**', '').trim();
                }
                else if (line.startsWith('**Reason:**')) {
                    currentSection = 'reason';
                }
                else if (line.startsWith('**Context:**')) {
                    currentSection = 'context';
                }
                else if (line.startsWith('**Suggestion:**')) {
                    currentSection = 'suggestion';
                }
                else if (currentSection === 'reason' && line.trim()) {
                    reason += line.trim() + ' ';
                }
                else if (currentSection === 'context' && line.trim()) {
                    context += line.trim() + ' ';
                }
                else if (currentSection === 'suggestion' && line.trim()) {
                    suggestion += line.trim() + ' ';
                }
            }
            if (approach && date && reason) {
                failures.push({
                    approach,
                    date,
                    reason: reason.trim(),
                    context: context.trim() || undefined,
                    suggestion: suggestion.trim() || undefined,
                });
            }
        }
        catch (error) {
            debug('Skipping malformed failure entry', { error: String(error), block: block.substring(0, 100) });
            continue;
        }
    }
    return failures;
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
