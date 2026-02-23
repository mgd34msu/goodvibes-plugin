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
  mkdirSync,
} from 'fs';
import { join } from 'path';

import type { IPCMessage, IPCResponse } from './protocol.js';
import { createLogger } from '../shared/logger.js';

const logger = createLogger('file-fallback');

/** Interval in ms between response-file polling cycles. */
const POLL_INTERVAL_MS = 20;

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
    this.acquireLock();
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
    const deadline = Date.now() + timeoutMs;

    return new Promise<IPCResponse | null>((resolve) => {
      const poll = (): void => {
        if (existsSync(this.responsePath)) {
          try {
            const raw = readFileSync(this.responsePath, 'utf-8');
            const response = JSON.parse(raw) as IPCResponse;
            logger.debug('IPC response received (file fallback)', { id: response.id });
            unlinkSync(this.responsePath);
            resolve(response);
            return;
          } catch (err) {
            logger.warn('Failed to parse IPC response file', {
              err: err instanceof Error ? err.message : String(err),
            });
            resolve(null);
            return;
          }
        }

        if (Date.now() >= deadline) {
          logger.debug('IPC file-fallback read timed out', { timeout_ms: timeoutMs });
          resolve(null);
          return;
        }

        setTimeout(poll, POLL_INTERVAL_MS);
      };

      poll();
    });
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

    this.acquireLock();
    try {
      const raw = readFileSync(this.requestPath, 'utf-8');
      const message = JSON.parse(raw) as IPCMessage;

      // Remove after reading so the request is not processed twice
      unlinkSync(this.requestPath);

      logger.debug('IPC request read (file fallback)', { id: message.id, type: message.type });
      return message;
    } catch (err) {
      logger.warn('Failed to read IPC request file', {
        err: err instanceof Error ? err.message : String(err),
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
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /** Ensure the state directory exists. */
  private ensureStateDir(): void {
    const dir = join(this.requestPath, '..');
    mkdirSync(dir, { recursive: true });
  }

  /**
   * Acquire a lock file.
   *
   * Writes the current PID as the lock file content. This is a best-effort
   * advisory lock (not OS-level exclusive locking), sufficient for preventing
   * concurrent writes within the same machine.
   */
  private acquireLock(): void {
    try {
      // Use { flag: 'wx' } for exclusive creation — atomically fails with EEXIST
      // if the lock file already exists, preventing concurrent writes.
      writeFileSync(this.lockPath, String(process.pid), { encoding: 'utf-8', flag: 'wx' });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        // Another process holds the lock — proceed without it (advisory only)
        return;
      }
      // Any other error is also non-fatal for an advisory lock
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
