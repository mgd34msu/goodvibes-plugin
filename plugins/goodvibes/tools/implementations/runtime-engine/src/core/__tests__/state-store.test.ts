/**
 * state-store.test.ts — Core State Store
 *
 * Tests: get/set/delete CRUD, dot-path traversal, merge (deep merge),
 * snapshot/restore cycle, flush, debounced save, load on construction
 * (ENOENT, invalid JSON, non-object content), persistence error handling.
 *
 * File system is mocked via vi.mock('node:fs') to avoid real I/O.
 * vi.hoisted() is used so the mock references are available at hoist time.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock node:fs ──────────────────────────────────────────────────────────────────
// vi.hoisted() ensures these variables exist when vi.mock factory runs (which is hoisted)
const { mockReadFileSync, mockWriteFileSync, mockMkdirSync, mockRenameSync } = vi.hoisted(() => ({
  mockReadFileSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
  mockMkdirSync: vi.fn(),
  mockRenameSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  mkdirSync: mockMkdirSync,
  renameSync: mockRenameSync,
}));

import { CoreStateStore } from '../state-store.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEnoentError(): NodeJS.ErrnoException {
  const e = new Error('ENOENT') as NodeJS.ErrnoException;
  e.code = 'ENOENT';
  return e;
}

function makeGenericError(): NodeJS.ErrnoException {
  const e = new Error('Permission denied') as NodeJS.ErrnoException;
  e.code = 'EACCES';
  return e;
}

/** Create a store with controlled initial readFileSync behavior. */
function makeStore(initialContent?: string | Error): CoreStateStore {
  if (initialContent instanceof Error) {
    mockReadFileSync.mockImplementationOnce(() => { throw initialContent; });
  } else if (initialContent !== undefined) {
    mockReadFileSync.mockReturnValueOnce(initialContent);
  } else {
    // Default: file not found (ENOENT — fresh start)
    mockReadFileSync.mockImplementationOnce(() => { throw makeEnoentError(); });
  }
  return new CoreStateStore({ file_path: '/tmp/test-state.json', save_debounce_ms: 10000 });
}

// ─── Construction / Load ─────────────────────────────────────────────────────────

describe('CoreStateStore — construction / load', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with empty state when file does not exist (ENOENT)', () => {
    const store = makeStore();
    expect(store.get('anything')).toBeNull();
  });

  it('loads valid JSON state from disk', () => {
    const store = makeStore(JSON.stringify({ session: { phase: 'active' } }));
    expect(store.get<string>('session.phase')).toBe('active');
  });

  it('starts fresh when file contains invalid JSON', () => {
    const store = makeStore('not json {{');
    expect(store.get('any')).toBeNull();
  });

  it('starts fresh when file contains a JSON array (non-object)', () => {
    const store = makeStore(JSON.stringify([1, 2, 3]));
    expect(store.get('0')).toBeNull();
  });

  it('starts fresh when file contains a JSON string (non-object)', () => {
    const store = makeStore(JSON.stringify('hello'));
    expect(store.get('any')).toBeNull();
  });

  it('starts fresh when file contains JSON null', () => {
    const store = makeStore(JSON.stringify(null));
    expect(store.get('any')).toBeNull();
  });

  it('starts fresh when readFileSync throws a non-ENOENT error', () => {
    const store = makeStore(makeGenericError());
    expect(store.get('any')).toBeNull();
  });
});

// ─── get / set / delete ──────────────────────────────────────────────────────────

describe('CoreStateStore — get/set/delete', () => {
  let store: CoreStateStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = makeStore();
  });

  it('set and get a simple top-level key', () => {
    store.set('name', 'alice');
    expect(store.get<string>('name')).toBe('alice');
  });

  it('get returns null for missing top-level key', () => {
    expect(store.get('missing')).toBeNull();
  });

  it('set overwrites existing value', () => {
    store.set('count', 1);
    store.set('count', 2);
    expect(store.get<number>('count')).toBe(2);
  });

  it('set creates nested objects via dot-path', () => {
    store.set('session.phase', 'active');
    expect(store.get<string>('session.phase')).toBe('active');
  });

  it('get traverses nested dot-path', () => {
    store.set('a.b.c', 42);
    expect(store.get<number>('a.b.c')).toBe(42);
  });

  it('get returns null for missing nested key', () => {
    store.set('a', { b: 1 });
    expect(store.get('a.c')).toBeNull();
  });

  it('get returns null when intermediate path segment is not an object', () => {
    store.set('a', 'string_not_object');
    expect(store.get('a.b')).toBeNull();
  });

  it('delete removes a top-level key', () => {
    store.set('key', 'value');
    store.delete('key');
    expect(store.get('key')).toBeNull();
  });

  it('delete removes a nested key while preserving parent', () => {
    store.set('session.phase', 'active');
    store.delete('session.phase');
    expect(store.get('session.phase')).toBeNull();
    // Parent object should still exist
    expect(store.get('session')).not.toBeNull();
  });

  it('delete is a no-op when key does not exist', () => {
    expect(() => store.delete('nonexistent')).not.toThrow();
  });

  it('delete is a no-op when intermediate path segment is missing', () => {
    expect(() => store.delete('a.b.c')).not.toThrow();
  });

  it('set schedules a save (writeFileSync called after debounce)', () => {
    vi.useFakeTimers();
    store.set('key', 'val');
    vi.advanceTimersByTime(15000);
    expect(mockWriteFileSync).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('delete schedules a save after debounce', () => {
    vi.useFakeTimers();
    store.set('key', 'val');
    vi.advanceTimersByTime(15000);
    const callsBefore = mockWriteFileSync.mock.calls.length;
    store.delete('key');
    vi.advanceTimersByTime(15000);
    expect(mockWriteFileSync.mock.calls.length).toBeGreaterThan(callsBefore);
    vi.useRealTimers();
  });

  it('set can store complex objects', () => {
    const obj = { users: [{ id: 1, name: 'alice' }], active: true };
    store.set('app', obj);
    expect(store.get('app')).toEqual(obj);
  });

  it('set with dot-path creates intermediate objects', () => {
    store.set('a.b.c.d', 'deep');
    expect(store.get<string>('a.b.c.d')).toBe('deep');
    expect(store.get('a')).not.toBeNull();
    expect(store.get('a.b')).not.toBeNull();
  });
});

// ─── merge ─────────────────────────────────────────────────────────────────────

describe('CoreStateStore — merge', () => {
  let store: CoreStateStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = makeStore();
  });

  it('merge on a new key behaves like set', () => {
    store.merge('session', { phase: 'active' });
    expect(store.get<string>('session.phase')).toBe('active');
  });

  it('merge deep-merges with an existing object at top level', () => {
    store.set('session', { phase: 'active', count: 1 });
    store.merge('session', { count: 2, extra: 'data' });
    const session = store.get<Record<string, unknown>>('session');
    expect(session?.['phase']).toBe('active');  // preserved
    expect(session?.['count']).toBe(2);         // overwritten
    expect(session?.['extra']).toBe('data');    // added
  });

  it('merge deeply merges nested objects', () => {
    store.set('config', { db: { host: 'localhost', port: 5432 } });
    store.merge('config', { db: { port: 5433 } });
    const config = store.get<Record<string, unknown>>('config');
    const db = config?.['db'] as Record<string, unknown>;
    expect(db?.['host']).toBe('localhost');  // preserved
    expect(db?.['port']).toBe(5433);         // overwritten
  });

  it('merge replaces arrays (does not concatenate)', () => {
    store.set('data', { items: [1, 2] });
    store.merge('data', { items: [3] });
    const data = store.get<{ items: number[] }>('data');
    expect(data?.items).toEqual([3]);
  });

  it('merge on a non-object key replaces it with the new object', () => {
    store.set('count', 5);
    store.merge('count', { replaced: true });
    expect(store.get('count')).toEqual({ replaced: true });
  });

  it('merge on an array key replaces it with the new object', () => {
    store.set('items', [1, 2, 3]);
    store.merge('items', { new: 'obj' });
    expect(store.get('items')).toEqual({ new: 'obj' });
  });

  it('merge on a null key replaces it with the new object', () => {
    // null is treated as not-an-object, so merge sets the new value
    store.set('val', null);
    store.merge('val', { key: 'value' });
    expect(store.get('val')).toEqual({ key: 'value' });
  });
});

// ─── snapshot / restore ───────────────────────────────────────────────────────────

describe('CoreStateStore — snapshot/restore', () => {
  let store: CoreStateStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = makeStore();
  });

  it('snapshot returns a copy of all state', () => {
    store.set('a', 1);
    store.set('b', 'hello');
    const snap = store.snapshot();
    expect(snap).toEqual({ a: 1, b: 'hello' });
  });

  it('snapshot returns a deep copy (mutating it does not affect store)', () => {
    store.set('nested', { x: 1 });
    const snap = store.snapshot() as { nested: { x: number } };
    snap.nested.x = 999;
    expect(store.get<{ x: number }>('nested')?.x).toBe(1);
  });

  it('snapshot of empty store returns empty object', () => {
    expect(store.snapshot()).toEqual({});
  });

  it('restore replaces all state with the snapshot', () => {
    store.set('old', 'data');
    store.restore({ fresh: 'start', count: 42 });
    expect(store.get<string>('fresh')).toBe('start');
    expect(store.get<number>('count')).toBe(42);
    expect(store.get('old')).toBeNull();
  });

  it('restore creates a deep copy (mutating original does not affect store)', () => {
    const snap = { value: { inner: 1 } };
    store.restore(snap);
    snap.value.inner = 999;
    expect(store.get<{ inner: number }>('value')?.inner).toBe(1);
  });

  it('snapshot/restore round-trip preserves state', () => {
    store.set('key', 'original');
    const snap = store.snapshot();
    store.set('key', 'modified');
    store.restore(snap);
    expect(store.get<string>('key')).toBe('original');
  });

  it('restore with empty object clears all state', () => {
    store.set('key', 'value');
    store.restore({});
    expect(store.get('key')).toBeNull();
    expect(store.snapshot()).toEqual({});
  });

  it('restore schedules a save after debounce', () => {
    vi.useFakeTimers();
    store.restore({ data: 'test' });
    vi.advanceTimersByTime(15000);
    expect(mockWriteFileSync).toHaveBeenCalled();
    vi.useRealTimers();
  });
});

// ─── flush ──────────────────────────────────────────────────────────────────────

describe('CoreStateStore — flush', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('flush immediately writes to disk without waiting for debounce', () => {
    vi.useFakeTimers();
    const store = makeStore();
    store.set('key', 'val');
    store.flush();
    expect(mockWriteFileSync).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('flush when no pending save does not throw', () => {
    const store = makeStore();
    expect(() => store.flush()).not.toThrow();
  });

  it('flush writes current state content as JSON', () => {
    vi.useFakeTimers();
    const store = makeStore();
    store.set('name', 'test');
    store.flush();
    const writtenContent = mockWriteFileSync.mock.calls[0]?.[1] as string;
    expect(writtenContent).toContain('"name"');
    expect(writtenContent).toContain('"test"');
    vi.useRealTimers();
  });

  it('flush cancels the pending debounced timer', () => {
    vi.useFakeTimers();
    const store = makeStore();
    store.set('key', 'val');
    store.flush(); // writes immediately and cancels the pending timer
    const callsAfterFlush = mockWriteFileSync.mock.calls.length;
    vi.advanceTimersByTime(15000); // timer was cancelled — should not fire again
    expect(mockWriteFileSync.mock.calls.length).toBe(callsAfterFlush);
    vi.useRealTimers();
  });
});

// ─── Persistence error handling ────────────────────────────────────────────────

describe('CoreStateStore — persistence error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not throw when writeFileSync fails during flush', () => {
    mockReadFileSync.mockImplementationOnce(() => { throw makeEnoentError(); });
    mockWriteFileSync.mockImplementationOnce(() => { throw new Error('Disk full'); });
    const store = new CoreStateStore({ file_path: '/tmp/test-state.json', save_debounce_ms: 10000 });
    store.set('key', 'val');
    expect(() => store.flush()).not.toThrow();
  });

  it('uses atomic write pattern: writes to .tmp then renames', () => {
    vi.useFakeTimers();
    const store = makeStore();
    store.set('key', 'val');
    store.flush();
    const writePath = mockWriteFileSync.mock.calls[0]?.[0] as string;
    expect(writePath).toContain('.tmp');
    expect(mockRenameSync).toHaveBeenCalledWith(
      expect.stringContaining('.tmp'),
      expect.not.stringContaining('.tmp'),
    );
    vi.useRealTimers();
  });

  it('mkdirSync is called before write to ensure directory exists', () => {
    vi.useFakeTimers();
    const store = makeStore();
    store.set('key', 'val');
    store.flush();
    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.any(String),
      { recursive: true },
    );
    vi.useRealTimers();
  });
});

// ─── File path options ──────────────────────────────────────────────────────────

describe('CoreStateStore — file path options', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses default path (containing .goodvibes/memory/runtime-state.json) when no file_path provided', () => {
    mockReadFileSync.mockImplementationOnce(() => { throw makeEnoentError(); });
    new CoreStateStore();
    const readPath = mockReadFileSync.mock.calls[0]?.[0] as string;
    expect(readPath).toContain('.goodvibes');
    expect(readPath).toContain('runtime-state.json');
  });

  it('uses absolute file_path as-is', () => {
    mockReadFileSync.mockImplementationOnce(() => { throw makeEnoentError(); });
    new CoreStateStore({ file_path: '/absolute/path/state.json' });
    const readPath = mockReadFileSync.mock.calls[0]?.[0] as string;
    expect(readPath).toBe('/absolute/path/state.json');
  });

  it('resolves relative file_path against cwd', () => {
    mockReadFileSync.mockImplementationOnce(() => { throw makeEnoentError(); });
    new CoreStateStore({ file_path: 'relative/state.json' });
    const readPath = mockReadFileSync.mock.calls[0]?.[0] as string;
    expect(readPath).toContain('relative/state.json');
    expect(readPath).toMatch(/^\//);
  });
});
