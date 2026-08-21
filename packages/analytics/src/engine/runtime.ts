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

import { writeFileSync, renameSync, unlinkSync, openSync, closeSync, statSync } from 'node:fs';
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

/** How long a lock file may sit untouched before its owner is presumed dead. */
const LOCK_TAKEOVER_MS = 15_000;
/** Poll interval while waiting for another process to release a lock. */
const LOCK_POLL_MS = 20;
/** How long to wait for a lock before breaking it. */
const LOCK_WAIT_MS = 10_000;

/** Block the thread; the callers here hold a lock and must not yield. */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Take an exclusive cross-process lock on `target`, as a sibling `.lock` file
 * created with `wx` (the create-if-absent-or-fail that makes this an actual
 * mutex between OS processes, not just between callers inside one process).
 *
 * The global analytics DB is one file shared by every concurrent Claude Code
 * session, and each session's MCP server holds its own in-memory copy. Without
 * this lock two sessions load, mutate and export independently, and whichever
 * writes last reverts the other's rows.
 *
 * A lock left behind by a process that died mid-write is taken over once it
 * goes stale, and a lock still held after `waitMs` is broken rather than
 * blocking a session forever. Both are safe because holders reload the file
 * immediately after acquiring, so a broken lock costs at most one lost write,
 * never a corrupt file.
 *
 * @param target - path of the file being protected (not the lock file itself)
 * @param waitMs - how long to wait before breaking an existing lock
 * @returns the lock file descriptor, to be passed to {@link releaseFileLock}
 */
export function acquireFileLock(target: string, waitMs: number = LOCK_WAIT_MS): number {
  const lockPath = `${target}.lock`;
  const deadline = Date.now() + waitMs;

  for (;;) {
    try {
      return openSync(lockPath, 'wx', 0o600);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {throw err;}

      let age: number;
      try {
        age = Date.now() - statSync(lockPath).mtimeMs;
      } catch {
        continue;
      }

      if (age > LOCK_TAKEOVER_MS || Date.now() > deadline) {
        try {
          unlinkSync(lockPath);
        } catch {
          /* another waiter broke it first */
        }
        continue;
      }

      sleepSync(LOCK_POLL_MS);
    }
  }
}

/** Release a lock taken with {@link acquireFileLock}. */
export function releaseFileLock(target: string, fd: number): void {
  try {
    closeSync(fd);
  } catch {
    /* already closed */
  }
  try {
    unlinkSync(`${target}.lock`);
  } catch {
    /* already broken by a waiter */
  }
}

/**
 * The shared engine logger, level-routed and size-capped via `core/logging`.
 * `debug` goes to `debug.log` only (never interleaved into the human activity
 * log); `warn`/`error` go to `activity.log` and mirror to stderr (stdout stays
 * clean for the MCP protocol). Created lazily so the runtime cwd is honoured.
 */
let engineLoggerSingleton: Logger | null = null;
export function engineLogger(): Logger {
  return (engineLoggerSingleton ??= createLogger());
}
