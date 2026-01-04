/**
 * Patterns memory module - stores project-specific code patterns.
 */
import * as fs from 'fs';
import * as path from 'path';
import { ensureGoodVibesDir } from '../shared.js';
/** Reads all established patterns from the memory file. */
export function readPatterns(cwd) {
    const filePath = path.join(cwd, '.goodvibes', 'memory', 'patterns.md');
    if (!fs.existsSync(filePath)) {
        return [];
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return parsePatterns(content);
}
/** Writes a new pattern to the patterns memory file. */
export async function writePattern(cwd, pattern) {
    await ensureGoodVibesDir(cwd);
    const filePath = path.join(cwd, '.goodvibes', 'memory', 'patterns.md');
    let content = '';
    if (fs.existsSync(filePath)) {
        content = fs.readFileSync(filePath, 'utf-8');
    }
    else {
        content = '# Project Patterns\n\n';
    }
    // Check if category already exists
    const categoryHeader = `## ${pattern.category}`;
    if (content.includes(categoryHeader)) {
        // Append to existing category
        const parts = content.split(categoryHeader);
        const beforeCategory = parts[0];
        const afterCategory = parts[1];
        const nextSection = afterCategory.indexOf('\n## ');
        if (nextSection > -1) {
            const categoryContent = afterCategory.slice(0, nextSection);
            const rest = afterCategory.slice(nextSection);
            content = beforeCategory + categoryHeader + categoryContent + pattern.patterns.map(p => `- ${p}`).join('\n') + '\n' + rest;
        }
        else {
            content = beforeCategory + categoryHeader + afterCategory + pattern.patterns.map(p => `- ${p}`).join('\n') + '\n';
        }
    }
    else {
        // Add new category
        content += `## ${pattern.category}\n`;
        content += pattern.patterns.map(p => `- ${p}`).join('\n') + '\n\n';
    }
    fs.writeFileSync(filePath, content);
}
function parsePatterns(content) {
    const patterns = [];
    const sections = content.split(/^## /m).slice(1);
    for (const section of sections) {
        const lines = section.split('\n');
        const category = lines[0].trim();
        const patternLines = lines.slice(1)
            .filter(l => l.startsWith('- '))
            .map(l => l.slice(2).trim());
        if (category && patternLines.length > 0) {
            patterns.push({ category, patterns: patternLines });
        }
    }
    return patterns;
}
