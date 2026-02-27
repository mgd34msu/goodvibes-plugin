import type { IStore } from '../types.js';

/** Internal representation of a stored entry. */
interface Entry {
  value: unknown;
  /** Absolute epoch-ms timestamp at which this entry expires, or null for no expiry. */
  expiresAt: number | null;
}

/** Options for {@link MemoryStore}. */
export interface MemoryStoreOptions {
  /**
   * How often the store scans for and removes expired entries, in milliseconds.
   * @default 60_000
   */
  cleanupIntervalMs?: number;
}

/**
 * In-memory store backed by a `Map`.
 *
 * - Entries expire after the `ttlMs` supplied to `set()` / `update()`.
 * - A background interval periodically purges expired entries so memory does
 *   not grow unboundedly. The timer is `unref`'d and will therefore not
 *   prevent the Node.js process from exiting.
 * - `update()` is implemented as a synchronous read-modify-write. Because
 *   Node.js runs JavaScript on a single thread and `update()` performs no
 *   asynchronous I/O, it is inherently atomic — no two concurrent callers can
 *   interleave their reads and writes.
 */
export class MemoryStore implements IStore {
  private readonly store: Map<string, Entry> = new Map();
  private readonly cleanupTimer: ReturnType<typeof setInterval>;
  private disposed = false;

  constructor(options: MemoryStoreOptions = {}) {
    const intervalMs = options.cleanupIntervalMs ?? 60_000;

    this.cleanupTimer = setInterval(() => this.purgeExpired(), intervalMs);

    // Do not keep the event loop alive solely because of this timer.
    if (typeof this.cleanupTimer.unref === 'function') {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Returns the stored value for `key`, or `null` if it is missing or expired.
   */
  async get<T>(key: string): Promise<T | null> {
    if (this.disposed) throw new Error('Store is disposed');
    const entry = this.store.get(key);
    if (entry === undefined) return null;

    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value as T;
  }

  /**
   * Stores `value` under `key` with an optional TTL.
   *
   * @param key   - Storage key.
   * @param value - Serialisable value.
   * @param ttlMs - Time-to-live in milliseconds. Pass `0` or omit to disable expiry.
   */
  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    if (this.disposed) throw new Error('Store is disposed');
    if (ttlMs !== undefined && ttlMs < 0) throw new RangeError('ttlMs must be >= 0');
    const effectiveTtl = ttlMs === 0 ? undefined : ttlMs;
    const expiresAt = effectiveTtl !== undefined ? Date.now() + effectiveTtl : null;
    this.store.set(key, { value, expiresAt });
  }

  /**
   * Removes the entry for `key`. Resolves silently if the key does not exist.
   */
  async delete(key: string): Promise<void> {
    if (this.disposed) throw new Error('Store is disposed');
    this.store.delete(key);
  }

  /**
   * Atomically reads the current value for `key`, applies `updater`, and
   * writes the result back.
   *
   * Atomicity is guaranteed by the JavaScript single-threaded execution model:
   * all three operations (read, transform, write) complete in the same
   * synchronous turn of the event loop, so no other caller can observe an
   * intermediate state.
   *
   * @param key     - Storage key.
   * @param updater - Receives the current value (or `null`) and returns the
   *                  next value to store.
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
    // Synchronous read — no await, no chance of interleaving.
    const entry = this.store.get(key);
    let current: T | null = null;

    if (entry !== undefined) {
      if (entry.expiresAt === null || Date.now() <= entry.expiresAt) {
        current = entry.value as T;
      } else {
        // Entry present but expired — treat as missing.
        this.store.delete(key);
      }
    }

    const next = updater(current);
    const expiresAt = effectiveTtl !== undefined ? Date.now() + effectiveTtl : null;
    this.store.set(key, { value: next, expiresAt });
  }

  /**
   * Clears all entries and stops the cleanup interval.
   * After dispose, calling `get`, `set`, `delete`, or `update` will throw
   * `Error('Store is disposed')`.
   */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.cleanupTimer);
    this.store.clear();
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /** Remove all entries that have passed their expiry timestamp. */
  private purgeExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt !== null && now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }
}
