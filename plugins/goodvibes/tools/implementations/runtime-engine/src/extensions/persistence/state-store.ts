/**
 * JSON File State Store
 *
 * A file-system backed {@link StateStore} implementation that persists each
 * key as an individual JSON file inside a configurable state directory.
 *
 * Write safety: all writes are atomic -- the new content is first written to a
 * temporary `.tmp` file, then renamed (atomic on POSIX) over the target path.
 * This prevents a partial write from corrupting the stored state on crash.
 */

import {
  readFileSync,
  writeFileSync,
  unlinkSync,
  readdirSync,
} from 'node:fs';
import { join, isAbsolute, basename } from 'node:path';
import type { RuntimeConfig } from '../../shared/config.js';
import type { StateStore } from './types.js';
import { createLogger } from '../../shared/logger.js';
import { toErrorMessage } from '../../shared/utils.js';
import { ensureDirSync } from '../../core/utils/fs-utils.js';
import { writeJsonSync } from '../../core/state/file-io.js';

const logger = createLogger('state-store');

/**
 * A JSON-file-backed implementation of {@link StateStore}.
 *
 * Each key maps to a file `{stateDir}/{key}.json`. The state directory is
 * created automatically during {@link initialize}.
 *
 * Key names must not contain path separators; dots are allowed (e.g.
 * `"runtime.checkpoint"` maps to `runtime.checkpoint.json`).
 *
 * @example
 * const store = new JsonStateStore(config);
 * await store.initialize();
 * await store.set('session', { id: '123', started: Date.now() });
 * const session = await store.get<Session>('session');
 */
export class JsonStateStore implements StateStore {
  private readonly stateDir: string;
  private initialised = false;

  /**
   * @param config - Runtime configuration. The `persistence.state_dir` field
   *   specifies the base directory for state files (relative to projectRoot).
   * @param projectRoot - Absolute path to the project root. Used to resolve
   *   the state directory relative to the project rather than the process CWD.
   *   Defaults to `process.cwd()` when omitted.
   */
  constructor(config: RuntimeConfig, projectRoot: string = process.cwd()) {
    this.stateDir = isAbsolute(config.persistence.state_dir)
      ? config.persistence.state_dir
      : join(projectRoot, config.persistence.state_dir);
  }

  /**
   * {@inheritdoc StateStore.initialize}
   *
   * Creates the state directory (and any parent directories) if it does not
   * already exist. Safe to call multiple times; subsequent calls are no-ops.
   */
  async initialize(): Promise<void> {
    if (this.initialised) return;
    ensureDirSync(this.stateDir);
    this.initialised = true;
    logger.debug('State store initialised', { stateDir: this.stateDir });
  }

  /**
   * Ensures the state directory exists. Called before every I/O operation as
   * a defensive guard in case {@link initialize} was not called first.
   */
  private ensureDir(): void {
    ensureDirSync(this.stateDir);
  }

  /**
   * Resolves the canonical path for a given key.
   *
   * @param key - Storage key.
   * @returns Path to the corresponding `.json` file.
   */
  private keyPath(key: string): string {
    return join(this.stateDir, `${key}.json`);
  }

  /**
   * Resolves the advisory lock path for a given state file path.
   *
   * @param statePath - Path to the `.json` state file.
   * @returns Path to the corresponding `.lock` file.
   */
  private lockPath(statePath: string): string {
    return `${statePath}.lock`;
  }

  /**
   * Acquires an advisory lockfile for the given path.
   *
   * Uses `writeFileSync` with the exclusive-create (`wx`) flag so that only
   * one process can create the file at a time. Retries up to `maxAttempts`
   * times with `backoffMs` delay between attempts.
   *
   * @param lockFilePath - Path to the lockfile to create.
   * @param maxAttempts  - Maximum number of acquisition attempts (default 3).
   * @param backoffMs    - Delay in ms between attempts (default 50).
   * @throws {Error} If the lock cannot be acquired after all retries.
   */
  private async acquireLock(
    lockFilePath: string,
    maxAttempts = 3,
    backoffMs = 50,
  ): Promise<void> {
    const content = String(process.pid);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        writeFileSync(lockFilePath, content, { flag: 'wx' });
        return; // Lock acquired
      } catch (err) {
        const isLockHeld =
          err instanceof Error &&
          'code' in err &&
          (err as NodeJS.ErrnoException).code === 'EEXIST';
        if (!isLockHeld) {
          throw err; // Unexpected error — propagate immediately
        }
        if (attempt < maxAttempts) {
          logger.debug('Lock contention — retrying', {
            lockFilePath,
            attempt,
            backoffMs,
          });
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      }
    }
    throw new Error(
      `StateStore: could not acquire lock at "${lockFilePath}" after ${maxAttempts} attempts`,
    );
  }

  /**
   * Releases an advisory lockfile by deleting it.
   *
   * Silently ignores ENOENT (lock already gone). Any other error is swallowed
   * to ensure `finally` blocks never mask the original exception.
   *
   * @param lockFilePath - Path to the lockfile to delete.
   */
  private releaseLock(lockFilePath: string): void {
    try {
      unlinkSync(lockFilePath);
    } catch {
      // Swallow — lock already gone or unlink failed; do not mask caller error
    }
  }

  /**
   * {@inheritdoc StateStore.set}
   *
   * Writes atomically via {@link writeJsonSync} (tmp + rename).
   *
   * @throws {Error} If the write operation fails.
   */
  async set(key: string, state: unknown): Promise<void> {
    this.ensureDir();
    const dest = this.keyPath(key);
    try {
      writeJsonSync(dest, state);
      logger.debug('Saved state', { key });
    } catch (err) {
      const message = toErrorMessage(err);
      logger.error('Failed to save state', { key, error: message });
      throw new Error(`StateStore.set failed for key "${key}": ${message}`);
    }
  }

  /**
   * {@inheritdoc StateStore.get}
   *
   * Returns `null` (not an error) when the key does not exist. Throws on
   * unexpected I/O errors or JSON parse failures.
   *
   * @throws {Error} If a non-ENOENT I/O error or JSON parse failure occurs.
   */
  async get<T>(key: string): Promise<T | null> {
    const path = this.keyPath(key);
    try {
      const content = readFileSync(path, 'utf-8');
      return JSON.parse(content) as T;
    } catch (err) {
      if (
        err instanceof Error &&
        'code' in err &&
        (err as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        return null;
      }
      const message = toErrorMessage(err);
      logger.error('Failed to load state', { key, error: message });
      throw new Error(`StateStore.get failed for key "${key}": ${message}`);
    }
  }

  /**
   * {@inheritdoc StateStore.delete}
   *
   * Silently succeeds if the key does not exist (ENOENT is not an error).
   *
   * @throws {Error} If a non-ENOENT I/O error occurs.
   */
  async delete(key: string): Promise<void> {
    const path = this.keyPath(key);
    try {
      unlinkSync(path);
      logger.debug('Deleted state', { key });
    } catch (err) {
      if (
        err instanceof Error &&
        'code' in err &&
        (err as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        return; // Already gone -- not an error
      }
      const message = toErrorMessage(err);
      logger.error('Failed to delete state', { key, error: message });
      throw new Error(`StateStore.delete failed for key "${key}": ${message}`);
    }
  }

  /**
   * {@inheritdoc StateStore.keys}
   *
   * Lists all `.json` files in the state directory (excluding `.tmp` files)
   * and strips the `.json` extension to return the key names.
   *
   * @throws {Error} If the directory cannot be read.
   */
  async keys(): Promise<string[]> {
    this.ensureDir();
    try {
      const entries = readdirSync(this.stateDir);
      return entries
        .filter((f) => f.endsWith('.json') && !f.endsWith('.json.tmp'))
        .map((f) => basename(f, '.json'));
    } catch (err) {
      const message = toErrorMessage(err);
      logger.error('Failed to list state keys', { error: message });
      throw new Error(`StateStore.keys failed: ${message}`);
    }
  }

  /**
   * {@inheritdoc StateStore.update}
   *
   * Loads the current value, passes it to `updater`, then saves the result
   * atomically. An advisory lockfile (`{statePath}.lock`) is acquired before
   * the read-modify-write cycle and released in a `finally` block, guarding
   * against concurrent updates from multiple processes sharing the same state
   * directory. The lock is acquired exclusively via `writeFileSync` with the
   * `wx` flag; if another process holds the lock, up to 3 retries are made
   * with a 50 ms backoff before an error is thrown.
   *
   * Note: the write itself is separately atomic (tmp + rename); this lock
   * protects the full read-modify-write cycle.
   */
  async update<T>(key: string, updater: (current: T | null) => T): Promise<void> {
    const statePath = this.keyPath(key);
    const lockFilePath = this.lockPath(statePath);
    await this.acquireLock(lockFilePath);
    try {
      const current = await this.get<T>(key);
      const next = updater(current);
      await this.set(key, next);
    } finally {
      this.releaseLock(lockFilePath);
    }
  }
}
