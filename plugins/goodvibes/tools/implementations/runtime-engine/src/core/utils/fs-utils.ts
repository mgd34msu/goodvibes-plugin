/**
 * FS Utilities — Core Layer
 *
 * Minimal filesystem helpers shared across all layers.
 * Higher layers should import from core/index.ts.
 */

import { mkdirSync } from 'node:fs';

/**
 * Ensure a directory exists, creating it (and parents) if needed.
 * Equivalent to `mkdirSync(dirPath, { recursive: true })` but centralised.
 *
 * NOTE: `ipc/ipc-server.ts` uses `mode: 0o700` — do NOT migrate that call.
 */
export function ensureDirSync(dirPath: string): void {
  mkdirSync(dirPath, { recursive: true });
}
