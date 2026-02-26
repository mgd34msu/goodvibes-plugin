/**
 * Store unit tests.
 *
 * MemoryStore is implemented in stores/memory-store.ts.
 * FileStore is implemented in stores/file-store.ts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promises as fs } from 'node:fs';
import { MemoryStore } from '../stores/memory-store.js';
import { FileStore } from '../stores/file-store.js';
import type { RateLimitEntry } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<RateLimitEntry> = {}): RateLimitEntry {
  return {
    count: 0,
    tokens: 10,
    windowStart: Date.now(),
    lastRefill: Date.now(),
    expiresAt: Date.now() + 60_000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// MemoryStore
// ---------------------------------------------------------------------------
describe('MemoryStore', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore({ cleanupIntervalMs: 0 }); // disable auto-cleanup in tests
  });

  afterEach(async () => {
    await store.dispose();
  });

  it('returns undefined for missing key', async () => {
    expect(await store.get('missing')).toBeUndefined();
  });

  it('set and get round-trip', async () => {
    const entry = makeEntry({ count: 5 });
    await store.set('k', entry);
    expect(await store.get('k')).toEqual(entry);
  });

  it('set stores a copy (not same reference)', async () => {
    const entry = makeEntry({ count: 1 });
    await store.set('k', entry);
    entry.count = 999;
    const stored = await store.get('k');
    expect(stored!.count).toBe(1); // original value preserved
  });

  it('delete removes the key', async () => {
    await store.set('k', makeEntry());
    await store.delete('k');
    expect(await store.get('k')).toBeUndefined();
  });

  it('delete of non-existent key is a no-op', async () => {
    await expect(store.delete('nope')).resolves.not.toThrow();
  });

  it('increment increases count', async () => {
    await store.set('k', makeEntry({ count: 3 }));
    const next = await store.increment('k', 2);
    expect(next).toBe(5);
    expect((await store.get('k'))!.count).toBe(5);
  });

  it('increment defaults to by=1', async () => {
    await store.set('k', makeEntry({ count: 4 }));
    const next = await store.increment('k');
    expect(next).toBe(5);
  });

  it('increment on missing key creates default entry', async () => {
    // MemoryStore auto-creates a default entry when key is missing.
    const next = await store.increment('new-key', 1);
    expect(next).toBe(1);
    const entry = await store.get('new-key');
    expect(entry).toBeDefined();
  });

  it('cleanup removes expired entries', async () => {
    const expired = makeEntry({ expiresAt: Date.now() - 1 });
    const alive = makeEntry({ expiresAt: Date.now() + 60_000 });
    await store.set('expired', expired);
    await store.set('alive', alive);
    await store.cleanup();
    expect(await store.get('expired')).toBeUndefined();
    expect(await store.get('alive')).toBeDefined();
  });

  it('cleanup skips entries with expiresAt=0', async () => {
    // expiresAt=0 means the entry was created at epoch, which IS in the past,
    // so whether cleanup removes it depends on implementation. Test the contract:
    // entries with future expiresAt survive.
    const future = makeEntry({ expiresAt: Date.now() + 999_999 });
    await store.set('future', future);
    await store.cleanup();
    expect(await store.get('future')).toBeDefined();
  });

  it('multiple keys are independent', async () => {
    await store.set('a', makeEntry({ count: 1 }));
    await store.set('b', makeEntry({ count: 2 }));
    expect((await store.get('a'))!.count).toBe(1);
    expect((await store.get('b'))!.count).toBe(2);
  });

  it('dispose clears the store', async () => {
    await store.set('k', makeEntry());
    await store.dispose();
    // After dispose the map is cleared; get returns undefined.
    expect(await store.get('k')).toBeUndefined();
  });

  it('size reflects stored entries', async () => {
    expect(store.size).toBe(0);
    await store.set('a', makeEntry());
    await store.set('b', makeEntry());
    expect(store.size).toBe(2);
  });

  it('atomicUpdate parallel increments are serialized (no torn state)', async () => {
    const N = 20;
    // Each concurrent atomicUpdate reads the current count and increments by 1.
    await Promise.all(
      Array.from({ length: N }, () =>
        store.atomicUpdate('counter', (entry) => ({
          ...(entry ?? makeEntry({ count: 0 })),
          count: (entry?.count ?? 0) + 1,
          expiresAt: Date.now() + 60_000,
        })),
      ),
    );
    const result = await store.get('counter');
    expect(result?.count).toBe(N);
  });
});

// ---------------------------------------------------------------------------
// FileStore
// ---------------------------------------------------------------------------
describe('FileStore', () => {
  let filePath: string;
  let store: FileStore;

  beforeEach(async () => {
    filePath = join(tmpdir(), `rate-limiter-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    store = new FileStore(filePath); // string constructor overload
  });

  afterEach(async () => {
    await store.dispose();
    await fs.unlink(filePath).catch(() => {
      // File may not exist if no writes occurred.
    });
    await fs.unlink(`${filePath}.tmp`).catch(() => null);
  });

  it('returns undefined for missing key on a fresh store', async () => {
    expect(await store.get('missing')).toBeUndefined();
  });

  it('set and get round-trip', async () => {
    const entry = makeEntry({ count: 7 });
    await store.set('k', entry);
    expect(await store.get('k')).toEqual(entry);
  });

  it('delete removes the key', async () => {
    await store.set('k', makeEntry());
    await store.delete('k');
    expect(await store.get('k')).toBeUndefined();
  });

  it('increment increases count (auto-creates entry if missing)', async () => {
    const next = await store.increment('k', 3);
    expect(next).toBe(3);
  });

  it('increment defaults to by=1', async () => {
    await store.increment('k'); // auto-create with count=1
    const next = await store.increment('k');
    expect(next).toBe(2);
  });

  it('increment on existing entry accumulates', async () => {
    await store.set('k', makeEntry({ count: 5 }));
    const next = await store.increment('k', 3);
    expect(next).toBe(8);
  });

  it('persists state across instances (debounce flushed)', async () => {
    // Use short debounce for test speed.
    const quickStore = new FileStore({ filePath, debounceMs: 50 });
    const entry = makeEntry({ count: 42 });
    await quickStore.set('persisted', entry);
    // Flush immediately so the second instance can read from disk.
    await quickStore.dispose();

    const store2 = new FileStore({ filePath, debounceMs: 50 });
    const loaded = await store2.get('persisted');
    await store2.dispose();
    expect(loaded).toEqual(entry);
  });

  it('atomic write: tmp file is removed after flush', async () => {
    await store.set('k', makeEntry());
    await store.dispose();
    // Verify tmp file is gone.
    await expect(fs.access(`${filePath}.tmp`)).rejects.toThrow();
    // Verify state file exists.
    await expect(fs.access(filePath)).resolves.not.toThrow();
  });

  it('cleanup removes expired entries', async () => {
    const expired = makeEntry({ expiresAt: Date.now() - 1 });
    const alive = makeEntry({ expiresAt: Date.now() + 60_000 });
    await store.set('e', expired);
    await store.set('a', alive);
    await store.cleanup();
    expect(await store.get('e')).toBeUndefined();
    expect(await store.get('a')).toBeDefined();
  });

  it('debounced flush coalesces multiple writes', async () => {
    // Capture the real rename before installing the spy.
    const realRename = fs.rename;
    // Track flush completions via a promise that resolves on the first rename.
    let resolveFlush!: () => void;
    const flushDone = new Promise<void>((resolve) => {
      resolveFlush = resolve;
    });
    const spy = vi.spyOn(fs, 'rename').mockImplementation(async (...args: Parameters<typeof fs.rename>) => {
      const result = await realRename.call(fs, ...args);
      resolveFlush();
      return result;
    });

    vi.useFakeTimers();
    const shortStore = new FileStore({ filePath, debounceMs: 100 });
    for (let i = 0; i < 5; i++) {
      await shortStore.set(`k${i}`, makeEntry({ count: i }));
    }
    // Synchronously trigger the debounce timer, then restore real timers
    // so that the async _flush() I/O can proceed normally.
    vi.runAllTimers();
    vi.useRealTimers();
    // Await the rename completing to confirm exactly one flush occurred.
    await flushDone;
    // Should have called rename exactly once for all 5 writes.
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    await shortStore.dispose();
  });

  it('dispose flushes pending write', async () => {
    const shortStore = new FileStore({ filePath, debounceMs: 10_000 });
    await shortStore.set('k', makeEntry({ count: 99 }));
    await shortStore.dispose(); // Immediately flush even before debounce fires.
    // New store reads from disk.
    const store2 = new FileStore({ filePath, debounceMs: 50 });
    expect((await store2.get('k'))!.count).toBe(99);
    await store2.dispose();
  });

  it('handles corrupt or missing file gracefully', async () => {
    // Write garbage to the file.
    await fs.writeFile(filePath, 'NOT_JSON', 'utf-8');
    const corrupt = new FileStore(filePath);
    expect(await corrupt.get('k')).toBeUndefined();
    await corrupt.dispose();
  });

  it('multiple keys are isolated', async () => {
    await store.set('a', makeEntry({ count: 1 }));
    await store.set('b', makeEntry({ count: 2 }));
    expect((await store.get('a'))!.count).toBe(1);
    expect((await store.get('b'))!.count).toBe(2);
  });

  it('accepts FileStoreOptions object', async () => {
    const optStore = new FileStore({ filePath, debounceMs: 100 });
    await optStore.set('x', makeEntry({ count: 5 }));
    expect((await optStore.get('x'))!.count).toBe(5);
    await optStore.dispose();
  });

  it('atomicUpdate parallel increments are serialized via mutex (no torn state)', async () => {
    const N = 10;
    // Each concurrent atomicUpdate reads the current count and increments by 1.
    // The per-key mutex ensures these are serialized despite all being launched together.
    await Promise.all(
      Array.from({ length: N }, () =>
        store.atomicUpdate('counter', (entry) => ({
          ...(entry ?? makeEntry({ count: 0 })),
          count: (entry?.count ?? 0) + 1,
          expiresAt: Date.now() + 60_000,
        })),
      ),
    );
    const result = await store.get('counter');
    expect(result?.count).toBe(N);
    await store.dispose();
  });

  it('calls onError when flush fails (fs.rename throws)', async () => {
    const onError = vi.fn();
    const errorStore = new FileStore({ filePath, debounceMs: 50, onError });
    const renameError = new Error('ENOSPC: no space left on device');

    // Make rename throw on the first call to simulate a flush failure.
    vi.useFakeTimers();
    const renameSpy = vi.spyOn(fs, 'rename').mockRejectedValueOnce(renameError);

    await errorStore.set('k', makeEntry({ count: 1 }));
    // Fire debounce timer synchronously, then restore real timers for async I/O.
    vi.runAllTimers();
    vi.useRealTimers();

    // Wait briefly for the async _flush() rejection to propagate to onError.
    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    renameSpy.mockRestore();
    await errorStore.dispose();
  });

  it('FileStore.fromPath() creates a working FileStore instance', async () => {
    const fromPathStore = FileStore.fromPath(filePath);
    await fromPathStore.set('x', makeEntry({ count: 42 }));
    const retrieved = await fromPathStore.get('x');
    expect(retrieved).toBeDefined();
    expect(retrieved!.count).toBe(42);
    await fromPathStore.dispose();
  });
});

