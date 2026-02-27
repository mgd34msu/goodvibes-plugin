/**
 * File-Based IPC Fallback
 *
 * Simple file-based IPC mechanism used when the Unix domain socket is
 * unavailable (e.g. the runtime engine has not started yet, or is not
 * running in the current environment).
 *
 * Protocol:
 * - Hook writes a request JSON file and polls for the response file.
 * - Runtime engine reads the request, processes it, and writes the response.
 * - A lock file prevents concurrent writes from corrupting the request.
 *
 * File layout (relative to state directory):
 *   ipc-request.json   — current pending request (written by hook)
 *   ipc-response.json  — current pending response (written by runtime)
 *   ipc.lock           — lock file for mutual exclusion
 */

import {
  writeFileSync,
  readFileSync,
  unlinkSync,
  existsSync,
} from 'fs';
import { join } from 'path';

import type { IPCMessage, IPCResponse } from './protocol.js';
import { createLogger } from '../shared/logger.js';
import { toErrorMessage } from '../shared/utils.js';
import { ensureDirSync } from '../core/fs-utils.js';
import { pollUntil } from '../core/poll.js';

const logger = createLogger('file-fallback');

/** Interval in ms between response-file polling cycles. */
const POLL_INTERVAL_MS = 20;

/** Number of retry attempts after the initial try (total attempts = LOCK_RETRIES + 1). */
const LOCK_RETRIES = 3;

/** Delay in ms between lock acquisition retries. */
const LOCK_RETRY_DELAY_MS = 10;

/**
 * File-based IPC fallback for environments where the Unix socket is
 * unavailable.
 *
 * Both the hook side (writer) and the runtime side (reader) share the same
 * state directory path, so they operate on the same files.
 *
 * @example
 * ```ts
 * // Hook side
 * const fb = new FileFallback('.goodvibes/state');
 * await fb.writeRequest(message);
 * const response = await fb.readResponse(500);
 *
 * // Runtime side
 * const fb = new FileFallback('.goodvibes/state');
 * const request = await fb.readRequest();
 * if (request) {
 *   await fb.writeResponse({ id: request.id, status: 'ok', data: { kind: 'ack' } });
 * }
 * ```
 */
export class FileFallback {
  /** Absolute path to the pending request file. */
  private readonly requestPath: string;

  /** Absolute path to the pending response file. */
  private readonly responsePath: string;

  /** Absolute path to the lock file. */
  private readonly lockPath: string;

  /**
   * @param stateDir - Absolute path to the state directory.
   *   Typically `{projectRoot}/.goodvibes/state`.
   */
  constructor(stateDir: string) {
    this.requestPath = join(stateDir, 'ipc-request.json');
    this.responsePath = join(stateDir, 'ipc-response.json');
    this.lockPath = join(stateDir, 'ipc.lock');
  }

  // ─── Hook side ───────────────────────────────────────────────────────────

  /**
   * Write an IPC request to disk (hook side).
   *
   * Creates the state directory if it does not exist. Acquires the lock file
   * before writing to prevent concurrent writes from corrupting the request.
   *
   * @param message - The IPC message to persist.
   */
  async writeRequest(message: IPCMessage): Promise<void> {
    this.ensureStateDir();
    await this.acquireLock();
    try {
      writeFileSync(this.requestPath, JSON.stringify(message, null, 2) + '\n', 'utf-8');
      logger.debug('IPC request written', { id: message.id, type: message.type });
    } finally {
      this.releaseLock();
    }
  }

  /**
   * Poll for a response file written by the runtime engine (hook side).
   *
   * Polls every {@link POLL_INTERVAL_MS} ms until a response file appears
   * or the timeout expires. Returns null if no response arrives in time.
   *
   * @param timeoutMs - Maximum ms to wait for the response.
   * @returns The parsed {@link IPCResponse}, or null on timeout.
   */
  async readResponse(timeoutMs: number): Promise<IPCResponse | null> {
    try {
      return await pollUntil<IPCResponse>(() => {
        if (!existsSync(this.responsePath)) return null;
        const raw = readFileSync(this.responsePath, 'utf-8');
        const response = JSON.parse(raw) as IPCResponse;
        logger.debug('IPC response received (file fallback)', { id: response.id });
        unlinkSync(this.responsePath);
        return response;
      }, { timeoutMs, intervalMs: POLL_INTERVAL_MS });
    } catch (err) {
      logger.warn('Failed to parse IPC response file', { err: toErrorMessage(err) });
      return null;
    }
  }

  // ─── Runtime side ────────────────────────────────────────────────────────

  /**
   * Read and consume the pending IPC request file (runtime side).
   *
   * Returns null if no request file exists. Removes the request file after
   * reading so the same request is not processed twice.
   *
   * @returns The parsed {@link IPCMessage}, or null if no request is pending.
   */
  async readRequest(): Promise<IPCMessage | null> {
    if (!existsSync(this.requestPath)) return null;

    await this.acquireLock();
    try {
      const raw = readFileSync(this.requestPath, 'utf-8');
      const message = JSON.parse(raw) as IPCMessage;

      // Remove after reading so the request is not processed twice
      unlinkSync(this.requestPath);

      logger.debug('IPC request read (file fallback)', { id: message.id, type: message.type });
      return message;
    } catch (err) {
      logger.warn('Failed to read IPC request file', {
        err: toErrorMessage(err),
      });
      return null;
    } finally {
      this.releaseLock();
    }
  }

  /**
   * Write an IPC response to disk (runtime side).
   *
   * @param response - The {@link IPCResponse} to persist.
   */
  async writeResponse(response: IPCResponse): Promise<void> {
    this.ensureStateDir();
    writeFileSync(this.responsePath, JSON.stringify(response, null, 2) + '\n', 'utf-8');
    logger.debug('IPC response written (file fallback)', { id: response.id });
  }

  // ─── Shared ───────────────────────────────────────────────────────────────

  /**
   * Remove all IPC-related files (request, response, lock) from disk.
   * Silently ignores missing files.
   */
  async cleanup(): Promise<void> {
    for (const filePath of [this.requestPath, this.responsePath, this.lockPath]) {
      try {
        if (existsSync(filePath)) {
          unlinkSync(filePath);
          logger.debug('IPC file cleaned up', { path: filePath });
        }
      } catch (err) {
        logger.warn('Could not remove IPC file', {
          path: filePath,
          err: toErrorMessage(err),
        });
      }
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /** Ensure the state directory exists. */
  private ensureStateDir(): void {
    ensureDirSync(join(this.requestPath, '..'));
  }

  /**
   * Acquire a lock file with retry on contention.
   *
   * Writes the current PID as the lock file content. This is a best-effort
   * advisory lock (not OS-level exclusive locking), sufficient for preventing
   * concurrent writes within the same machine.
   *
   * On EEXIST (another process holds the lock), retries up to
   * {@link LOCK_RETRIES} times with a {@link LOCK_RETRY_DELAY_MS} ms delay
   * between attempts. If all retries are exhausted, proceeds without the lock
   * (advisory semantics — non-fatal).
   */
  private async acquireLock(): Promise<void> {
    const delay = (ms: number): Promise<void> =>
      new Promise((resolve) => setTimeout(resolve, ms));

    for (let attempt = 0; attempt <= LOCK_RETRIES; attempt++) {
      try {
        // Use { flag: 'wx' } for exclusive creation — atomically fails with EEXIST
        // if the lock file already exists, preventing concurrent writes.
        writeFileSync(this.lockPath, String(process.pid), { encoding: 'utf-8', flag: 'wx' });
        return; // Lock acquired
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
          if (attempt < LOCK_RETRIES) {
            // Another process holds the lock — wait briefly before retrying
            await delay(LOCK_RETRY_DELAY_MS);
            continue;
          }
          // All retries exhausted — proceed without lock (advisory only)
          logger.debug('IPC lock contention after retries — proceeding without lock', {
            attempts: LOCK_RETRIES + 1,
          });
          return;
        }
        // Any other error is also non-fatal for an advisory lock
        logger.debug('acquireLock: unexpected error', { err: toErrorMessage(err) });
        return;
      }
    }
  }

  /** Release the advisory lock by removing the lock file. */
  private releaseLock(): void {
    try {
      if (existsSync(this.lockPath)) {
        unlinkSync(this.lockPath);
      }
    } catch {
      // Non-fatal
    }
  }
}
