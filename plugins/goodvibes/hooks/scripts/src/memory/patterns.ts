/**
 * Patterns memory module - stores project-specific code patterns.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { MemoryPattern } from '../types/memory.js';
import { debug } from '../shared/logging.js';

const PATTERNS_HEADER = `# Project-Specific Patterns

This file documents code patterns specific to this project.
These patterns help maintain consistency across the codebase.

---

`;

/** Reads all established patterns from the memory file. */
export function readPatterns(cwd: string): MemoryPattern[] {
  const filePath = path.join(cwd, '.goodvibes', 'memory', 'patterns.md');

  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  return parsePatterns(content);
}

/** Writes a new pattern to the patterns memory file. */
export function writePattern(cwd: string, pattern: MemoryPattern): void {
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
