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
  renameSync,
  mkdirSync,
} from 'fs';
import { join, isAbsolute, basename } from 'path';
import type { RuntimeConfig } from '../shared/config.js';
import type { StateStore } from './types.js';
import { createLogger } from '../shared/logger.js';
import { toErrorMessage } from '../shared/utils.js';

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
    mkdirSync(this.stateDir, { recursive: true });
    this.initialised = true;
    logger.debug('State store initialised', { stateDir: this.stateDir });
  }

  /**
   * Ensures the state directory exists. Called before every I/O operation as
   * a defensive guard in case {@link initialize} was not called first.
   */
  private ensureDir(): void {
    mkdirSync(this.stateDir, { recursive: true });
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
   * Resolves the temporary staging path used during atomic writes.
   *
   * @param key - Storage key.
   * @returns Path to the `.tmp` file for this key.
   */
  private tmpPath(key: string): string {
    return join(this.stateDir, `${key}.json.tmp`);
  }

  /**
   * {@inheritdoc StateStore.set}
   *
   * Writes atomically: serialises to JSON, writes to a `.tmp` file, then
   * renames the `.tmp` file to the final path.
   *
   * @throws {Error} If the write or rename operation fails.
   */
  async set(key: string, state: unknown): Promise<void> {
    this.ensureDir();
    const content = JSON.stringify(state, null, 2) + '\n';
    const tmp = this.tmpPath(key);
    const dest = this.keyPath(key);
    try {
      writeFileSync(tmp, content, 'utf-8');
      renameSync(tmp, dest);
      logger.debug('Saved state', { key });
    } catch (err) {
      // Clean up the tmp file if it was written but rename failed
      try { unlinkSync(tmp); } catch { /* ignore cleanup errors */ }
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
   * atomically. The load and save are not transactional across processes, but
   * the write itself is atomic (tmp + rename).
   */
  async update<T>(key: string, updater: (current: T | null) => T): Promise<void> {
    const current = await this.get<T>(key);
    const next = updater(current);
    await this.set(key, next);
  }
}
