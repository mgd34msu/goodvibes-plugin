/**
 * Memory Loader
 *
 * Loads persisted context from .goodvibes/memory/ directory.
 * This includes decisions, patterns, failures, and preferences.
 */

import * as fs from 'fs';
import * as path from 'path';
import { debug } from '../shared/logging.js';

/** Aggregated project memory including decisions, patterns, and preferences. */
export interface ProjectMemory {
  decisions: Decision[];
  patterns: Pattern[];
  failures: Failure[];
  preferences: Preferences;
  customContext: string[];
}

/** A recorded architectural or implementation decision. */
export interface Decision {
  date: string;
  description: string;
  rationale?: string;
  tags?: string[];
}

/** A code or design pattern used in the project. */
export interface Pattern {
  name: string;
  description: string;
  examples?: string[];
}

/** A recorded failure or error with optional resolution. */
export interface Failure {
  date: string;
  error: string;
  context?: string;
  resolution?: string;
}

/** Project-specific coding preferences and conventions. */
export interface Preferences {
  codeStyle?: Record<string, string>;
  conventions?: string[];
  avoidPatterns?: string[];
  preferredLibraries?: Record<string, string>;
}

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
function loadJsonFile<T>(cwd: string, filename: string): T | null {
  const filePath = path.join(cwd, MEMORY_DIR, filename);
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as T;
    }
  } catch (error) {

    debug('memory-loader failed', { error: String(error) });

  }
  return null;
}

/**
 * Load text files from a subdirectory
 */
function loadTextFiles(cwd: string, subdir: string): string[] {
  const dirPath = path.join(cwd, MEMORY_DIR, subdir);
  const results: string[] = [];

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
  } catch (error) {

    debug('memory-loader failed', { error: String(error) });

  }

  return results;
}

/** Load all project memory from the .goodvibes/memory directory. */
export async function loadMemory(cwd: string): Promise<ProjectMemory> {
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
  const decisions = loadJsonFile<Decision[]>(cwd, 'decisions.json') || [];
  const patterns = loadJsonFile<Pattern[]>(cwd, 'patterns.json') || [];
  const failures = loadJsonFile<Failure[]>(cwd, 'failures.json') || [];
  const preferences = loadJsonFile<Preferences>(cwd, 'preferences.json') || {};

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
export function formatMemory(memory: ProjectMemory): string | null {
  const sections: string[] = [];

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
      if (f.resolution) line += ` -> Resolved: ${f.resolution}`;
      return line;
    });
    sections.push(`**Recent Issues:**\n${failureLines.join('\n')}`);
  }

  // Preferences
  const prefLines: string[] = [];
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
    if (libs) prefLines.push(`- Preferred: ${libs}`);
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
