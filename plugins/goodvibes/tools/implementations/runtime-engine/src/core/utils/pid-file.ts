/**
 * PID file utilities — Layer 1 core utilities.
 *
 * Provides functions to write, remove, and check stale PID lock files.
 * These are pure utility functions with no class wrapping.
 */

import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createLogger } from '../../shared/logger.js';
import { toErrorMessage } from '../../shared/utils.js';

const logger = createLogger('pid-file');

/**
 * Returns a PID file path that is unique per project root.
 * Uses a short SHA-256 hash of the project root to avoid collisions
 * when multiple projects run the runtime-engine concurrently.
 *
 * @param projectRoot - Absolute path to the project root.
 * @returns Absolute path to the PID lock file.
 */
export function getPidFilePath(projectRoot: string): string {
  const hash = createHash('sha256').update(projectRoot).digest('hex').slice(0, 8);
  return join(tmpdir(), `goodvibes-runtime-engine-${hash}-${process.pid}.pid`);
}

/**
 * Returns true if a process with the given PID is currently running.
 *
 * Uses signal 0 (existence check) which does not kill the process.
 *
 * @param pid - The process ID to check.
 * @returns True if the process is alive, false otherwise.
 */
export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Write the current process PID to the lock file.
 * Silently ignores write errors to prevent blocking startup.
 *
 * @param projectRoot - Absolute path to the project root.
 */
export function writePidFile(projectRoot: string): void {
  const pidFilePath = getPidFilePath(projectRoot);
  try {
    writeFileSync(pidFilePath, String(process.pid), { encoding: 'utf-8', mode: 0o600 });
    logger.debug('PID file written', { path: pidFilePath, pid: process.pid });
  } catch (err) {
    logger.warn('Could not write PID file', {
      err: toErrorMessage(err),
    });
  }
}

/**
 * Remove the PID lock file.
 * Silently ignores ENOENT errors (file already removed).
 *
 * @param projectRoot - Absolute path to the project root.
 */
export function removePidFile(projectRoot: string): void {
  const pidFilePath = getPidFilePath(projectRoot);
  try {
    unlinkSync(pidFilePath);
    logger.debug('PID file removed', { path: pidFilePath });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn('Could not remove PID file', { err: toErrorMessage(err) });
    }
  }
}

/**
 * Check whether a stale PID file exists from a previous crash and, if so,
 * log a recovery notice. The stale file is removed to allow clean startup.
 *
 * @param projectRoot - Absolute path to the project root.
 */
export async function checkCrashRecovery(projectRoot: string): Promise<void> {
  const pidFilePath = getPidFilePath(projectRoot);
  if (!existsSync(pidFilePath)) return;

  try {
    const stalePid = readFileSync(pidFilePath, 'utf-8').trim();
    const currentPid = String(process.pid);

    if (stalePid !== currentPid) {
      const pid = Number(stalePid);
      if (Number.isNaN(pid) || pid <= 0 || !Number.isInteger(pid)) {
        logger.warn('Stale PID file contains invalid data — removing', {
          content: stalePid.slice(0, 20),
          pid_file: pidFilePath,
        });
        removePidFile(projectRoot);
        return;
      }

      const staleProcessAlive = isProcessRunning(pid);

      if (staleProcessAlive) {
        logger.warn('Stale PID file points to a running process — another instance may be active', {
          stale_pid: stalePid,
          pid_file: pidFilePath,
        });
      } else {
        logger.warn('Stale PID file detected — possible crash recovery', {
          stale_pid: stalePid,
        });
      }
      // Remove stale lock so writePidFile() starts fresh
      removePidFile(projectRoot);
    }
  } catch (err) {
    logger.warn('Could not read stale PID file', {
      err: toErrorMessage(err),
    });
  }
}
