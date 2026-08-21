/**
 * Overflow spill directory, kept per plan §7.5 (it saved the review's data more
 * than once), with age-based cleanup. When a payload is too large to return
 * inline, the full text is written to a spill file under `.goodvibes/overflow/`
 * (namespaced) and the caller receives a head/tail preview plus the path.
 *
 * Ported from v1 precision-engine `utils/overflow-handler.ts`; the spill dir now
 * resolves through `core/config` so it lands under the `.goodvibes/` state root.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { statePath } from '../config/index.js';

/** Result returned when output exceeds the inline threshold. */
export interface OverflowResult {
  status: 'overflow';
  /** First half of the output. */
  head: string;
  /** Last half of the output. */
  tail: string;
  /** Total character count of the original output. */
  total_chars: number;
  /** Total line count of the original output. */
  total_lines: number;
  /** Absolute path to the spill file holding the full output. */
  overflow_file: string;
  /** Human-readable hint for retrieving the full output. */
  hint: string;
}

/** Default spill directory (namespaced under `.goodvibes/`). */
export function overflowDir(): string {
  return statePath('overflow');
}

/**
 * Spill oversized output to a file and return a head/tail preview.
 * @param output - the full output that exceeded the threshold
 * @param id - a caller-supplied id used in the filename (sanitized)
 * @param threshold - the character threshold that was exceeded
 */
export async function handleOverflow(
  output: string,
  id: string,
  threshold: number,
): Promise<OverflowResult> {
  const dir = overflowDir();
  await fs.mkdir(dir, { recursive: true });

  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(dir, `${safeId}-${stamp}.log`);

  // Defense in depth: the resolved file must stay inside the spill directory.
  const resolvedFile = path.resolve(filePath);
  const resolvedDir = path.resolve(dir);
  if (!resolvedFile.startsWith(resolvedDir + path.sep)) {
    throw new Error(`Path traversal detected: ${filePath}`);
  }

  await fs.writeFile(filePath, output, 'utf-8');

  const half = Math.floor(threshold / 2);
  const head = output.slice(0, half);
  const tail = output.slice(-half);

  let totalLines = 0;
  if (output.length > 0) {
    totalLines = 1;
    for (let i = 0; i < output.length; i++) {
      if (output[i] === '\n') {totalLines++;}
    }
    if (output[output.length - 1] === '\n') {totalLines--;}
  }

  return {
    status: 'overflow',
    head,
    tail,
    total_chars: output.length,
    total_lines: totalLines,
    overflow_file: filePath,
    hint: `Full output saved to ${filePath}. Read it with code_read.`,
  };
}

/** Default maximum age for spill files (1 hour). */
const DEFAULT_OVERFLOW_MAX_AGE_MS = 3_600_000;

/**
 * Delete spill files older than `maxAgeMs`.
 * @param maxAgeMs - maximum age before cleanup (default 1 hour)
 * @returns number of files deleted
 */
export async function cleanupOverflowFiles(
  maxAgeMs: number = DEFAULT_OVERFLOW_MAX_AGE_MS,
): Promise<number> {
  const dir = overflowDir();
  let cleaned = 0;
  try {
    const entries = await fs.readdir(dir);
    const now = Date.now();
    for (const entry of entries) {
      const filePath = path.join(dir, entry);
      const resolved = path.resolve(filePath);
      if (!resolved.startsWith(path.resolve(dir) + path.sep)) {continue;}
      try {
        const stats = await fs.stat(filePath);
        if (now - stats.mtimeMs > maxAgeMs) {
          await fs.unlink(filePath);
          cleaned++;
        }
      } catch {
        // Skip files that cannot be stat'd or removed, non-critical.
      }
    }
  } catch {
    // Directory does not exist yet, nothing to clean.
  }
  return cleaned;
}
