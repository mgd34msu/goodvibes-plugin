import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { IStore } from '../types.js';

/** Shape of data written to each JSON file on disk. */
interface FileEntry<T = unknown> {
  value: T;
  /** Absolute epoch-ms timestamp at which the entry expires, or null. */
  expiresAt: number | null;
}

/** Options for {@link FileStore}. */
export interface FileStoreOptions {
  /**
   * Directory where data files are stored. Will be created if it does not
   * already exist.
   */
  directory: string;

  /**
   * How often the store scans for and removes expired files, in milliseconds.
   * @default 300_000  (5 minutes)
   */
  flushIntervalMs?: number;

  /**
   * Optional logger for diagnostic messages. Defaults to a no-op so library
   * users are not surprised by unexpected console output.
   */
  logger?: { warn: (msg: string, meta?: Record<string, unknown>) => void };
}

/**
 * File-system backed persistent store.
 *
 * Each key is stored as an individual JSON file inside `directory`.
 * The filename is a sanitised version of the key (unsafe filesystem
 * characters are replaced with `_`).
 *
 * ### Atomicity
 * Writes use the write-to-temp-then-rename pattern:
 * 1. Data is written to a sibling `.tmp.<random>` file.
 * 2. `fs.rename()` atomically replaces the target file (POSIX guarantee).
 *
 * This means a reader will always see either the old complete value or the new
 * complete value — never a partially written file.
 *
 * ### Concurrency
 * A per-key mutex (implemented as a promise chain) serialises concurrent
 * writes to the same key. Each `update()` or `set()` chains onto the previous
 * operation for that key, preventing lost-update races when multiple callers
 * hold a reference to the same store instance.
 */
export class FileStore implements IStore {
  private readonly directory: string;
  /** Per-key mutex: the tail promise of the current write chain. */
  private readonly locks: Map<string, Promise<void>> = new Map();
  private readonly cleanupTimer: ReturnType<typeof setInterval>;
  private disposed = false;
  /** Promise that resolves once the directory has been created. */
  private readonly ready: Promise<void>;
  private readonly logger: { warn: (msg: string, meta?: Record<string, unknown>) => void };

  constructor(options: FileStoreOptions) {
    this.directory = options.directory;
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    this.logger = options.logger ?? { warn: () => {} };
    const intervalMs = options.flushIntervalMs ?? 300_000;

    this.ready = mkdir(this.directory, { recursive: true }).then(() => undefined);

    this.cleanupTimer = setInterval(() => void this.purgeExpired(), intervalMs);

    if (typeof this.cleanupTimer.unref === 'function') {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Returns the stored value for `key`, or `null` if absent or expired.
   */
  async get<T>(key: string): Promise<T | null> {
    if (this.disposed) throw new Error('Store is disposed');
    await this.ready;
    const filePath = this.keyToPath(key);

    let raw: string;
    try {
      raw = await readFile(filePath, 'utf8');
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') return null;
      throw err;
    }

    let entry: FileEntry<T>;
    try {
      entry = JSON.parse(raw) as FileEntry<T>;
    } catch {
      this.logger.warn('[FileStore] Malformed JSON; treating as missing.', { key });
      return null;
    }

    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      // Best-effort removal; ignore errors (file may already be gone).
      await unlink(filePath).catch(() => undefined);
      return null;
    }

    return entry.value;
  }

  /**
   * Persists `value` under `key` atomically.
   *
   * @param key   - Storage key.
   * @param value - JSON-serialisable value.
   * @param ttlMs - Time-to-live in milliseconds. Pass `0` or omit to disable expiry.
   */
  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    if (this.disposed) throw new Error('Store is disposed');
    if (ttlMs !== undefined && ttlMs < 0) throw new RangeError('ttlMs must be >= 0');
    const effectiveTtl = ttlMs === 0 ? undefined : ttlMs;
    await this.ready;
    await this.withLock(key, () => this.writeEntry(key, value, effectiveTtl));
  }

  /**
   * Removes the file for `key`. Resolves silently if the file does not exist.
   */
  async delete(key: string): Promise<void> {
    if (this.disposed) throw new Error('Store is disposed');
    await this.ready;
    const filePath = this.keyToPath(key);
    await unlink(filePath).catch((err: unknown) => {
      if (isNodeError(err) && err.code === 'ENOENT') return;
      throw err;
    });
  }

  /**
   * Atomically reads the current value, applies `updater`, and writes the
   * result back using the per-key mutex to prevent concurrent updates from
   * overwriting each other.
   *
   * @param key     - Storage key.
   * @param updater - Receives the current value (or `null`) and returns the
   *                  next value.
   * @param ttlMs   - TTL to apply to the updated entry. Pass `0` or omit to disable expiry.
   */
  async update<T>(
    key: string,
    updater: (current: T | null) => T,
    ttlMs?: number,
  ): Promise<void> {
    if (this.disposed) throw new Error('Store is disposed');
    if (ttlMs !== undefined && ttlMs < 0) throw new RangeError('ttlMs must be >= 0');
    const effectiveTtl = ttlMs === 0 ? undefined : ttlMs;
    await this.ready;
    await this.withLock(key, async () => {
      const current = await this.readEntry<T>(key);
      const next = updater(current);
      await this.writeEntry(key, next, effectiveTtl);
    });
  }

  /**
   * Waits for all pending writes to complete, stops the cleanup timer, and
   * releases resources. Subsequent calls resolve immediately.
   */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;

    clearInterval(this.cleanupTimer);

    // Drain all in-flight lock chains.
    const pending = [...this.locks.values()];
    await Promise.allSettled(pending);
    this.locks.clear();
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Acquires the per-key mutex and runs `fn` inside it.
   * The mutex is implemented as a promise chain: each new operation appends to
   * the tail of the chain, guaranteeing serial execution for a given key.
   */
  private withLock(key: string, fn: () => Promise<void>): Promise<void> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    // Chain this operation after the previous one, regardless of whether it
    // succeeded or failed. This prevents a failure from deadlocking the mutex.
    // Both then-handlers are `fn` so the operation runs whether the predecessor
    // resolved or rejected — the rejection case is intentional (fail-and-continue).
    const next = previous.then(fn, fn);
    this.locks.set(key, next);

    // Clean up the lock entry once this operation finishes so the Map does not
    // accumulate stale entries for keys that are no longer being updated.
    next.finally(() => {
      if (this.locks.get(key) === next) {
        this.locks.delete(key);
      }
    });

    return next;
  }

  /** Read and parse an entry from disk. Returns null if absent or expired. */
  private async readEntry<T>(key: string): Promise<T | null> {
    const filePath = this.keyToPath(key);
    let raw: string;
    try {
      raw = await readFile(filePath, 'utf8');
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') return null;
      throw err;
    }
    let entry: FileEntry<T>;
    try {
      entry = JSON.parse(raw) as FileEntry<T>;
    } catch {
      this.logger.warn('[FileStore] Malformed JSON; treating as missing.', { key });
      return null;
    }
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) return null;
    return entry.value;
  }

  /** Write `value` to disk atomically via a temp-file-then-rename. */
  private async writeEntry<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    const filePath = this.keyToPath(key);
    const tempPath = `${filePath}.tmp.${randomBytes(8).toString('hex')}`;

    const entry: FileEntry<T> = {
      value,
      expiresAt: ttlMs !== undefined ? Date.now() + ttlMs : null,
    };

    try {
      await writeFile(tempPath, JSON.stringify(entry), 'utf8');
      await rename(tempPath, filePath);
    } catch (err) {
      // Clean up the temp file if the rename failed.
      await rm(tempPath, { force: true }).catch(() => undefined);
      throw err;
    }
  }

  /** Walk the directory and delete any files whose TTL has elapsed. */
  private async purgeExpired(): Promise<void> {
    let names: string[];
    try {
      names = await readdir(this.directory);
    } catch {
      return; // Directory may not exist yet; nothing to purge.
    }

    const now = Date.now();
    await Promise.allSettled(
      names
        .filter((n) => !n.includes('.tmp.'))
        .map(async (name) => {
          const filePath = join(this.directory, name);
          let raw: string;
          try {
            raw = await readFile(filePath, 'utf8');
          } catch {
            return; // File may have been deleted between readdir and readFile.
          }
          try {
            const entry = JSON.parse(raw) as FileEntry;
            if (entry.expiresAt !== null && now > entry.expiresAt) {
              await unlink(filePath).catch(() => undefined);
            }
          } catch {
            // Malformed JSON — leave the file alone.
          }
        }),
    );
  }

  /**
   * Converts a logical key into a filesystem-safe filename.
   *
   * The key is hashed with SHA-256 to produce a collision-free, filesystem-safe
   * 64-character hex filename. This avoids collisions between keys that differ
   * only in characters that would map to the same replacement (e.g. `"a/b"` and
   * `"a:b"` both becoming `"a_b"`).
   */
  private keyToPath(key: string): string {
    const hash = createHash('sha256').update(key).digest('hex');
    return join(this.directory, `${hash}.json`);
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/** Type-guard for Node.js system errors that carry an `errno` / `code`. */
function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}
