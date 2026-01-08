/**
 * Search and summary functions for project memory.
 */
import { readDecisions } from './decisions.js';
import { fileExists } from './directories.js';
import { readFailures } from './failures.js';
import { getMemoryDir } from './paths.js';
import { readPatterns } from './patterns.js';
import { readPreferences } from './preferences.js';
/**
 * Loads all project memory (decisions, patterns, failures, preferences).
 * Returns empty arrays for any memory types that don't have files yet.
 */
export async function loadProjectMemory(cwd) {
    const [decisions, patterns, failures, preferences] = await Promise.all([
        readDecisions(cwd),
        readPatterns(cwd),
        readFailures(cwd),
        readPreferences(cwd),
    ]);
    return { decisions, patterns, failures, preferences };
}
/** Alias for loadProjectMemory for backward compatibility. */
export async function loadMemory(cwd) {
    return loadProjectMemory(cwd);
}
/** Check if memory exists for a project. */
export async function hasMemory(cwd) {
    return fileExists(getMemoryDir(cwd));
}
/** Get a summary of the project memory with counts for each type. */
export async function getMemorySummary(cwd) {
    if (!(await hasMemory(cwd))) {
        return {
            hasMemory: false,
            decisionsCount: 0,
            patternsCount: 0,
            failuresCount: 0,
            preferencesCount: 0,
        };
    }
    const memory = await loadMemory(cwd);
    return {
        hasMemory: true,
        decisionsCount: memory.decisions.length,
        patternsCount: memory.patterns.length,
        failuresCount: memory.failures.length,
        preferencesCount: memory.preferences.length,
    };
}
/** Search memory for entries matching any of the provided keywords (case-insensitive). */
export async function searchMemory(cwd, keywords) {
    const memory = await loadMemory(cwd);
    const lowerKeywords = keywords.map((keyword) => keyword.toLowerCase());
    const matchesKeywords = (text) => {
        const lowerText = text.toLowerCase();
        return lowerKeywords.some((keyword) => lowerText.includes(keyword));
    };
    return {
        decisions: memory.decisions.filter((d) => matchesKeywords(d.title) ||
            matchesKeywords(d.rationale) ||
            (d.context && matchesKeywords(d.context)) ||
            (d.alternatives && d.alternatives.some(matchesKeywords))),
        patterns: memory.patterns.filter((p) => matchesKeywords(p.name) ||
            matchesKeywords(p.description) ||
            (p.example && matchesKeywords(p.example)) ||
            p.files?.some(matchesKeywords)),
        failures: memory.failures.filter((f) => matchesKeywords(f.approach) ||
            matchesKeywords(f.reason) ||
            (f.context && matchesKeywords(f.context)) ||
            (f.suggestion && matchesKeywords(f.suggestion))),
        preferences: memory.preferences.filter((p) => matchesKeywords(p.key) ||
            matchesKeywords(p.value) ||
            (p.notes && matchesKeywords(p.notes))),
    };
}
/**
 * Formats project memory into a human-readable context string.
 * Limits output to recent entries (5 decisions, 3 patterns, 3 failures).
 */
export function formatMemoryContext(memory) {
    const parts = [];
    if (memory.decisions.length > 0) {
        parts.push('Previous Decisions:');
        for (const d of memory.decisions.slice(-5)) {
            parts.push(`- ${d.title} (${d.rationale})`);
        }
    }
    if (memory.patterns.length > 0) {
        parts.push('\nEstablished Patterns:');
        for (const p of memory.patterns.slice(-3)) {
            const desc = p.description.length > 60
                ? p.description.substring(0, 60) + '...'
                : p.description;
            parts.push(`- ${p.name}: ${desc}`);
        }
    }
    if (memory.failures.length > 0) {
        parts.push('\nKnown Failures (avoid):');
        for (const f of memory.failures.slice(-3)) {
            parts.push(`- ${f.approach}: ${f.reason}`);
        }
    }
    return parts.join('\n');
}
/** Get current date in ISO format (YYYY-MM-DD). */
export function getCurrentDate() {
    return new Date().toISOString().split('T')[0] ?? '';
}
