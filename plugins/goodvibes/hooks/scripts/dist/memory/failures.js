/**
 * Failures memory module - stores failed approaches to avoid repeating.
 */
import * as fs from 'fs';
import * as path from 'path';
import { ensureGoodVibesDir } from '../shared.js';
/** Reads all known failures from the memory file. */
export function readFailures(cwd) {
    const filePath = path.join(cwd, '.goodvibes', 'memory', 'failures.md');
    if (!fs.existsSync(filePath)) {
        return [];
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseFailures(content);
}
/** Appends a new failure record to the failures memory file. */
export async function writeFailure(cwd, failure) {
    await ensureGoodVibesDir(cwd);
    const filePath = path.join(cwd, '.goodvibes', 'memory', 'failures.md');
    let content = '';
    if (fs.existsSync(filePath)) {
        content = fs.readFileSync(filePath, 'utf-8');
    }
    else {
        content = '# Failed Approaches (Don\'t Repeat)\n\n';
    }
    const entry = formatFailure(failure);
    content += entry;
    fs.writeFileSync(filePath, content);
}
function parseFailures(content) {
    const failures = [];
    const sections = content.split(/^## /m).slice(1);
    for (const section of sections) {
        const lines = section.split('\n');
        const titleLine = lines[0];
        const dateMatch = titleLine.match(/^(\d{4}-\d{2}-\d{2}):\s*(.+)/);
        if (dateMatch) {
            const failure = {
                date: dateMatch[1],
                what: dateMatch[2],
                why_failed: '',
                solution: '',
            };
            for (const line of lines.slice(1)) {
                if (line.startsWith('**What:**')) {
                    failure.what = line.replace('**What:**', '').trim();
                }
                else if (line.startsWith('**Why it failed:**')) {
                    failure.why_failed = line.replace('**Why it failed:**', '').trim();
                }
                else if (line.startsWith('**Solution that worked:**')) {
                    failure.solution = line.replace('**Solution that worked:**', '').trim();
                }
                else if (line.startsWith('**Agent:**')) {
                    failure.agent = line.replace('**Agent:**', '').trim();
                }
            }
            failures.push(failure);
        }
    }
    return failures;
}
function formatFailure(failure) {
    let entry = `## ${failure.date}: ${failure.what}\n`;
    entry += `**What:** ${failure.what}\n`;
    entry += `**Why it failed:** ${failure.why_failed}\n`;
    entry += `**Solution that worked:** ${failure.solution}\n`;
    if (failure.agent) {
        entry += `**Agent:** ${failure.agent}\n`;
    }
    entry += '\n';
    return entry;
}
