/**
 * Generic memory file parser - consolidates duplicate parsing logic.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { debug } from '../shared/logging.js';
import { fileExists } from '../shared/file-utils.js';

/**
 * Configuration for parsing a memory file section.
 */
export interface SectionParser<T> {
  /**
   * The primary field name that appears as the section heading.
   * For decisions, this is "title"; for patterns, it's "name", etc.
   */
  primaryField: keyof T;

  /**
   * Map of field names to their parsing strategy.
   * - 'inline': Field value is on the same line after the marker (e.g., "**Date:** 2024-01-04")
   * - 'text': Multi-line text that accumulates until the next section
   * - 'list': Bulleted list items that start with "- "
   * - 'code': Code block that may span multiple lines (between ``` markers)
   */
  fields: {
    [K in keyof Partial<T>]: 'inline' | 'text' | 'list' | 'code';
  };

  /**
   * Optional validation function to check if a parsed entry is valid.
   * Return true if the entry should be included, false to skip it.
   */
  validate?: (entry: Partial<T>) => boolean;

  /**
   * Optional transformation function to convert the parsed object to the final type.
   * This allows for type coercion, default values, and field cleanup.
   */
  transform?: (entry: Partial<T>) => T;
}

/**
 * Generic memory file parser that reads and parses markdown-based memory files.
 *
 * This function consolidates the duplicate parsing logic found across all memory modules.
 * Each memory type (decisions, patterns, failures, preferences) follows the same structure:
 * - Sections separated by "## " headings
 * - Structured fields marked with "**FieldName:**"
 * - Support for inline values, multi-line text, lists, and code blocks
 *
 * @param filePath - Absolute path to the memory file
 * @param parser - Configuration object defining how to parse each field
 * @returns Promise resolving to array of parsed objects
 *
 * @example
 * // Parse decisions file
 * const decisions = await parseMemoryFile<MemoryDecision>(
 *   '/path/to/decisions.md',
 *   {
 *     primaryField: 'title',
 *     fields: {
 *       date: 'inline',
 *       agent: 'inline',
 *       alternatives: 'list',
 *       rationale: 'text',
 *       context: 'text'
 *     },
 *     validate: (entry) => !!(entry.title && entry.date && entry.rationale),
 *     transform: (entry) => ({
 *       title: entry.title!,
 *       date: entry.date!,
 *       alternatives: entry.alternatives || [],
 *       rationale: entry.rationale!,
 *       agent: entry.agent,
 *       context: entry.context
 *     })
 *   }
 * );
 */
export async function parseMemoryFile<T>(
  filePath: string,
  parser: SectionParser<T>
): Promise<T[]> {
  if (!(await fileExists(filePath))) {
    return [];
  }

  const content = await fs.readFile(filePath, 'utf-8');
  return parseMemoryContent(content, parser);
}

/**
 * Parses memory file content (useful for testing without file I/O).
 *
 * @param content - The markdown content to parse
 * @param parser - Configuration object defining how to parse each field
 * @returns Array of parsed objects
 */
export function parseMemoryContent<T>(
  content: string,
  parser: SectionParser<T>
): T[] {
  const results: T[] = [];
  const blocks = content.split(/\n## /).slice(1); // Skip header

  for (const block of blocks) {
    try {
      const entry = parseBlock<T>(block, parser);

      // Validate entry if validator provided
      const isValid = parser.validate ? parser.validate(entry) : true;

      if (isValid) {
        // Transform entry if transformer provided
        const finalEntry = parser.transform ? parser.transform(entry) : (entry as T);
        results.push(finalEntry);
      }
    } catch (error: unknown) {
      debug('Skipping malformed memory entry', {
        error: String(error),
        block: block.substring(0, 100),
      });
      continue;
    }
  }

  return results;
}

/**
 * Parses a single block (section) from the memory file.
 */
function parseBlock<T>(block: string, parser: SectionParser<T>): Partial<T> {
  const lines = block.split('\n');
  const entry: Partial<T> = {} as Partial<T>;

  // First line is the primary field (title, name, key, approach)
  const primaryValue = lines[0]?.trim() || '';
  entry[parser.primaryField] = primaryValue as T[keyof T];

  let currentSection: keyof T | null = null;
  let inCodeBlock = false;
  let codeContent = '';

  for (const line of lines.slice(1)) {
    // Skip separator lines (but not inside code blocks)
    if (!inCodeBlock && line.trim() === '---') {
      continue;
    }

    // Handle code block markers
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      if (currentSection && parser.fields[currentSection] === 'code') {
        codeContent += line + '\n';
      }
      if (!inCodeBlock && currentSection) {
        // End of code block - save the content
        entry[currentSection] = codeContent.trim() as T[keyof T];
        codeContent = '';
        currentSection = null;
      }
      continue;
    }

    // If we're inside a code block, accumulate content
    if (inCodeBlock && currentSection && parser.fields[currentSection] === 'code') {
      codeContent += line + '\n';
      continue;
    }

    // Check for field markers
    const fieldMatch = line.match(/^\*\*([^:]+):\*\*(.*)$/);
    if (fieldMatch) {
      const fieldName = fieldMatch[1].toLowerCase().trim();
      const fieldValue = fieldMatch[2].trim();

      // Find the matching field in the parser config
      const matchingField = Object.keys(parser.fields).find(
        (key) => key.toLowerCase() === fieldName
      ) as keyof T | undefined;

      if (matchingField) {
        const fieldType = parser.fields[matchingField];

        if (fieldType === 'inline') {
          // Inline field - value is on the same line
          entry[matchingField] = fieldValue as T[keyof T];
        } else {
          // Text, list, or code field - start accumulating
          currentSection = matchingField;

          if (fieldType === 'code') {
            codeContent = '';
          }
        }
      }
      continue;
    }

    // Process content based on current section
    if (currentSection) {
      const fieldType = parser.fields[currentSection];

      if (fieldType === 'list' && line.startsWith('- ')) {
        // List item
        const listValue = line.replace('- ', '').trim();
        const currentValue = entry[currentSection] as unknown;
        if (Array.isArray(currentValue)) {
          currentValue.push(listValue);
        } else {
          entry[currentSection] = [listValue] as T[keyof T];
        }
      } else if (fieldType === 'text' && line.trim()) {
        // Multi-line text
        const textValue = line.trim() + ' ';
        const currentValue = entry[currentSection] as unknown;
        if (typeof currentValue === 'string') {
          entry[currentSection] = (currentValue + textValue) as T[keyof T];
        } else {
          entry[currentSection] = textValue as T[keyof T];
        }
      }
    }
  }

  // Trim accumulated text fields
  for (const field of Object.keys(entry) as Array<keyof T>) {
    const value = entry[field];
    if (typeof value === 'string') {
      entry[field] = value.trim() as T[keyof T];
    }
  }

  return entry;
}

/**
 * Creates a memory file with a header if it doesn't exist.
 *
 * @param filePath - Absolute path to the memory file
 * @param header - Markdown header content to write
 */
export async function ensureMemoryFile(
  filePath: string,
  header: string
): Promise<void> {
  if (!(await fileExists(filePath))) {
    const dir = path.dirname(filePath);
    if (!(await fileExists(dir))) {
      await fs.mkdir(dir, { recursive: true });
    }
    await fs.writeFile(filePath, header);
  }
}

/**
 * Appends an entry to a memory file.
 *
 * @param filePath - Absolute path to the memory file
 * @param entry - Formatted markdown entry to append
 */
export async function appendMemoryEntry(
  filePath: string,
  entry: string
): Promise<void> {
  await fs.appendFile(filePath, entry);
}
