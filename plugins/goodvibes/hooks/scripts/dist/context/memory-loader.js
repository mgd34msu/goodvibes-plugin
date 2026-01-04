/**
 * Memory Loader
 *
 * Loads persisted context from .goodvibes/memory/ directory.
 * This includes decisions, patterns, failures, and preferences.
 */
import * as fs from 'fs';
import * as path from 'path';
const MEMORY_DIR = '.goodvibes/memory';
/** Number of recent decisions to display. */
const RECENT_DECISIONS_LIMIT = 3;
/** Maximum patterns to display. */
const MAX_PATTERNS_DISPLAY = 5;
/** Number of recent failures to display. */
const RECENT_FAILURES_LIMIT = 2;
/**
 * Load a JSON file from the memory directory
 */
function loadJsonFile(cwd, filename) {
    const filePath = path.join(cwd, MEMORY_DIR, filename);
    try {
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(content);
        }
    }
    catch {
        // Ignore parse errors
    }
    return null;
}
/**
 * Load text files from a subdirectory
 */
function loadTextFiles(cwd, subdir) {
    const dirPath = path.join(cwd, MEMORY_DIR, subdir);
    const results = [];
    try {
        if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
            const files = fs.readdirSync(dirPath);
            for (const file of files) {
                if (file.endsWith('.md') || file.endsWith('.txt')) {
                    const filePath = path.join(dirPath, file);
                    const content = fs.readFileSync(filePath, 'utf-8').trim();
                    if (content) {
                        results.push(content);
                    }
                }
            }
        }
    }
    catch {
        // Ignore read errors
    }
    return results;
}
/** Load all project memory from the .goodvibes/memory directory. */
export async function loadMemory(cwd) {
    const memoryPath = path.join(cwd, MEMORY_DIR);
    // Check if memory directory exists
    if (!fs.existsSync(memoryPath)) {
        return {
            decisions: [],
            patterns: [],
            failures: [],
            preferences: {},
            customContext: [],
        };
    }
    // Load structured data
    const decisions = loadJsonFile(cwd, 'decisions.json') || [];
    const patterns = loadJsonFile(cwd, 'patterns.json') || [];
    const failures = loadJsonFile(cwd, 'failures.json') || [];
    const preferences = loadJsonFile(cwd, 'preferences.json') || {};
    // Load custom context files
    const customContext = loadTextFiles(cwd, 'context');
    return {
        decisions,
        patterns,
        failures,
        preferences,
        customContext,
    };
}
/** Format project memory for display in context output. */
export function formatMemory(memory) {
    const sections = [];
    // Recent decisions
    if (memory.decisions.length > 0) {
        const recent = memory.decisions.slice(-RECENT_DECISIONS_LIMIT);
        const decisionLines = recent.map((d) => `- ${d.description}${d.rationale ? ` (${d.rationale})` : ''}`);
        sections.push(`**Recent Decisions:**\n${decisionLines.join('\n')}`);
    }
    // Active patterns
    if (memory.patterns.length > 0) {
        const patternLines = memory.patterns.slice(0, MAX_PATTERNS_DISPLAY).map((p) => `- **${p.name}:** ${p.description}`);
        sections.push(`**Project Patterns:**\n${patternLines.join('\n')}`);
    }
    // Recent failures
    if (memory.failures.length > 0) {
        const recent = memory.failures.slice(-RECENT_FAILURES_LIMIT);
        const failureLines = recent.map((f) => {
            let line = `- ${f.error}`;
            if (f.resolution)
                line += ` -> Resolved: ${f.resolution}`;
            return line;
        });
        sections.push(`**Recent Issues:**\n${failureLines.join('\n')}`);
    }
    // Preferences
    const prefLines = [];
    if (memory.preferences.conventions && memory.preferences.conventions.length > 0) {
        prefLines.push(`- Conventions: ${memory.preferences.conventions.join(', ')}`);
    }
    if (memory.preferences.avoidPatterns && memory.preferences.avoidPatterns.length > 0) {
        prefLines.push(`- Avoid: ${memory.preferences.avoidPatterns.join(', ')}`);
    }
    if (memory.preferences.preferredLibraries) {
        const libs = Object.entries(memory.preferences.preferredLibraries)
            .map(([cat, lib]) => `${cat}: ${lib}`)
            .join(', ');
        if (libs)
            prefLines.push(`- Preferred: ${libs}`);
    }
    if (prefLines.length > 0) {
        sections.push(`**Preferences:**\n${prefLines.join('\n')}`);
    }
    // Custom context
    if (memory.customContext.length > 0) {
        sections.push(`**Custom Context:**\n${memory.customContext.join('\n\n')}`);
    }
    return sections.length > 0 ? sections.join('\n\n') : null;
}
