/**
 * Patterns memory module - stores project-specific code patterns.
 */
import * as fs from 'fs';
import * as path from 'path';
import { debug } from '../shared/logging.js';
const PATTERNS_HEADER = `# Project-Specific Patterns

This file documents code patterns specific to this project.
These patterns help maintain consistency across the codebase.

---

`;
/**
 * Reads all established patterns from the memory file.
 *
 * Parses the patterns.md file and returns an array of structured pattern objects.
 * Returns an empty array if the file doesn't exist or is empty.
 *
 * @param cwd - The current working directory (project root)
 * @returns Array of MemoryPattern objects parsed from the file
 *
 * @example
 * const patterns = readPatterns('/path/to/project');
 * for (const pattern of patterns) {
 *   console.log(`${pattern.name}: ${pattern.description}`);
 * }
 */
export function readPatterns(cwd) {
    const filePath = path.join(cwd, '.goodvibes', 'memory', 'patterns.md');
    if (!fs.existsSync(filePath)) {
        return [];
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return parsePatterns(content);
}
/**
 * Writes a new pattern to the patterns memory file.
 *
 * Creates the patterns.md file with a header if it doesn't exist,
 * then appends the pattern in a structured markdown format with optional
 * code examples and file references.
 *
 * @param cwd - The current working directory (project root)
 * @param pattern - The pattern object to write
 *
 * @example
 * writePattern('/path/to/project', {
 *   name: 'Repository Pattern',
 *   date: '2024-01-04',
 *   description: 'Use repository classes for data access abstraction',
 *   example: 'class UserRepository { async findById(id) { ... } }',
 *   files: ['src/repositories/user.ts']
 * });
 */
export function writePattern(cwd, pattern) {
    const filePath = path.join(cwd, '.goodvibes', 'memory', 'patterns.md');
    // Ensure file exists with header
    if (!fs.existsSync(filePath)) {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, PATTERNS_HEADER);
    }
    const entry = formatPattern(pattern);
    fs.appendFileSync(filePath, entry);
}
function parsePatterns(content) {
    const patterns = [];
    const blocks = content.split(/\n## /).slice(1);
    for (const block of blocks) {
        try {
            const lines = block.split('\n');
            const name = lines[0]?.trim() || '';
            let date = '';
            let description = '';
            let example = '';
            let files = [];
            let currentSection = '';
            let inCodeBlock = false;
            for (const line of lines.slice(1)) {
                // Skip separator lines (but only outside code blocks)
                if (!inCodeBlock && line.trim() === '---') {
                    continue;
                }
                if (line.startsWith('```')) {
                    inCodeBlock = !inCodeBlock;
                    if (inCodeBlock && currentSection === 'example') {
                        example += line + '\n';
                    }
                    else if (!inCodeBlock && currentSection === 'example') {
                        example += line + '\n';
                    }
                    continue;
                }
                if (inCodeBlock && currentSection === 'example') {
                    example += line + '\n';
                    continue;
                }
                if (line.startsWith('**Date:**')) {
                    date = line.replace('**Date:**', '').trim();
                }
                else if (line.startsWith('**Description:**')) {
                    currentSection = 'description';
                }
                else if (line.startsWith('**Example:**')) {
                    currentSection = 'example';
                }
                else if (line.startsWith('**Files:**')) {
                    currentSection = 'files';
                }
                else if (line.startsWith('- ') && currentSection === 'files') {
                    files.push(line.replace('- ', '').trim());
                }
                else if (currentSection === 'description' && line.trim()) {
                    description += line.trim() + ' ';
                }
            }
            if (name && date && description) {
                patterns.push({
                    name,
                    date,
                    description: description.trim(),
                    example: example.trim() || undefined,
                    files: files.length > 0 ? files : undefined,
                });
            }
        }
        catch (error) {
            debug('Skipping malformed pattern entry', { error: String(error), block: block.substring(0, 100) });
            continue;
        }
    }
    return patterns;
}
function formatPattern(pattern) {
    let md = `\n## ${pattern.name}\n\n`;
    md += `**Date:** ${pattern.date}\n`;
    md += '\n**Description:**\n';
    md += `${pattern.description}\n`;
    if (pattern.example) {
        md += '\n**Example:**\n';
        md += `${pattern.example}\n`;
    }
    if (pattern.files && pattern.files.length > 0) {
        md += '\n**Files:**\n';
        for (const file of pattern.files) {
            md += `- ${file}\n`;
        }
    }
    md += '\n---\n';
    return md;
}
