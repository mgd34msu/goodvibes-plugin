/**
 * Memory module - aggregates all memory subsystems.
 *
 * This module provides backward compatibility with the old memory.ts API
 * while delegating to the new modular implementation.
 */

import * as fs from 'fs';
import * as path from 'path';
import { debug, logError } from '../shared.js';
import type { ProjectMemory } from '../types/memory.js';
import { readDecisions, writeDecision } from './decisions.js';
import { readPatterns, writePattern } from './patterns.js';
import { readFailures, writeFailure } from './failures.js';
import { readPreferences, writePreference } from './preferences.js';
import { SECURITY_GITIGNORE_PATTERNS } from '../shared/security-patterns.js';

// Re-export all types from the individual modules
export * from './decisions.js';
export * from './patterns.js';
export * from './failures.js';
export * from './preferences.js';

// ============================================================================
// Type Aliases for Backward Compatibility
// ============================================================================

// The old API used these type names, map them to the new types
import type {
  MemoryDecision,
  MemoryPattern,
  MemoryFailure,
  MemoryPreference
} from '../types/memory.js';

export type Decision = MemoryDecision;
export type Pattern = MemoryPattern;
export type Failure = MemoryFailure;
export type Preference = MemoryPreference;

// Re-export ProjectMemory type
export type { ProjectMemory };

// Re-export SECURITY_GITIGNORE_PATTERNS for backward compatibility
export { SECURITY_GITIGNORE_PATTERNS };

// ============================================================================
// Constants
// ============================================================================

const GOODVIBES_DIR = '.goodvibes';
const MEMORY_DIR = 'memory';
const MEMORY_FILES = {
  decisions: 'decisions.md',
  patterns: 'patterns.md',
  failures: 'failures.md',
  preferences: 'preferences.md',
} as const;

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Get the path to the .goodvibes directory
 */
export function getGoodVibesDir(cwd: string): string {
  return path.join(cwd, GOODVIBES_DIR);
}

/**
 * Get the path to the memory directory
 */
export function getMemoryDir(cwd: string): string {
  return path.join(cwd, GOODVIBES_DIR, MEMORY_DIR);
}

/**
 * Get the path to a specific memory file
 */
export function getMemoryFilePath(
  cwd: string,
  type: keyof typeof MEMORY_FILES
): string {
  return path.join(getMemoryDir(cwd), MEMORY_FILES[type]);
}

// ============================================================================
// Directory Management (Lazy Creation)
// ============================================================================

/**
 * Ensure the .goodvibes directory exists (lazy creation)
 * Also ensures .gitignore has comprehensive security patterns
 */
export function ensureGoodVibesDir(cwd: string): void {
  const goodVibesDir = getGoodVibesDir(cwd);

  try {
    if (!fs.existsSync(goodVibesDir)) {
      fs.mkdirSync(goodVibesDir, { recursive: true });
      debug(`Created .goodvibes directory at ${goodVibesDir}`);
    }
  } catch (error) {
    logError('ensureGoodVibesDir:mkdir', error);
    throw new Error(`Failed to create .goodvibes directory: ${error}`);
  }

  // Ensure security-hardened .gitignore
  ensureSecurityGitignore(cwd);
}

/**
 * Ensure the memory directory exists (lazy creation)
 */
export function ensureMemoryDir(cwd: string): void {
  ensureGoodVibesDir(cwd);

  const memoryDir = getMemoryDir(cwd);
  try {
    if (!fs.existsSync(memoryDir)) {
      fs.mkdirSync(memoryDir, { recursive: true });
      debug(`Created memory directory at ${memoryDir}`);
    }
  } catch (error) {
    logError('ensureMemoryDir:mkdir', error);
    throw new Error(`Failed to create memory directory: ${error}`);
  }
}

/**
 * Ensure .gitignore has comprehensive security patterns
 * Only adds patterns not already present
 */
export function ensureSecurityGitignore(cwd: string): void {
  const gitignorePath = path.join(cwd, '.gitignore');

  try {
    let existingContent = '';
    if (fs.existsSync(gitignorePath)) {
      existingContent = fs.readFileSync(gitignorePath, 'utf-8');
    }

    // Parse security patterns into individual lines
    const securityLines = SECURITY_GITIGNORE_PATTERNS.split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));

    // Parse existing patterns
    const existingPatterns = new Set(
      existingContent
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
    );

    // Find patterns that need to be added
    const patternsToAdd = securityLines.filter(
      (pattern) => !existingPatterns.has(pattern)
    );

    if (patternsToAdd.length === 0) {
      debug('.gitignore already has all security patterns');
      return;
    }

    // Build only the missing patterns to append
    const separator = existingContent.endsWith('\n') ? '' : '\n';
    const newPatternsBlock = '\n# GoodVibes Security Patterns\n' + patternsToAdd.join('\n') + '\n';

    // Write the updated .gitignore
    fs.writeFileSync(gitignorePath, existingContent + separator + newPatternsBlock);

    debug(`Added ${patternsToAdd.length} security patterns to .gitignore`);
  } catch (error) {
    logError('ensureSecurityGitignore', error);
    // Don't throw - gitignore is non-critical
  }
}

// ============================================================================
// Backward Compatibility API - Delegates to New Modular Implementation
// ============================================================================

/**
 * Load all memory files from the .goodvibes/memory directory
 * This is the old API name, delegates to loadProjectMemory
 */
export function loadMemory(cwd: string): ProjectMemory {
  return loadProjectMemory(cwd);
}

/**
 * Loads all project memory (decisions, patterns, failures, preferences).
 */
export function loadProjectMemory(cwd: string): ProjectMemory {
  return {
    decisions: readDecisions(cwd),
    patterns: readPatterns(cwd),
    failures: readFailures(cwd),
    preferences: readPreferences(cwd),
  };
}

/**
 * Append a new architectural decision to the decisions file
 */
export function appendDecision(cwd: string, decision: Decision): void {
  try {
    ensureMemoryDir(cwd);
    writeDecision(cwd, decision);
    debug(`Appended decision: ${decision.title}`);
  } catch (error) {
    logError('appendDecision', error);
    throw error;
  }
}

/**
 * Append a new code pattern to the patterns file
 */
export function appendPattern(cwd: string, pattern: Pattern): void {
  try {
    ensureMemoryDir(cwd);
    writePattern(cwd, pattern);
    debug(`Appended pattern: ${pattern.name}`);
  } catch (error) {
    logError('appendPattern', error);
    throw error;
  }
}

/**
 * Append a failed approach to the failures file
 */
export function appendFailure(cwd: string, failure: Failure): void {
  try {
    ensureMemoryDir(cwd);
    writeFailure(cwd, failure);
    debug(`Appended failure: ${failure.approach}`);
  } catch (error) {
    logError('appendFailure', error);
    throw error;
  }
}

/**
 * Append a user preference to the preferences file
 */
export function appendPreference(cwd: string, preference: Preference): void {
  try {
    ensureMemoryDir(cwd);
    writePreference(cwd, preference);
    debug(`Appended preference: ${preference.key}`);
  } catch (error) {
    logError('appendPreference', error);
    throw error;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get current date in ISO format (YYYY-MM-DD)
 */
export function getCurrentDate(): string {
  return new Date().toISOString().split('T')[0] ?? '';
}

/**
 * Check if memory exists for a project
 */
export function hasMemory(cwd: string): boolean {
  return fs.existsSync(getMemoryDir(cwd));
}

/**
 * Get a summary of the project memory
 */
export function getMemorySummary(cwd: string): {
  hasMemory: boolean;
  decisionsCount: number;
  patternsCount: number;
  failuresCount: number;
  preferencesCount: number;
} {
  if (!hasMemory(cwd)) {
    return {
      hasMemory: false,
      decisionsCount: 0,
      patternsCount: 0,
      failuresCount: 0,
      preferencesCount: 0,
    };
  }

  const memory = loadMemory(cwd);
  return {
    hasMemory: true,
    decisionsCount: memory.decisions.length,
    patternsCount: memory.patterns.length,
    failuresCount: memory.failures.length,
    preferencesCount: memory.preferences.length,
  };
}

/**
 * Search memory for relevant entries based on keywords
 */
export function searchMemory(
  cwd: string,
  keywords: string[]
): {
  decisions: Decision[];
  patterns: Pattern[];
  failures: Failure[];
  preferences: Preference[];
} {
  const memory = loadMemory(cwd);
  const lowerKeywords = keywords.map((k) => k.toLowerCase());

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
        (p.files && p.files.some(matchesKeywords))
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

/** Formats project memory into a human-readable context string. */
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
      const desc = p.description.length > 60 ? p.description.substring(0, 60) + '...' : p.description;
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
