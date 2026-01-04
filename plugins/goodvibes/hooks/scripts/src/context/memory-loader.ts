/**
 * Memory Loader
 *
 * Loads persisted context from .goodvibes/memory/ directory.
 * This includes decisions, patterns, failures, and preferences.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ProjectMemory {
  decisions: Decision[];
  patterns: Pattern[];
  failures: Failure[];
  preferences: Preferences;
  customContext: string[];
}

export interface Decision {
  date: string;
  description: string;
  rationale?: string;
  tags?: string[];
}

export interface Pattern {
  name: string;
  description: string;
  examples?: string[];
}

export interface Failure {
  date: string;
  error: string;
  context?: string;
  resolution?: string;
}

export interface Preferences {
  codeStyle?: Record<string, string>;
  conventions?: string[];
  avoidPatterns?: string[];
  preferredLibraries?: Record<string, string>;
}

const MEMORY_DIR = '.goodvibes/memory';

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
  } catch {
    // Ignore parse errors
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
  } catch {
    // Ignore read errors
  }

  return results;
}

/**
 * Load all project memory
 */
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

/**
 * Format memory for display
 */
export function formatMemory(memory: ProjectMemory): string | null {
  const sections: string[] = [];

  // Recent decisions (last 3)
  if (memory.decisions.length > 0) {
    const recent = memory.decisions.slice(-3);
    const decisionLines = recent.map((d) => `- ${d.description}${d.rationale ? ` (${d.rationale})` : ''}`);
    sections.push(`**Recent Decisions:**\n${decisionLines.join('\n')}`);
  }

  // Active patterns
  if (memory.patterns.length > 0) {
    const patternLines = memory.patterns.slice(0, 5).map((p) => `- **${p.name}:** ${p.description}`);
    sections.push(`**Project Patterns:**\n${patternLines.join('\n')}`);
  }

  // Recent failures (last 2)
  if (memory.failures.length > 0) {
    const recent = memory.failures.slice(-2);
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
