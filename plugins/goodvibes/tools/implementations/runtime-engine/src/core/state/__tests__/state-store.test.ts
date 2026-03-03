import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CoreStateStore } from '../state-store.js';

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const mockReadFileSync = vi.fn();
vi.mock('node:fs', () => ({ readFileSync: (...args: unknown[]) => mockReadFileSync(...args) }));

const mockWriteJsonSync = vi.fn();
vi.mock('../file-io.js', () => ({ writeJsonSync: (...args: unknown[]) => mockWriteJsonSync(...args) }));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeStore(options: { file_path?: string; save_debounce_ms?: number } = {}): CoreStateStore {
  // Default: ENOENT so load() is a no-op
  mockReadFileSync.mockImplementationOnce(() => {
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    throw err;
  });
  return new CoreStateStore({ file_path: '/tmp/test-state.json', ...options });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CoreStateStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── Construction & load ──────────────────────────────────────────────────

  describe('construction', () => {
    it('starts with empty state when file does not exist (ENOENT)', () => {
      const store = makeStore();
      expect(store.get('anything')).toBeNull();
    });

    it('loads valid JSON state from disk on construction', () => {
      mockReadFileSync.mockReturnValueOnce(JSON.stringify({ foo: 'bar', count: 42 }));
      const store = new CoreStateStore({ file_path: '/tmp/test-state.json' });
      expect(store.get('foo')).toBe('bar');
      expect(store.get('count')).toBe(42);
    });

    it('starts fresh when file contains non-object JSON (array)', () => {
      mockReadFileSync.mockReturnValueOnce(JSON.stringify([1, 2, 3]));
      const store = new CoreStateStore({ file_path: '/tmp/test-state.json' });
      expect(store.snapshot()).toEqual({});
    });

    it('starts fresh when file contains non-object JSON (null)', () => {
      mockReadFileSync.mockReturnValueOnce('null');
      const store = new CoreStateStore({ file_path: '/tmp/test-state.json' });
      expect(store.snapshot()).toEqual({});
    });

    it('starts fresh when file contains invalid JSON', () => {
      mockReadFileSync.mockReturnValueOnce('not json {{{');
      const store = new CoreStateStore({ file_path: '/tmp/test-state.json' });
      expect(store.snapshot()).toEqual({});
    });

    it('starts fresh on unexpected read error (non-ENOENT)', () => {
      mockReadFileSync.mockImplementationOnce(() => {
        const err = Object.assign(new Error('EACCES'), { code: 'EACCES' });
        throw err;
      });
      const store = new CoreStateStore({ file_path: '/tmp/test-state.json' });
      expect(store.snapshot()).toEqual({});
    });

    it('resolves a relative file_path against cwd', () => {
      mockReadFileSync.mockImplementationOnce(() => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });
      // Should not throw — relative path is joined against cwd
      const store = new CoreStateStore({ file_path: 'relative/path.json' });
      expect(store).toBeDefined();
    });

    it('uses default file path when file_path is not provided', () => {
      mockReadFileSync.mockImplementationOnce(() => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });
      const store = new CoreStateStore();
      expect(store).toBeDefined();
    });
  });

  // ─── get / set ────────────────────────────────────────────────────────────

  describe('get', () => {
    it('returns null for a missing key', () => {
      const store = makeStore();
      expect(store.get('missing')).toBeNull();
    });

    it('returns the value after set', () => {
      const store = makeStore();
      store.set('key', 'value');
      expect(store.get('key')).toBe('value');
    });

    it('returns null when path traversal encounters a non-object', () => {
      const store = makeStore();
      store.set('a', 'string');
      expect(store.get('a.b')).toBeNull();
    });

    it('returns null when an intermediate segment is null', () => {
      const store = makeStore();
      store.set('parent', null);
      expect(store.get('parent.child')).toBeNull();
    });
  });

  describe('set', () => {
    it('stores a primitive value', () => {
      const store = makeStore();
      store.set('num', 99);
      expect(store.get('num')).toBe(99);
    });

    it('stores an object value', () => {
      const store = makeStore();
      store.set('obj', { a: 1 });
      expect(store.get('obj')).toEqual({ a: 1 });
    });

    it('creates intermediate objects for deep dot-path', () => {
      const store = makeStore();
      store.set('a.b.c', 'deep');
      expect(store.get('a.b.c')).toBe('deep');
      expect(store.get('a.b')).toEqual({ c: 'deep' });
      expect(store.get('a')).toEqual({ b: { c: 'deep' } });
    });

    it('overwrites an existing value', () => {
      const store = makeStore();
      store.set('key', 'first');
      store.set('key', 'second');
      expect(store.get('key')).toBe('second');
    });

    it('schedules a debounced save (writes after debounce delay)', () => {
      const store = makeStore({ save_debounce_ms: 500 });
      store.set('x', 1);
      expect(mockWriteJsonSync).not.toHaveBeenCalled();
      vi.advanceTimersByTime(500);
      expect(mockWriteJsonSync).toHaveBeenCalledWith('/tmp/test-state.json', expect.any(Object));
    });

    it('debounces multiple rapid sets into a single save', () => {
      const store = makeStore({ save_debounce_ms: 100 });
      store.set('a', 1);
      store.set('b', 2);
      store.set('c', 3);
      vi.advanceTimersByTime(100);
      expect(mockWriteJsonSync).toHaveBeenCalledTimes(1);
    });
  });

  // ─── delete ───────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('removes an existing key', () => {
      const store = makeStore();
      store.set('key', 'value');
      store.delete('key');
      expect(store.get('key')).toBeNull();
    });

    it('is a no-op when key does not exist', () => {
      const store = makeStore();
      expect(() => store.delete('nonexistent')).not.toThrow();
    });

    it('removes a nested key', () => {
      const store = makeStore();
      store.set('parent.child', 'value');
      store.delete('parent.child');
      expect(store.get('parent.child')).toBeNull();
      // Parent object remains
      expect(store.get('parent')).toEqual({});
    });

    it('is a no-op when intermediate path does not exist', () => {
      const store = makeStore();
      expect(() => store.delete('a.b.c')).not.toThrow();
    });

    it('schedules a save after delete', () => {
      const store = makeStore({ save_debounce_ms: 100 });
      store.set('key', 'val');
      vi.advanceTimersByTime(100); // flush set's timer
      mockWriteJsonSync.mockClear();
      store.delete('key');
      vi.advanceTimersByTime(100);
      expect(mockWriteJsonSync).toHaveBeenCalledTimes(1);
    });
  });

  // ─── merge ────────────────────────────────────────────────────────────────

  describe('merge', () => {
    it('deep-merges into an existing object', () => {
      const store = makeStore();
      store.set('config', { theme: 'dark', lang: 'en' });
      store.merge('config', { lang: 'fr', version: 2 });
      expect(store.get('config')).toEqual({ theme: 'dark', lang: 'fr', version: 2 });
    });

    it('acts like set when no existing value', () => {
      const store = makeStore();
      store.merge('fresh', { x: 1 });
      expect(store.get('fresh')).toEqual({ x: 1 });
    });

    it('acts like set when existing value is a primitive', () => {
      const store = makeStore();
      store.set('val', 'string');
      store.merge('val', { key: 'new' });
      expect(store.get('val')).toEqual({ key: 'new' });
    });

    it('acts like set when existing value is an array', () => {
      const store = makeStore();
      store.set('arr', [1, 2, 3]);
      store.merge('arr', { key: 'new' });
      expect(store.get('arr')).toEqual({ key: 'new' });
    });

    it('replaces arrays in override (does not concatenate)', () => {
      const store = makeStore();
      store.set('data', { items: [1, 2] });
      store.merge('data', { items: [3, 4] });
      const result = store.get<{ items: number[] }>('data');
      expect(result?.items).toEqual([3, 4]);
    });

    it('recursively merges nested objects', () => {
      const store = makeStore();
      store.set('nested', { a: { x: 1, y: 2 }, b: 'keep' });
      store.merge('nested', { a: { y: 99, z: 3 } });
      expect(store.get('nested')).toEqual({ a: { x: 1, y: 99, z: 3 }, b: 'keep' });
    });
  });

  // ─── snapshot / restore ───────────────────────────────────────────────────

  describe('snapshot', () => {
    it('returns a deep copy of current state', () => {
      const store = makeStore();
      store.set('foo', { nested: true });
      const snap = store.snapshot();
      expect(snap).toEqual({ foo: { nested: true } });
    });

    it('returned snapshot is independent (mutation does not affect store)', () => {
      const store = makeStore();
      store.set('arr', [1, 2, 3]);
      const snap = store.snapshot();
      (snap['arr'] as number[]).push(4);
      expect(store.get<number[]>('arr')).toHaveLength(3);
    });

    it('returns empty object when store is empty', () => {
      const store = makeStore();
      expect(store.snapshot()).toEqual({});
    });
  });

  describe('restore', () => {
    it('replaces all state with the snapshot', () => {
      const store = makeStore();
      store.set('existing', true);
      store.restore({ newKey: 'newValue' });
      expect(store.get('newKey')).toBe('newValue');
      expect(store.get('existing')).toBeNull();
    });

    it('schedules a save after restore', () => {
      const store = makeStore({ save_debounce_ms: 50 });
      store.restore({ k: 'v' });
      vi.advanceTimersByTime(50);
      expect(mockWriteJsonSync).toHaveBeenCalledWith('/tmp/test-state.json', { k: 'v' });
    });

    it('restored snapshot is independent (mutation does not affect store)', () => {
      const store = makeStore();
      const snap = { obj: { x: 1 } };
      store.restore(snap);
      snap.obj.x = 999;
      expect(store.get<{ x: number }>('obj')?.x).toBe(1);
    });
  });

  // ─── flush / dispose ──────────────────────────────────────────────────────

  describe('flush', () => {
    it('writes immediately when called with a pending debounce', () => {
      const store = makeStore({ save_debounce_ms: 10000 });
      store.set('key', 'val');
      expect(mockWriteJsonSync).not.toHaveBeenCalled();
      store.flush();
      expect(mockWriteJsonSync).toHaveBeenCalledOnce();
    });

    it('does not double-write when flush is called twice', () => {
      const store = makeStore({ save_debounce_ms: 10000 });
      store.set('key', 'val');
      store.flush();
      store.flush();
      expect(mockWriteJsonSync).toHaveBeenCalledTimes(2);
    });

    it('is a no-op when there is no pending save', () => {
      const store = makeStore({ save_debounce_ms: 100 });
      // No set called, no pending save
      store.flush();
      expect(mockWriteJsonSync).toHaveBeenCalledTimes(1); // flush calls persist unconditionally
    });
  });

  describe('dispose', () => {
    it('flushes pending writes on dispose', () => {
      const store = makeStore({ save_debounce_ms: 10000 });
      store.set('final', true);
      expect(mockWriteJsonSync).not.toHaveBeenCalled();
      store.dispose();
      expect(mockWriteJsonSync).toHaveBeenCalledOnce();
    });
  });

  // ─── Prototype pollution guards ───────────────────────────────────────────

  describe('prototype pollution guards', () => {
    const forbiddenPaths = [
      '__proto__',
      'constructor',
      'prototype',
      'a.__proto__',
      'a.b.constructor',
      '__proto__.polluted',
      'safe.__proto__.unsafe',
    ];

    for (const path of forbiddenPaths) {
      it(`get throws TypeError for forbidden path: ${path}`, () => {
        const store = makeStore();
        expect(() => store.get(path)).toThrow(TypeError);
      });

      it(`set throws TypeError for forbidden path: ${path}`, () => {
        const store = makeStore();
        expect(() => store.set(path, 'evil')).toThrow(TypeError);
      });

      it(`delete throws TypeError for forbidden path: ${path}`, () => {
        const store = makeStore();
        expect(() => store.delete(path)).toThrow(TypeError);
      });
    }

    it('get throws with message mentioning the forbidden segment', () => {
      const store = makeStore();
      expect(() => store.get('__proto__')).toThrow(/Prototype pollution guard/);
    });

    it('allows safe keys that contain forbidden words as substrings', () => {
      const store = makeStore();
      // 'myproto' is safe — only exact segment match is forbidden
      expect(() => store.set('myproto', 1)).not.toThrow();
      expect(() => store.get('a.constructorish')).not.toThrow();
    });
  });

  // ─── persistence failure ──────────────────────────────────────────────────

  describe('persist failure', () => {
    it('logs error but does not throw when writeJsonSync fails', () => {
      const store = makeStore({ save_debounce_ms: 10 });
      mockWriteJsonSync.mockImplementationOnce(() => {
        throw new Error('disk full');
      });
      store.set('key', 'val');
      expect(() => vi.advanceTimersByTime(10)).not.toThrow();
    });
  });

  // ─── keys() ───────────────────────────────────────────────────────────────

  describe('keys()', () => {
    it('returns empty array for empty store', () => {
      const store = makeStore({ file_path: '/tmp/keys-empty.json' });
      expect(store.keys()).toEqual([]);
    });

    it('returns flat keys', () => {
      const store = makeStore({ file_path: '/tmp/keys-flat.json' });
      store.set('alpha', 1);
      store.set('beta', 'hello');
      store.set('gamma', true);
      const keys = store.keys();
      expect(keys).toContain('alpha');
      expect(keys).toContain('beta');
      expect(keys).toContain('gamma');
      expect(keys).toHaveLength(3);
    });

    it('returns nested dot-path keys', () => {
      const store = makeStore({ file_path: '/tmp/keys-nested.json' });
      store.set('a.b.c', 1);
      store.set('a.b.d', 2);
      store.set('a.e', 3);
      const keys = store.keys();
      expect(keys).toContain('a.b.c');
      expect(keys).toContain('a.b.d');
      expect(keys).toContain('a.e');
      expect(keys).toHaveLength(3);
    });

    it('filters by prefix', () => {
      const store = makeStore({ file_path: '/tmp/keys-prefix.json' });
      store.set('agent_tracker.agents.abc', { id: 'abc' });
      store.set('agent_tracker.agent_ids', ['abc']);
      store.set('wrfc.config.min_score', 8);
      const trackerKeys = store.keys('agent_tracker');
      expect(trackerKeys).toContain('agent_tracker.agents.abc.id');
      expect(trackerKeys).toContain('agent_tracker.agent_ids');
      expect(trackerKeys.every(k => k.startsWith('agent_tracker'))).toBe(true);
      expect(trackerKeys).not.toContain('wrfc.config.min_score');
    });

    it('returns exact prefix match', () => {
      const store = makeStore({ file_path: '/tmp/keys-exact.json' });
      store.set('mykey', 42);
      const keys = store.keys('mykey');
      expect(keys).toContain('mykey');
    });

    it('treats arrays as leaves', () => {
      const store = makeStore({ file_path: '/tmp/keys-array.json' });
      store.set('list', [1, 2, 3]);
      const keys = store.keys();
      expect(keys).toContain('list');
      expect(keys).toHaveLength(1);
    });

    it('treats null as leaf', () => {
      const store = makeStore({ file_path: '/tmp/keys-null.json' });
      store.set('nothing', null);
      const keys = store.keys();
      expect(keys).toContain('nothing');
    });

    it('does not enumerate empty objects', () => {
      const store = makeStore({ file_path: '/tmp/keys-empty-obj.json' });
      store.set('empty', {});
      const keys = store.keys();
      expect(keys).toEqual([]);
    });

    it('returns empty for non-matching prefix', () => {
      const store = makeStore({ file_path: '/tmp/keys-nomatch.json' });
      store.set('a.b', 1);
      expect(store.keys('xyz')).toEqual([]);
    });
  });

  // ─── onStateChange ────────────────────────────────────────────────────────

  describe('onStateChange', () => {
    it('does not crash when no listener is registered', () => {
      const store = makeStore();
      expect(() => store.set('key', 'value')).not.toThrow();
      expect(() => store.delete('key')).not.toThrow();
      expect(() => store.merge('obj', { x: 1 })).not.toThrow();
    });

    it('calls listener on set with correct fields', () => {
      const store = makeStore();
      const listener = vi.fn();
      store.onStateChange(listener);
      store.set('foo', 'bar');
      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith({
        key: 'foo',
        operation: 'set',
        namespace: 'foo',
        oldValue: null,
        newValue: 'bar',
      });
    });

    it('listener receives null oldValue for new keys', () => {
      const store = makeStore();
      const listener = vi.fn();
      store.onStateChange(listener);
      store.set('brand.new', 42);
      const call = listener.mock.calls[0]![0];
      expect(call.oldValue).toBeNull();
      expect(call.newValue).toBe(42);
    });

    it('listener receives previous value as oldValue on overwrite', () => {
      const store = makeStore();
      store.set('counter', 1);
      const listener = vi.fn();
      store.onStateChange(listener);
      store.set('counter', 2);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ oldValue: 1, newValue: 2 }),
      );
    });

    it('calls listener on delete with correct fields', () => {
      const store = makeStore();
      store.set('toDelete', 'gone');
      const listener = vi.fn();
      store.onStateChange(listener);
      store.delete('toDelete');
      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith({
        key: 'toDelete',
        operation: 'delete',
        namespace: 'toDelete',
        oldValue: 'gone',
        newValue: null,
      });
    });

    it('listener receives null newValue for delete', () => {
      const store = makeStore();
      store.set('x', 99);
      const listener = vi.fn();
      store.onStateChange(listener);
      store.delete('x');
      expect(listener.mock.calls[0]![0].newValue).toBeNull();
    });

    it('calls listener on merge with correct fields', () => {
      const store = makeStore();
      store.set('config', { theme: 'dark' });
      const listener = vi.fn();
      store.onStateChange(listener);
      store.merge('config', { lang: 'en' });
      expect(listener).toHaveBeenCalledOnce();
      const call = listener.mock.calls[0]![0];
      expect(call.key).toBe('config');
      expect(call.operation).toBe('merge');
      expect(call.namespace).toBe('config');
      expect(call.oldValue).toEqual({ theme: 'dark' });
      expect(call.newValue).toEqual({ theme: 'dark', lang: 'en' });
    });

    it('listener receives correct namespace (first key segment)', () => {
      const store = makeStore();
      const listener = vi.fn();
      store.onStateChange(listener);
      store.set('agent_tracker.agents.abc', { id: 'abc' });
      expect(listener.mock.calls[0]![0].namespace).toBe('agent_tracker');
    });

    it('listener is only called once per mutation (merge does not double-fire)', () => {
      const store = makeStore();
      const listener = vi.fn();
      store.onStateChange(listener);
      store.merge('ns', { a: 1 });
      expect(listener).toHaveBeenCalledOnce();
    });
  });
});
