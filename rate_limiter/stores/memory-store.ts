/**
 * In-Memory Rate Limit Store
 *
 * A `Map`-backed implementation of `RateLimitStore` suitable for single-
 * process deployments and testing. TTL cleanup runs on a configurable
 * interval. Call `dispose()` to stop the cleanup timer and free resources.
 */

import type { RateLimitEntry, RateLimitStore } from '../types.js';

/** Options accepted by `MemoryStore`. */
export interface MemoryStoreOptions {
  /**
   * How often (in ms) to run the garbage-collection sweep over expired
   * entries. Defaults to `60_000` (1 minute). Set to `0` to disable
   * automatic cleanup.
   */
  cleanupIntervalMs?: number;
}

/**
 * In-memory implementation of {@link RateLimitStore}.
 *
 * @example
 * ```ts
 * const store = new MemoryStore({ cleanupIntervalMs: 30_000 });
 * // ... use the store ...
 * await store.dispose();
 * ```
 */
export class MemoryStore implements RateLimitStore {
  private readonly _map: Map<string, RateLimitEntry> = new Map();
  private _cleanupTimer: ReturnType<typeof setInterval> | undefined;

  constructor(options: MemoryStoreOptions = {}) {
    const { cleanupIntervalMs = 60_000 } = options;

    if (cleanupIntervalMs > 0) {
      this._cleanupTimer = setInterval(() => {
        void this.cleanup();
      }, cleanupIntervalMs);

      // Allow the Node.js process to exit even if this timer is still active.
      if (
        this._cleanupTimer &&
        typeof (this._cleanupTimer as unknown as NodeJS.Timeout).unref === 'function'
      ) {
        (this._cleanupTimer as unknown as NodeJS.Timeout).unref();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // RateLimitStore implementation
  // ---------------------------------------------------------------------------

  /**
   * Retrieve an entry by key.
   * Returns `undefined` when not found or if the entry has expired.
   */
  async get(key: string): Promise<RateLimitEntry | undefined> {
    const entry = this._map.get(key);
    if (!entry) return undefined;

    // Lazy expiry check — remove and return undefined if stale.
    if (Date.now() > entry.expiresAt) {
      this._map.delete(key);
      return undefined;
    }

    return entry;
  }

  /**
   * Persist an entry. Replaces any existing entry for the key.
   */
  async set(key: string, entry: RateLimitEntry): Promise<void> {
    this._map.set(key, { ...entry });
  }

  /**
   * Remove an entry. Silently succeeds when the key does not exist.
   */
  async delete(key: string): Promise<void> {
    this._map.delete(key);
  }

  /**
   * Atomically increment the `count` field.
   *
   * If no entry exists, one is created with sensible defaults before
   * incrementing. The entry TTL is NOT altered by this method — callers
   * should persist a full entry via `set` when they need to control TTL.
   *
   * @param key - Store key.
   * @param by  - Amount to increment (default 1).
   * @returns New count after incrementing.
   */
  async increment(key: string, by: number = 1): Promise<number> {
    let entry = this._map.get(key);

    if (!entry || Date.now() > entry.expiresAt) {
      const now = Date.now();
      // Default window: 60 seconds — callers that care about TTL use set().
      entry = {
        count: 0,
        tokens: 0,
        windowStart: now,
        lastRefill: now,
        expiresAt: now + 60_000,
      };
    }

    entry.count += by;
    this._map.set(key, entry);
    return entry.count;
  }

  /**
   * Atomically read-modify-write an entry.
   *
   * Because `MemoryStore` operates on a synchronous `Map`, the get-transform-set
   * cycle is uninterruptible within the JavaScript event-loop turn — no await
   * points exist between reading and writing, so concurrent async callers cannot
   * observe a torn state.
   *
   * @param key - Store key.
   * @param fn  - Pure transform: receives current entry (or `undefined`) and
   *              returns the new entry to persist.
   * @returns The persisted entry.
   */
  async atomicUpdate(
    key: string,
    fn: (entry: RateLimitEntry | undefined) => RateLimitEntry,
  ): Promise<RateLimitEntry> {
    // Lazy expiry: treat expired entries as missing.
    const existing = this._map.get(key);
    const current =
      existing && Date.now() <= existing.expiresAt ? existing : undefined;

    // fn is called synchronously — no await between read and write.
    const next = fn(current);
    this._map.set(key, { ...next });
    return next;
  }

  /**
   * Remove all expired entries from the map.
   */
  async cleanup(): Promise<void> {
    const now = Date.now();
    for (const [key, entry] of this._map) {
      if (now > entry.expiresAt) {
        this._map.delete(key);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Stop the periodic cleanup timer and clear all entries.
   * Call this when the store is no longer needed to prevent resource leaks.
   */
  async dispose(): Promise<void> {
    if (this._cleanupTimer !== undefined) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = undefined;
    }
    this._map.clear();
  }

  // ---------------------------------------------------------------------------
  // Introspection (useful for testing / debugging)
  // ---------------------------------------------------------------------------

  /** Total number of entries currently in the store (including expired). */
  get size(): number {
    return this._map.size;
  }
}
