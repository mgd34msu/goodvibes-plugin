/**
 * Patterns memory module - stores project-specific code patterns.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { MemoryPattern } from '../types/memory.js';
import { debug } from '../shared/logging.js';
import { fileExistsAsync as fileExists } from '../shared/file-utils.js';

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

  if (!(await fileExists(filePath))) {
    return [];
  }

  const content = await fs.readFile(filePath, 'utf-8');
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
 * await writePattern('/path/to/project', {
 *   name: 'Repository Pattern',
 *   date: '2024-01-04',
 *   description: 'Use repository classes for data access abstraction',
 *   example: 'class UserRepository { async findById(id) { ... } }',
 *   files: ['src/repositories/user.ts']
 * });
 */
export async function writePattern(cwd: string, pattern: MemoryPattern): Promise<void> {
  const filePath = path.join(cwd, '.goodvibes', 'memory', 'patterns.md');

  // Ensure file exists with header
  if (!(await fileExists(filePath))) {
    const dir = path.dirname(filePath);
    if (!(await fileExists(dir))) {
      await fs.mkdir(dir, { recursive: true });
    }
    await fs.writeFile(filePath, PATTERNS_HEADER);
  }

  const entry = formatPattern(pattern);
  await fs.appendFile(filePath, entry);
}

function parsePatterns(content: string): MemoryPattern[] {
  const patterns: MemoryPattern[] = [];
  const blocks = content.split(/\n## /).slice(1);

  for (const block of blocks) {
    try {
      const lines = block.split('\n');
      const name = lines[0]?.trim() || '';

      let date = '';
      let description = '';
      let example = '';
      let files: string[] = [];

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
          } else if (!inCodeBlock && currentSection === 'example') {
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
        } else if (line.startsWith('**Description:**')) {
          currentSection = 'description';
        } else if (line.startsWith('**Example:**')) {
          currentSection = 'example';
        } else if (line.startsWith('**Files:**')) {
          currentSection = 'files';
        } else if (line.startsWith('- ') && currentSection === 'files') {
          files.push(line.replace('- ', '').trim());
        } else if (currentSection === 'description' && line.trim()) {
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
    } catch (error) {
      debug('Skipping malformed pattern entry', { error: String(error), block: block.substring(0, 100) });
      continue;
    }
  }

  return patterns;
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
