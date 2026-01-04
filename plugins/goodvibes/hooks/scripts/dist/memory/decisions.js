/**
 * Decisions memory module - stores architectural decisions with rationale.
 */
import * as fs from 'fs';
import * as path from 'path';
import { debug } from '../shared/logging.js';
const DECISIONS_HEADER = `# Architectural Decisions

This file records architectural decisions made for this project.
Each decision includes the date, alternatives considered, rationale, and the agent that made it.

---

`;
/**
 * Reads all project decisions from the memory file.
 *
 * Parses the decisions.md file and returns an array of structured decision objects.
 * Returns an empty array if the file doesn't exist or is empty.
 *
 * @param cwd - The current working directory (project root)
 * @returns Array of MemoryDecision objects parsed from the file
 *
 * @example
 * const decisions = readDecisions('/path/to/project');
 * for (const decision of decisions) {
 *   console.log(`${decision.title}: ${decision.rationale}`);
 * }
 */
export function readDecisions(cwd) {
    const filePath = path.join(cwd, '.goodvibes', 'memory', 'decisions.md');
    if (!fs.existsSync(filePath)) {
        return [];
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseDecisions(content);
}
/**
 * Appends a new decision to the decisions memory file.
 *
 * Creates the decisions.md file with a header if it doesn't exist,
 * then appends the decision in a structured markdown format.
 *
 * @param cwd - The current working directory (project root)
 * @param decision - The decision object to write
 *
 * @example
 * writeDecision('/path/to/project', {
 *   title: 'Use tRPC for API',
 *   date: '2024-01-04',
 *   rationale: 'End-to-end type safety with minimal boilerplate',
 *   alternatives: ['REST', 'GraphQL']
 * });
 */
export function writeDecision(cwd, decision) {
    const filePath = path.join(cwd, '.goodvibes', 'memory', 'decisions.md');
    // Ensure file exists with header
    if (!fs.existsSync(filePath)) {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, DECISIONS_HEADER);
    }
    const entry = formatDecision(decision);
    fs.appendFileSync(filePath, entry);
}
function parseDecisions(content) {
    const decisions = [];
    const blocks = content.split(/\n## /).slice(1);
    for (const block of blocks) {
        try {
            const lines = block.split('\n');
            const title = lines[0]?.trim() || '';
            let date = '';
            let alternatives = [];
            let rationale = '';
            let agent = '';
            let context = '';
            let currentSection = '';
            for (const line of lines.slice(1)) {
                // Skip separator lines
                if (line.trim() === '---') {
                    continue;
                }
                if (line.startsWith('**Date:**')) {
                    date = line.replace('**Date:**', '').trim();
                }
                else if (line.startsWith('**Agent:**')) {
                    agent = line.replace('**Agent:**', '').trim();
                }
                else if (line.startsWith('**Alternatives:**')) {
                    currentSection = 'alternatives';
                }
                else if (line.startsWith('**Rationale:**')) {
                    currentSection = 'rationale';
                }
                else if (line.startsWith('**Context:**')) {
                    currentSection = 'context';
                }
                else if (line.startsWith('- ') && currentSection === 'alternatives') {
                    alternatives.push(line.replace('- ', '').trim());
                }
                else if (currentSection === 'rationale' && line.trim()) {
                    rationale += line.trim() + ' ';
                }
                else if (currentSection === 'context' && line.trim()) {
                    context += line.trim() + ' ';
                }
            }
            if (title && date && rationale) {
                decisions.push({
                    title,
                    date,
                    alternatives,
                    rationale: rationale.trim(),
                    agent: agent || undefined,
                    context: context.trim() || undefined,
                });
            }
        }
        catch (error) {
            debug('Skipping malformed decision entry', { error: String(error), block: block.substring(0, 100) });
            continue;
        }
    }
    return decisions;
}
function formatDecision(decision) {
    let md = `\n## ${decision.title}\n\n`;
    md += `**Date:** ${decision.date}\n`;
    if (decision.agent) {
        md += `**Agent:** ${decision.agent}\n`;
    }
    md += '\n**Alternatives:**\n';
    for (const alt of decision.alternatives) {
        md += `- ${alt}\n`;
    }
    md += '\n**Rationale:**\n';
    md += `${decision.rationale}\n`;
    if (decision.context) {
        md += '\n**Context:**\n';
        md += `${decision.context}\n`;
    }
    md += '\n---\n';
    return md;
}
