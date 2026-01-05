/**
 * TODO scanning functionality
 *
 * NOTE: Some TODO scanning logic is duplicated from hooks/scripts/src/context/todo-scanner.ts
 * This is intentional - the MCP server and hooks are separate npm packages with different
 * compilation targets. A shared module would require significant restructuring.
 * If you fix bugs here, also fix them in todo-scanner.ts!
 */

import * as fs from 'fs';
import * as path from 'path';

import { TodoItem } from './types.js';
import {
  SCAN_EXTENSIONS,
  SKIP_DIRS,
  TEST_FILE_PATTERNS,
  TODO_PATTERN,
} from './constants.js';

/**
 * Check if a filename is a test file
 */
export function isTestFile(filename: string): boolean {
  return TEST_FILE_PATTERNS.some(pattern => pattern.test(filename));
}

/**
 * Determine TODO priority
 */
export function getPriority(type: string, text: string): 'high' | 'medium' | 'low' {
  const upperType = type.toUpperCase();
  const lowerText = text.toLowerCase();

  if (upperType === 'FIXME' || upperType === 'BUG') return 'high';
  if (lowerText.includes('urgent') || lowerText.includes('critical') || lowerText.includes('important')) {
    return 'high';
  }
  if (lowerText.includes('security') || lowerText.includes('vulnerability')) return 'high';

  if (upperType === 'NOTE') return 'low';
  if (lowerText.includes('maybe') || lowerText.includes('consider') || lowerText.includes('nice to have')) {
    return 'low';
  }

  return 'medium';
}

/**
 * Scan a file for TODOs
 */
export function scanFile(filePath: string, relativePath: string): TodoItem[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const items: TodoItem[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      TODO_PATTERN.lastIndex = 0;
      let match;

      while ((match = TODO_PATTERN.exec(line)) !== null) {
        const type = match[1].toUpperCase() as TodoItem['type'];
        const text = match[2].trim();

        if (text.length < 3) continue;

        items.push({
          type,
          text: text.slice(0, 100),
          file: relativePath,
          line: i + 1,
          priority: getPriority(type, text),
        });
      }
    }

    return items;
  } catch (err) {
    // Log but continue - file may be unreadable or deleted during scan
    console.error(`[issues] Failed to scan file ${filePath}:`, err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Recursively scan directory for TODOs
 */
export function scanDirectory(dir: string, baseDir: string, items: TodoItem[], maxFiles: number = 500): void {
  if (items.length >= maxFiles * 10) return;

  let filesScanned = 0;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (filesScanned >= maxFiles) break;

      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir, fullPath);

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          scanDirectory(fullPath, baseDir, items, maxFiles - filesScanned);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SCAN_EXTENSIONS.has(ext) && !isTestFile(entry.name)) {
          filesScanned++;
          const fileItems = scanFile(fullPath, relativePath);
          items.push(...fileItems);
        }
      }
    }
  } catch (err) {
    // Log but continue - directory may be inaccessible
    console.error(`[issues] Failed to read directory ${dir}:`, err instanceof Error ? err.message : err);
  }
}
