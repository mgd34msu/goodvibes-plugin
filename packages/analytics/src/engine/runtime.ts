/**
 * Engine runtime helpers shared across the ported analytics modules.
 *
 * Two concerns the v2 carve-out mandates for every server:
 *  - Atomic writes on every shared state file (temp file + rename, so a crash
 *    mid-write never leaves a half-written DB / JSON on disk). v1 wrote several
 *    of these files in place.
 *  - Debug output routed through `@goodvibes/core/logging` so it lands in the
 *    level-split log files (debug.log vs activity.log) and never pollutes the
 *    human logs or the stdout the MCP protocol owns.
 */

import { writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createLogger, type Logger } from '@goodvibes/core/logging';

/**
 * Write data to `filePath` atomically: write a uniquely-named temp file in the
 * same directory, then rename it over the target. Rename is atomic on the same
 * filesystem, so readers never observe a partial write.
 *
 * @param filePath - destination path (its directory must already exist)
 * @param data - bytes or UTF-8 string to write
 */
export function atomicWriteFileSync(filePath: string, data: Buffer | string): void {
  const tmp = `${filePath}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tmp, data);
  try {
    renameSync(tmp, filePath);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore cleanup failure */
    }
    throw err;
  }
}

/** Serialize `value` to pretty JSON and write it atomically. */
export function atomicWriteJson(filePath: string, value: unknown): void {
  atomicWriteFileSync(filePath, JSON.stringify(value, null, 2));
}

/**
 * The shared engine logger — level-routed and size-capped via `core/logging`.
 * `debug` goes to `debug.log` only (never interleaved into the human activity
 * log); `warn`/`error` go to `activity.log` and mirror to stderr (stdout stays
 * clean for the MCP protocol). Created lazily so the runtime cwd is honoured.
 */
let engineLoggerSingleton: Logger | null = null;
export function engineLogger(): Logger {
  return (engineLoggerSingleton ??= createLogger());
}
