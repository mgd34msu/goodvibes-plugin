/**
 * Search and summary functions for project memory.
 */

import { readDecisions } from './decisions.js';
import { fileExists } from './directories.js';
import { readFailures } from './failures.js';
import { getMemoryDir } from './paths.js';
import { readPatterns } from './patterns.js';
import { readPreferences } from './preferences.js';

import type {
  MemoryDecision,
  MemoryPattern,
  MemoryFailure,
  MemoryPreference,
} from '../types/memory.js';
import type { ProjectMemory } from '../types/memory.js';

/**
 * Loads all project memory (decisions, patterns, failures, preferences).
 * Returns empty arrays for any memory types that don't have files yet.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to ProjectMemory with all memory types loaded
 *
 * @example
 * const memory = await loadProjectMemory('/path/to/project');
 * console.log(memory.decisions.length, 'decisions loaded');
 */
export async function loadProjectMemory(cwd: string): Promise<ProjectMemory> {
  const [decisions, patterns, failures, preferences] = await Promise.all([
    readDecisions(cwd),
    readPatterns(cwd),
    readFailures(cwd),
    readPreferences(cwd),
  ]);

  return { decisions, patterns, failures, preferences };
}

/**
 * Alias for loadProjectMemory for backward compatibility.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to ProjectMemory with all memory types loaded
 * @see {@link loadProjectMemory}
 */
export async function loadMemory(cwd: string): Promise<ProjectMemory> {
  return loadProjectMemory(cwd);
}

/**
 * Checks if memory exists for a project.
 * Determines whether the .goodvibes/memory directory exists.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to true if memory directory exists
 *
 * @example
 * if (await hasMemory(cwd)) {
 *   const memory = await loadMemory(cwd);
 * }
 */
export async function hasMemory(cwd: string): Promise<boolean> {
  return fileExists(getMemoryDir(cwd));
}

/**
 * Gets a summary of the project memory with counts for each type.
 * Useful for quick status checks without loading full memory content.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to memory summary with counts
 *
 * @example
 * const summary = await getMemorySummary(cwd);
 * console.log(`${summary.decisionsCount} decisions, ${summary.failuresCount} failures`);
 */
export async function getMemorySummary(cwd: string): Promise<{
  hasMemory: boolean;
  decisionsCount: number;
  patternsCount: number;
  failuresCount: number;
  preferencesCount: number;
}> {
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

/**
 * Searches memory for entries matching any of the provided keywords (case-insensitive).
 * Returns filtered subsets of each memory type containing only matching entries.
 *
 * @param cwd - The current working directory (project root)
 * @param keywords - Array of keywords to search for (case-insensitive)
 * @returns Promise resolving to filtered memory containing only matching entries
 *
 * @example
 * const results = await searchMemory(cwd, ['authentication', 'login']);
 * console.log(`Found ${results.decisions.length} related decisions`);
 */
export async function searchMemory(
  cwd: string,
  keywords: string[]
): Promise<{
  decisions: MemoryDecision[];
  patterns: MemoryPattern[];
  failures: MemoryFailure[];
  preferences: MemoryPreference[];
}> {
  const memory = await loadMemory(cwd);
  const lowerKeywords = keywords.map((keyword) => keyword.toLowerCase());

  const matchesKeywords = (text: string): boolean => {
    const lowerText = text.toLowerCase();
    return lowerKeywords.some((keyword) => lowerText.includes(keyword));
  };

  return {
    decisions: memory.decisions.filter(
      (d) =>
        matchesKeywords(d.title) ||
        matchesKeywords(d.rationale) ||
        (d.context && matchesKeywords(d.context)) ||
        (d.alternatives && d.alternatives.some(matchesKeywords))
    ),
    patterns: memory.patterns.filter(
      (p) =>
        matchesKeywords(p.name) ||
        matchesKeywords(p.description) ||
        (p.example && matchesKeywords(p.example)) ||
        p.files?.some(matchesKeywords)
    ),
    failures: memory.failures.filter(
      (f) =>
        matchesKeywords(f.approach) ||
        matchesKeywords(f.reason) ||
        (f.context && matchesKeywords(f.context)) ||
        (f.suggestion && matchesKeywords(f.suggestion))
    ),
    preferences: memory.preferences.filter(
      (p) =>
        matchesKeywords(p.key) ||
        matchesKeywords(p.value) ||
        (p.notes && matchesKeywords(p.notes))
    ),
  };
}

/**
 * Formats project memory into a human-readable context string.
 * Limits output to recent entries (5 decisions, 3 patterns, 3 failures).
 *
 * @param memory - The ProjectMemory object to format
 * @returns Formatted string suitable for context injection, or empty string if no memory
 *
 * @example
 * const memory = await loadMemory(cwd);
 * const contextStr = formatMemoryContext(memory);
 * // Returns: "Previous Decisions:\n- Decision 1 (rationale)..."
 */
export function formatMemoryContext(memory: ProjectMemory): string {
  const parts: string[] = [];

  if (memory.decisions.length > 0) {
    parts.push('Previous Decisions:');
    for (const d of memory.decisions.slice(-5)) {
      parts.push(`- ${d.title} (${d.rationale})`);
    }
  }

  if (memory.patterns.length > 0) {
    parts.push('\nEstablished Patterns:');
    for (const p of memory.patterns.slice(-3)) {
      const desc =
        p.description.length > 60
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

/**
 * Gets the current date in ISO format (YYYY-MM-DD).
 * Used for timestamping memory entries.
 *
 * @returns Current date string in YYYY-MM-DD format
 *
 * @example
 * const date = getCurrentDate();
 * // Returns: "2024-01-15"
 */
export function getCurrentDate(): string {
  return new Date().toISOString().split('T')[0] ?? '';
}
