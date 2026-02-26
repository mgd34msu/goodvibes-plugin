import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import type { RateLimitStore, RateLimitEntry } from '../types.js';

/** Minimal async mutex for serialising per-key concurrent updates. */
class KeyMutex {
  private readonly _locks: Map<string, Promise<void>> = new Map();

  /**
   * Acquire the lock for `key`, run `fn`, then release.
   * Concurrent calls for the same key are queued; different keys run in parallel.
   */
  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this._locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Store the chain reference so we can compare identity in the finally
    // block and avoid an unbounded Map growth (memory leak).
    const chain = existing.then(() => next);
    this._locks.set(key, chain);

    await existing;
    try {
      return await fn();
    } finally {
      release();
      // Clean up only if no further waiter has replaced our chain entry.
      if (this._locks.get(key) === chain) {
        this._locks.delete(key);
      }
    }
  }
}

/** Options accepted by FileStore. */
export interface FileStoreOptions {
  /**
   * Path to the JSON file used for persistent storage.
   * Defaults to `'.rate-limit-state.json'` (relative to the process working directory).
   */
  filePath?: string;
  /**
   * Milliseconds to wait before flushing dirty state to disk.
   * Multiple writes within the window are coalesced into a single flush.
   * Defaults to `500`.
   */
  debounceMs?: number;
  /**
   * Optional callback invoked when a background flush fails.
   * Use this to log or surface flush errors without crashing the process.
   *
   * @param err - The error thrown by the failed flush.
   */
  onError?: (err: Error) => void;
}

/**
 * Persists rate limit state to a JSON file with atomic writes.
 *
 * Writes are debounced — multiple rapid mutations flush once after a
 * configurable delay (default 500 ms). A hard limit is applied:
 * entries past their expiresAt are pruned on every cleanup() call.
 */
export class FileStore implements RateLimitStore {
  private readonly filePath: string;
  private readonly debounceMs: number;
  private readonly onError: ((err: Error) => void) | undefined;
  private state: Map<string, RateLimitEntry> = new Map();
  private loaded = false;
  private dirty = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private loadPromise: Promise<void> | null = null;
  private readonly _mutex = new KeyMutex();

  /**
   * Create a FileStore from a path string or options object.
   *
   * @param options - Path string (shorthand) or `FileStoreOptions`.
   */
  constructor(options: FileStoreOptions | string = {}) {
    // Accept a plain string path for convenience (used in tests).
    if (typeof options === 'string') {
      this.filePath = options !== '' ? options : '.rate-limit-state.json';
      this.debounceMs = 500;
      this.onError = undefined;
    } else {
      this.filePath = options.filePath ?? '.rate-limit-state.json';
      this.debounceMs = options.debounceMs ?? 500;
      this.onError = options.onError;
    }
  }

  /**
   * Factory helper for creating a FileStore from a file path.
   * Prefer this over `new FileStore(path)` when code clarity matters.
   *
   * @param path - Absolute or relative path to the state JSON file.
   */
  static fromPath(path: string): FileStore {
    return new FileStore(path);
  }

  /** Ensure state is loaded from disk before first access. */
  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = this._load();
    await this.loadPromise;
  }

  private async _load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, RateLimitEntry>;
      this.state = new Map(Object.entries(parsed));
    } catch (err) {
      // Only ENOENT (file not found) or JSON parse errors are expected on a
      // fresh or corrupt state file. Any other error (EACCES, ENOSPC, etc.)
      // is re-thrown so the caller is not silently left with stale state.
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && !(err instanceof SyntaxError)) {
        throw err;
      }
      // File does not exist yet or is corrupt — start fresh.
      this.state = new Map();
    }
    this.loaded = true;
  }

  /** Schedule a debounced flush to disk. */
  private scheduleDirtyFlush(): void {
    this.dirty = true;
    if (this.flushTimer !== null) return; // already scheduled
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this._flush().catch((err: unknown) => {
        // Flush errors are non-fatal; dirty flag is preserved so the next
        // write will retry. Surface the error via the optional onError callback.
        this.onError?.(err instanceof Error ? err : new Error(String(err)));
      });
    }, this.debounceMs);
  }

  /** Atomically write state to disk: write tmp file, then rename. */
  private async _flush(): Promise<void> {
    if (!this.dirty) return;
    // Do NOT clear dirty here — only clear after the write succeeds, so a
    // failed flush leaves dirty=true and the next scheduleDirtyFlush retries.

    const dir = dirname(this.filePath);
    const tmp = `${this.filePath}.tmp`;
    const obj: Record<string, RateLimitEntry> = {};
    for (const [k, v] of this.state) {
      obj[k] = v;
    }

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(tmp, JSON.stringify(obj, null, 2), 'utf-8');
    await fs.rename(tmp, this.filePath);

    // Only clear dirty after a successful write.
    this.dirty = false;
  }

  // ---- RateLimitStore interface ----

  async get(key: string): Promise<RateLimitEntry | undefined> {
    await this.ensureLoaded();
    return this.state.get(key);
  }

  async set(key: string, entry: RateLimitEntry): Promise<void> {
    await this.ensureLoaded();
    this.state.set(key, { ...entry });
    this.scheduleDirtyFlush();
  }

  async delete(key: string): Promise<void> {
    await this.ensureLoaded();
    this.state.delete(key);
    this.scheduleDirtyFlush();
  }

  /**
   * Atomically increment the `count` field of an entry.
   * Creates a default entry if none exists, matching MemoryStore behaviour.
   *
   * @param key - Store key.
   * @param by  - Amount to increment (default 1).
   * @returns New count after incrementing.
   */
  async increment(key: string, by: number = 1): Promise<number> {
    await this.ensureLoaded();
    let entry = this.state.get(key);

    if (!entry) {
      const now = Date.now();
      entry = {
        count: 0,
        tokens: 0,
        windowStart: now,
        lastRefill: now,
        expiresAt: now + 60_000,
      };
    }

    entry.count += by;
    this.state.set(key, entry);
    this.scheduleDirtyFlush();
    return entry.count;
  }

  /**
   * Atomically read-modify-write an entry.
   *
   * Uses a per-key async mutex (`KeyMutex`) to serialise concurrent callers
   * for the same key. Callers for different keys run without contention.
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
    return this._mutex.run(key, async () => {
      await this.ensureLoaded();
      const current = this.state.get(key);
      const next = fn(current);
      this.state.set(key, { ...next });
      this.scheduleDirtyFlush();
      return next;
    });
  }

  async cleanup(): Promise<void> {
    await this.ensureLoaded();
    const now = Date.now();
    let deleted = 0;
    for (const [key, entry] of this.state) {
      if (entry.expiresAt > 0 && now > entry.expiresAt) {
        this.state.delete(key);
        deleted++;
      }
    }
    if (deleted > 0) {
      this.scheduleDirtyFlush();
    }
  }

  /**
   * Flush any pending write immediately and cancel the debounce timer.
   * Call this before process exit or at end of tests.
   */
  async dispose(): Promise<void> {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this._flush();
  }
}
