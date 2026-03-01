/**
 * Shared File I/O — Shared Layer
 *
 * Atomic file write and JSON serialization helpers.
 * Prevents data corruption by writing to a temp file then renaming.
 *
 * Lives in the shared layer so all layers (including L0 shared/config.ts)
 * can import without creating cross-layer violations.
 */

import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { ParseError } from './errors.js';
import { dirname, join } from 'node:path';

/**
 * Atomically write content to a file.
 * Writes to a temporary file in the same directory, then renames.
 * Creates parent directories as needed.
 */
export function writeAtomicSync(filePath: string, content: string): void {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tmpPath = join(dir, `.tmp_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  try {
    writeFileSync(tmpPath, content, 'utf-8');
    renameSync(tmpPath, filePath);
  } catch (err) {
    // Best-effort cleanup of temp file
    try { unlinkSync(tmpPath); } catch { /* ignore */ }
    throw err;
  }
}

/**
 * Atomically write a JSON-serializable value to a file.
 * Pretty-prints with 2-space indent + trailing newline.
 */
export function writeJsonSync(filePath: string, data: unknown): void {
  writeAtomicSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

/**
 * Read and parse a JSON file.
 * Returns null if the file does not exist (ENOENT).
 * Throws if the file exists but contains invalid JSON (SyntaxError).
 * Re-throws all other filesystem errors (e.g. EACCES).
 */
export function readJsonSync<T>(filePath: string): T | null {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch (err: unknown) {
    if (err instanceof SyntaxError) {
      throw new ParseError(`Corrupt JSON in ${filePath}: ${err.message}`, err);
    }
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}
