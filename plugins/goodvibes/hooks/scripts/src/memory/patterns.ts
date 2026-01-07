/**
 * Patterns memory module - stores project-specific code patterns.
 */

import * as path from 'path';

import {
  parseMemoryFile,
  ensureMemoryFile,
  appendMemoryEntry,
} from './parser.js';

import type { MemoryPattern } from '../types/memory.js';

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
 * @returns Promise resolving to array of MemoryPattern objects parsed from the file
 *
 * @example
 * const patterns = await readPatterns('/path/to/project');
 * for (const pattern of patterns) {
 *   console.log(`${pattern.name}: ${pattern.description}`);
 * }
 */
export async function readPatterns(cwd: string): Promise<MemoryPattern[]> {
  const filePath = path.join(cwd, '.goodvibes', 'memory', 'patterns.md');

  return parseMemoryFile<MemoryPattern>(filePath, {
    primaryField: 'name',
    fields: {
      date: 'inline',
      description: 'text',
      example: 'code',
      files: 'list',
    },
    validate: (entry) => !!(entry.name && entry.date && entry.description),
    transform: (entry) => ({
      name: entry.name!,
      date: entry.date!,
      description: entry.description!,
      example: entry.example,
      files: entry.files,
    }),
  });
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
 * await writePattern('/path/to/project', {
 *   name: 'Repository Pattern',
 *   date: '2024-01-04',
 *   description: 'Use repository classes for data access abstraction',
 *   example: 'class UserRepository { async findById(id) { ... } }',
 *   files: ['src/repositories/user.ts']
 * });
 */
export async function writePattern(
  cwd: string,
  pattern: MemoryPattern
): Promise<void> {
  const filePath = path.join(cwd, '.goodvibes', 'memory', 'patterns.md');

  await ensureMemoryFile(filePath, PATTERNS_HEADER);

  const entry = formatPattern(pattern);
  await appendMemoryEntry(filePath, entry);
}

function formatPattern(pattern: MemoryPattern): string {
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
