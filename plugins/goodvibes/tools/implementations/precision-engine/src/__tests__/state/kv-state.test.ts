/**
 * Tests for KVState - per-session key-value state store.
 *
 * Tests cover:
 * - Session ID generation (8-char hex)
 * - get/set round-trip
 * - list with and without prefix filter
 * - clear removes keys, skips protected keys
 * - Persistence to disk (write + read back)
 * - Atomic write (temp + rename)
 * - Auto-creation of state directory
 * - Protected key enforcement (id, started_at)
 * - cleanupOldSessions keeps N most recent
 * - started_at set on construction
 * - resetInstance allows fresh start
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Stats as FsStats } from "fs";

// Mock fs/promises BEFORE importing KVState
vi.mock('fs/promises');

import { KVState } from '../../state/kv-state.js';
import * as fsPromises from 'fs/promises';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/** Build a minimal session JSON string for test mocking. */
function makeSessionJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: 'aabbccdd',
    started_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  });
}

// ──────────────────────────────────────────────
// Setup / teardown
// ──────────────────────────────────────────────

beforeEach(() => {
  KVState.resetInstance();
  vi.clearAllMocks();

  // Default: mkdir, writeFile, rename succeed
  vi.mocked(fsPromises.mkdir).mockResolvedValue(undefined);
  vi.mocked(fsPromises.writeFile).mockResolvedValue(undefined);
  vi.mocked(fsPromises.rename).mockResolvedValue(undefined);
  // Default: session file does not exist (ENOENT)
  vi.mocked(fsPromises.readFile).mockRejectedValue(
    Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
  );
  // Default: readdir returns empty list
  vi.mocked(fsPromises.readdir).mockResolvedValue(
    [] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>
  );
  // Default: unlink succeeds
  vi.mocked(fsPromises.unlink).mockResolvedValue(undefined);
});

afterEach(() => {
  KVState.resetInstance();
  vi.restoreAllMocks();
});

// ──────────────────────────────────────────────
// getInstance / singleton
// ──────────────────────────────────────────────

describe('getInstance', () => {
  it('returns the same instance on repeated calls', () => {
    const a = KVState.getInstance();
    const b = KVState.getInstance();
    expect(a).toBe(b);
  });

  it('creates a new instance after resetInstance()', () => {
    const a = KVState.getInstance();
    KVState.resetInstance();
    const b = KVState.getInstance();
    expect(a).not.toBe(b);
  });
});

// ──────────────────────────────────────────────
// Session ID
// ──────────────────────────────────────────────

describe('getSessionId', () => {
  it('returns an 8-character hex string', () => {
    const state = KVState.getInstance();
    const id = state.getSessionId();
    expect(id).toMatch(/^[0-9a-f]{8}$/);
  });

  it('generates a unique ID for each new instance', () => {
    const idA = KVState.getInstance().getSessionId();
    KVState.resetInstance();
    const idB = KVState.getInstance().getSessionId();
    // Probabilistically unique (1 in ~4 billion chance of collision)
    expect(idA).not.toBe(idB);
  });
});

// ──────────────────────────────────────────────
// started_at
// ──────────────────────────────────────────────

describe('started_at', () => {
  it('is an ISO timestamp set during construction', async () => {
    const before = new Date();
    const state = KVState.getInstance();
    const after = new Date();

    const result = await state.list();
    const ts = result['started_at'] as string;
    const parsed = new Date(ts);

    expect(parsed.getTime()).toBeGreaterThanOrEqual(before.getTime() - 10);
    expect(parsed.getTime()).toBeLessThanOrEqual(after.getTime() + 10);
  });
});

// ──────────────────────────────────────────────
// get / set round-trip
// ──────────────────────────────────────────────

describe('get', () => {
  it('returns undefined for unknown keys', async () => {
    const state = KVState.getInstance();
    const result = await state.get(['nonexistent']);
    expect(result['nonexistent']).toBeUndefined();
  });

  it('returns values for keys that have been set', async () => {
    const state = KVState.getInstance();
    await state.set({ 'session.task': 'implement-auth', 'session.phase': 'gather' });
    const result = await state.get(['session.task', 'session.phase']);
    expect(result['session.task']).toBe('implement-auth');
    expect(result['session.phase']).toBe('gather');
  });

  it('returns values for multiple keys including missing ones', async () => {
    const state = KVState.getInstance();
    await state.set({ foo: 42 });
    const result = await state.get(['foo', 'bar']);
    expect(result['foo']).toBe(42);
    expect(result['bar']).toBeUndefined();
  });

  it('handles various JSON-serializable value types', async () => {
    const state = KVState.getInstance();
    await state.set({
      strKey: 'hello',
      numKey: 99,
      boolKey: true,
      nullKey: null,
      objKey: { nested: true },
      arrKey: [1, 2, 3],
    });
    const result = await state.get(['strKey', 'numKey', 'boolKey', 'nullKey', 'objKey', 'arrKey']);
    expect(result['strKey']).toBe('hello');
    expect(result['numKey']).toBe(99);
    expect(result['boolKey']).toBe(true);
    expect(result['nullKey']).toBeNull();
    expect(result['objKey']).toEqual({ nested: true });
    expect(result['arrKey']).toEqual([1, 2, 3]);
  });
});

// ──────────────────────────────────────────────
// set — protected key enforcement
// ──────────────────────────────────────────────

describe('set (protected keys)', () => {
  it('silently skips setting id', async () => {
    const state = KVState.getInstance();
    const originalId = state.getSessionId();
    await state.set({ id: 'hacked' });
    const result = await state.get(['id']);
    expect(result['id']).toBe(originalId);
  });

  it('silently skips setting started_at', async () => {
    const state = KVState.getInstance();
    const result1 = await state.list();
    const originalTs = result1['started_at'];
    await state.set({ started_at: '1970-01-01T00:00:00.000Z' });
    const result2 = await state.get(['started_at']);
    expect(result2['started_at']).toBe(originalTs);
  });

  it('allows setting other keys alongside protected ones', async () => {
    const state = KVState.getInstance();
    await state.set({ id: 'hacked', myKey: 'allowed' });
    const result = await state.get(['myKey']);
    expect(result['myKey']).toBe('allowed');
  });
});

// ──────────────────────────────────────────────
// list
// ──────────────────────────────────────────────

describe('list', () => {
  it('returns all keys including id and started_at when no prefix given', async () => {
    const state = KVState.getInstance();
    await state.set({ 'session.task': 'work' });
    const result = await state.list();
    expect(Object.keys(result)).toContain('id');
    expect(Object.keys(result)).toContain('started_at');
    expect(Object.keys(result)).toContain('session.task');
  });

  it('filters keys by prefix', async () => {
    const state = KVState.getInstance();
    await state.set({
      'session.task': 'auth',
      'session.phase': 'gather',
      'other.key': 'ignored',
    });
    const result = await state.list('session.');
    expect(Object.keys(result)).toContain('session.task');
    expect(Object.keys(result)).toContain('session.phase');
    expect(Object.keys(result)).not.toContain('other.key');
    expect(Object.keys(result)).not.toContain('id');
    expect(Object.keys(result)).not.toContain('started_at');
  });

  it('returns empty object when prefix matches nothing', async () => {
    const state = KVState.getInstance();
    const result = await state.list('nonexistent.');
    expect(Object.keys(result)).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────
// clear
// ──────────────────────────────────────────────

describe('clear', () => {
  it('removes the specified keys', async () => {
    const state = KVState.getInstance();
    await state.set({ 'session.task': 'work', 'session.phase': 'gather' });
    await state.clear(['session.task']);
    const result = await state.get(['session.task', 'session.phase']);
    expect(result['session.task']).toBeUndefined();
    expect(result['session.phase']).toBe('gather');
  });

  it('silently skips protected keys (id, started_at)', async () => {
    const state = KVState.getInstance();
    const originalId = state.getSessionId();
    await state.clear(['id', 'started_at']);
    const result = await state.get(['id', 'started_at']);
    expect(result['id']).toBe(originalId);
    expect(result['started_at']).toBeDefined();
  });

  it('ignores keys that do not exist', async () => {
    const state = KVState.getInstance();
    await expect(state.clear(['nonexistent'])).resolves.not.toThrow();
  });

  it('persists changes after clearing keys', async () => {
    const state = KVState.getInstance();
    await state.set({ myKey: 'value' });
    vi.mocked(fsPromises.rename).mockClear();
    await state.clear(['myKey']);
    expect(fsPromises.rename).toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────
// Persistence: atomic write
// ──────────────────────────────────────────────

describe('persist', () => {
  it('writes to a .tmp file then renames atomically', async () => {
    const state = KVState.getInstance();
    await state.set({ testKey: 'testValue' });

    // writeFile was called with a .tmp path
    const writeFileCalls = vi.mocked(fsPromises.writeFile).mock.calls;
    expect(writeFileCalls.length).toBeGreaterThan(0);
    const tmpPath = writeFileCalls[writeFileCalls.length - 1][0] as string;
    expect(tmpPath).toMatch(/\.tmp$/);

    // rename was called to move .tmp -> actual file
    const renameCalls = vi.mocked(fsPromises.rename).mock.calls;
    expect(renameCalls.length).toBeGreaterThan(0);
    const [from, to] = renameCalls[renameCalls.length - 1] as [string, string];
    expect(from).toMatch(/\.tmp$/);
    expect(to).toMatch(/session_[0-9a-f]{8}\.json$/);
  });

  it('creates state directory before writing', async () => {
    const state = KVState.getInstance();
    await state.set({ x: 1 });
    const mkdirCalls = vi.mocked(fsPromises.mkdir).mock.calls;
    expect(
      mkdirCalls.some((args) => (args[1] as Record<string, unknown>)?.recursive === true)
    ).toBe(true);
  });

  it('writes valid JSON to the temp file', async () => {
    const state = KVState.getInstance();
    await state.set({ 'session.tokens_used': 42000 });

    const writeFileCalls = vi.mocked(fsPromises.writeFile).mock.calls;
    const content = writeFileCalls[writeFileCalls.length - 1][1] as string;
    const parsed = JSON.parse(content);
    expect(parsed['session.tokens_used']).toBe(42000);
    expect(parsed.id).toBeDefined();
    expect(parsed.started_at).toBeDefined();
  });
});

// ──────────────────────────────────────────────
// load — reading from disk
// ──────────────────────────────────────────────

describe('load', () => {
  it('merges persisted data into in-memory state', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      makeSessionJson({ 'session.task': 'resumed-task' }) as unknown as Awaited<ReturnType<typeof fsPromises.readFile>>
    );

    const state = KVState.getInstance();
    const result = await state.get(['session.task']);
    expect(result['session.task']).toBe('resumed-task');
  });

  it('keeps in-memory defaults when file does not exist', async () => {
    // readFile already mocked to ENOENT in beforeEach
    const state = KVState.getInstance();
    const result = await state.list();
    expect(result['id']).toBeDefined();
    expect(result['started_at']).toBeDefined();
  });

  it('loads only once (subsequent operations skip disk)', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      makeSessionJson({ counter: 1 }) as unknown as Awaited<ReturnType<typeof fsPromises.readFile>>
    );

    const state = KVState.getInstance();
    await state.get(['counter']);
    await state.get(['counter']); // second call — should NOT re-read from disk

    // readFile called exactly once (during first ensureLoaded)
    expect(fsPromises.readFile).toHaveBeenCalledTimes(1);
  });

  it('handles corrupt JSON gracefully (uses in-memory defaults)', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue('{ corrupt json' as unknown as Awaited<ReturnType<typeof fsPromises.readFile>>);
    const state = KVState.getInstance();
    const result = await state.list();
    expect(result['id']).toBeDefined();
    expect(result['started_at']).toBeDefined();
  });
});

// ──────────────────────────────────────────────
// load — explicit call
// ──────────────────────────────────────────────

describe('load (explicit)', () => {
  it('re-reads from disk and merges data into in-memory state', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      makeSessionJson({ 'session.resumed': 'yes' }) as unknown as Awaited<ReturnType<typeof fsPromises.readFile>>
    );

    const state = KVState.getInstance();
    // Call load() directly (bypasses ensureLoaded guard)
    await state.load();
    const result = await state.get(['session.resumed']);
    expect(result['session.resumed']).toBe('yes');
  });

  it('preserves protected keys (id, started_at) even when disk has different values', async () => {
    const state = KVState.getInstance();
    const originalId = state.getSessionId();
    const originalTs = (await state.list())['started_at'] as string;

    // Disk returns data with overridden protected keys
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      makeSessionJson({ id: 'overridden', started_at: '1970-01-01T00:00:00.000Z', 'extra.key': 'value' }) as unknown as Awaited<ReturnType<typeof fsPromises.readFile>>
    );

    await state.load();

    const result = await state.get(['id', 'started_at', 'extra.key']);
    expect(result['id']).toBe(originalId);
    expect(result['started_at']).toBe(originalTs);
    expect(result['extra.key']).toBe('value');
  });

  it('can be called multiple times and correctly merges latest disk data', async () => {
    vi.mocked(fsPromises.readFile)
      .mockResolvedValueOnce(makeSessionJson({ counter: 1 }) as unknown as Awaited<ReturnType<typeof fsPromises.readFile>>)
      .mockResolvedValueOnce(makeSessionJson({ counter: 2 }) as unknown as Awaited<ReturnType<typeof fsPromises.readFile>>);

    const state = KVState.getInstance();
    await state.load();
    const first = await state.get(['counter']);
    expect(first['counter']).toBe(1);

    await state.load();
    const second = await state.get(['counter']);
    expect(second['counter']).toBe(2);
  });
});

// ──────────────────────────────────────────────
// listSessions
// ──────────────────────────────────────────────

describe('listSessions', () => {
  it('returns session IDs from files matching session_*.json pattern', async () => {
    vi.mocked(fsPromises.readdir).mockResolvedValue([
      'session_aabbccdd.json',
      'session_11223344.json',
      'unrelated.json',
      'session_invalid_x.json', // invalid — more than 8 chars or non-hex
    ] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);

    const state = KVState.getInstance();
    const sessions = await state.listSessions();
    expect(sessions).toContain('aabbccdd');
    expect(sessions).toContain('11223344');
    expect(sessions).not.toContain('unrelated');
    expect(sessions.some((s) => s.includes('invalid'))).toBe(false);
  });

  it('returns empty array when state directory does not exist', async () => {
    vi.mocked(fsPromises.readdir).mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    );
    const state = KVState.getInstance();
    const sessions = await state.listSessions();
    expect(sessions).toEqual([]);
  });
});

// ──────────────────────────────────────────────
// cleanupOldSessions
// ──────────────────────────────────────────────

describe('cleanupOldSessions', () => {
  it('returns 0 when state directory does not exist', async () => {
    vi.mocked(fsPromises.readdir).mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    );
    const state = KVState.getInstance();
    const deleted = await state.cleanupOldSessions();
    expect(deleted).toBe(0);
  });

  it('returns 0 when fewer sessions than keepCount', async () => {
    vi.mocked(fsPromises.readdir).mockResolvedValue([
      'session_aabb1122.json',
      'session_ccdd3344.json',
    ] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);

    vi.mocked(fsPromises.stat as unknown as (path: string) => Promise<FsStats>)
      .mockResolvedValueOnce({ mtimeMs: 1000 } as FsStats)
      .mockResolvedValueOnce({ mtimeMs: 2000 } as FsStats);

    const state = KVState.getInstance();
    const deleted = await state.cleanupOldSessions(5);
    expect(deleted).toBe(0);
    expect(fsPromises.unlink).not.toHaveBeenCalled();
  });

  it('deletes oldest sessions when count exceeds keepCount', async () => {
    vi.mocked(fsPromises.readdir).mockResolvedValue([
      'session_aaaa0001.json',
      'session_aaaa0002.json',
      'session_aaaa0003.json',
      'session_aaaa0004.json',
    ] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);

    // Assign mtimes: 0001 = oldest, 0004 = newest
    vi.mocked(fsPromises.stat as unknown as (path: string) => Promise<FsStats>)
      .mockResolvedValueOnce({ mtimeMs: 1000 } as FsStats)
      .mockResolvedValueOnce({ mtimeMs: 2000 } as FsStats)
      .mockResolvedValueOnce({ mtimeMs: 3000 } as FsStats)
      .mockResolvedValueOnce({ mtimeMs: 4000 } as FsStats);

    const state = KVState.getInstance();
    const deleted = await state.cleanupOldSessions(2);
    expect(deleted).toBe(2); // 0001 and 0002 deleted
    expect(fsPromises.unlink).toHaveBeenCalledTimes(2);
  });
});

// ──────────────────────────────────────────────
// resetInstance isolation
// ──────────────────────────────────────────────

describe('resetInstance', () => {
  it('ensures subsequent getInstance returns a fresh instance with a new session ID', () => {
    const id1 = KVState.getInstance().getSessionId();
    KVState.resetInstance();
    const id2 = KVState.getInstance().getSessionId();
    expect(id1).not.toBe(id2);
  });

  it('fresh instance has empty state (no cross-session leakage)', async () => {
    const s1 = KVState.getInstance();
    await s1.set({ 'session.task': 'original' });
    KVState.resetInstance();
    const s2 = KVState.getInstance();
    const result = await s2.get(['session.task']);
    expect(result['session.task']).toBeUndefined();
  });
});
