/**
 * File I/O — Core Layer
 *
 * Atomic file write and JSON serialization helpers.
 * Prevents data corruption by writing to a temp file then renaming.
 */

import { readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createLogger } from '../shared/logger.js';
import { ensureDirSync } from './fs-utils.js';

const logger = createLogger('core:file-io');

/**
 * Atomically write content to a file.
 * Writes to a temporary file in the same directory, then renames.
 * Creates parent directories as needed.
 */
export function writeAtomicSync(filePath: string, content: string): void {
  const dir = dirname(filePath);
  ensureDirSync(dir);
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
 * Returns null and logs a warning if the file exists but cannot be parsed.
 * Callers that need to distinguish these cases should check file existence separately.
 */
export function readJsonSync<T>(filePath: string): T | null {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return null;
    logger.warn('readJsonSync parse/read error', {
      path: filePath,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
