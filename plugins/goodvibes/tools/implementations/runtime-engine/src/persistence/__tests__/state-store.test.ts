/**
 * Unit tests for persistence/state-store.ts — JsonStateStore
 *
 * Tests: constructor, initialize, set, get, delete, keys, update,
 * advisory lock acquisition/release/retry/contention, and error handling.
 *
 * Strategy:
 * - node:fs is mocked via vi.mock to avoid real filesystem I/O.
 * - Dependency modules (fs-utils, file-io, logger, utils) are mocked.
 * - vi.hoisted() ensures mock variables are available when vi.mock factories run.
 * - vi.useFakeTimers() is used where setTimeout interactions are relevant.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mock variables ────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const readFileSync = vi.fn();
  const writeFileSync = vi.fn();
  const unlinkSync = vi.fn();
  const readdirSync = vi.fn();
  const ensureDirSync = vi.fn();
  const writeJsonSync = vi.fn();
  const toErrorMessage = vi.fn((err: unknown) => String(err instanceof Error ? err.message : err));
  const loggerDebug = vi.fn();
  const loggerError = vi.fn();
  const createLogger = vi.fn().mockReturnValue({
    debug: loggerDebug,
    info: vi.fn(),
    warn: vi.fn(),
    error: loggerError,
  });
  return {
    readFileSync,
    writeFileSync,
    unlinkSync,
    readdirSync,
    ensureDirSync,
    writeJsonSync,
    toErrorMessage,
    loggerDebug,
    loggerError,
    createLogger,
  };
});

vi.mock('fs', () => ({
  readFileSync: mocks.readFileSync,
  writeFileSync: mocks.writeFileSync,
  unlinkSync: mocks.unlinkSync,
  readdirSync: mocks.readdirSync,
}));

vi.mock('../../core/fs-utils.js', () => ({ ensureDirSync: mocks.ensureDirSync }));
vi.mock('../../core/file-io.js', () => ({ writeJsonSync: mocks.writeJsonSync }));
vi.mock('../../shared/logger.js', () => ({ createLogger: mocks.createLogger }));
vi.mock('../../shared/utils.js', () => ({ toErrorMessage: mocks.toErrorMessage }));

// ─── Subject under test ───────────────────────────────────────────────────────

import { JsonStateStore } from '../state-store.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeConfig(stateDir = '.goodvibes/state') {
  return {
    schema_version: 1,
    persistence: {
      state_dir: stateDir,
      checkpoint_interval_ms: 60000,
      event_log_max_size_mb: 50,
      compact_after_hours: 24,
    },
    ipc: { socket_dir: '/tmp', connect_timeout_ms: 5000, query_timeout_ms: 5000 },
    queue: { max_size: 100, max_attempts: 3, backoff_base_ms: 100, backoff_multiplier: 2, process_interval_ms: 100 },
    workflows: { max_active: 10, max_transitions_per_workflow: 100, wrfc_max_fix_iterations: 3, fix_loop_max_attempts: 3 },
    triggers: { max_triggers: 50, default_cooldown_ms: 0, max_fires_per_session: 100, handler_timeout_ms: 5000 },
    health: { check_interval_ms: 30000, memory_warn_mb: 512, memory_critical_mb: 1024, queue_depth_warn: 50 },
    features: { ipc_enabled: true, workflows_enabled: true, agents_enabled: true, full_integration: true },
    agents: { max_concurrent: 5, session_budget: 1000, budget_thresholds: {}, default_budget: 100, max_review_iterations: 3 },
    executor: { mode: 'daemon' as const, daemon: { clear_context_after_batch: false, tmux_session_name: 'gv', tick_command: 'tick', tick_interval_ms: 60000, auto_tick: false, eval_interval_ms: 60000 }, budget: { flat_cap_usd: 10, daily_cap_usd: 50, warning_threshold: 0.8, daily_reset_hour: 0 } },
    time: undefined,
    external: undefined,
  };
}

function makeEnoentError(): NodeJS.ErrnoException {
  const e = new Error('ENOENT: no such file') as NodeJS.ErrnoException;
  e.code = 'ENOENT';
  return e;
}

function makeEexistError(): NodeJS.ErrnoException {
  const e = new Error('EEXIST: file exists') as NodeJS.ErrnoException;
  e.code = 'EEXIST';
  return e;
}

function makePermissionError(): NodeJS.ErrnoException {
  const e = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
  e.code = 'EACCES';
  return e;
}

// ─── Constructor ──────────────────────────────────────────────────────────────

describe('JsonStateStore — constructor', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves relative stateDir against projectRoot', () => {
    const store = new JsonStateStore(makeConfig('relative/state'), '/my/project');
    // Verify the resolved path is used when we call a method that calls ensureDir
    store.initialize();
    expect(mocks.ensureDirSync).toHaveBeenCalledWith('/my/project/relative/state');
  });

  it('uses process.cwd() as default projectRoot for relative path', async () => {
    const store = new JsonStateStore(makeConfig('state-dir'));
    await store.initialize();
    const calledWith = mocks.ensureDirSync.mock.calls[0]?.[0] as string;
    expect(calledWith).toContain('state-dir');
    expect(calledWith).toMatch(/^\//);
  });

  it('uses absolute stateDir as-is, ignoring projectRoot', async () => {
    const store = new JsonStateStore(makeConfig('/absolute/state'), '/irrelevant');
    await store.initialize();
    expect(mocks.ensureDirSync).toHaveBeenCalledWith('/absolute/state');
  });
});

// ─── initialize() ─────────────────────────────────────────────────────────────

describe('JsonStateStore — initialize()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls ensureDirSync on first initialize', async () => {
    const store = new JsonStateStore(makeConfig('/state'), '/project');
    await store.initialize();
    expect(mocks.ensureDirSync).toHaveBeenCalledWith('/state');
    expect(mocks.ensureDirSync).toHaveBeenCalledTimes(1);
  });

  it('is idempotent — second initialize call is a no-op', async () => {
    const store = new JsonStateStore(makeConfig('/state'), '/project');
    await store.initialize();
    await store.initialize();
    expect(mocks.ensureDirSync).toHaveBeenCalledTimes(1);
  });

  it('logs debug message after initialization', async () => {
    const store = new JsonStateStore(makeConfig('/state'), '/project');
    await store.initialize();
    expect(mocks.loggerDebug).toHaveBeenCalledWith(
      'State store initialised',
      expect.objectContaining({ stateDir: '/state' }),
    );
  });
});

// ─── set() ────────────────────────────────────────────────────────────────────

describe('JsonStateStore — set()', () => {
  let store: JsonStateStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new JsonStateStore(makeConfig('/state'), '/project');
  });

  it('calls writeJsonSync with correct path and value', async () => {
    const value = { id: 1, name: 'test' };
    await store.set('session', value);
    expect(mocks.writeJsonSync).toHaveBeenCalledWith('/state/session.json', value);
  });

  it('key maps to {stateDir}/{key}.json', async () => {
    await store.set('my.key', { data: true });
    expect(mocks.writeJsonSync).toHaveBeenCalledWith('/state/my.key.json', { data: true });
  });

  it('calls ensureDirSync before writing (defensive guard)', async () => {
    await store.set('key', 'value');
    expect(mocks.ensureDirSync).toHaveBeenCalledWith('/state');
  });

  it('logs debug on success', async () => {
    await store.set('key', 'value');
    expect(mocks.loggerDebug).toHaveBeenCalledWith('Saved state', { key: 'key' });
  });

  it('throws wrapped error when writeJsonSync fails', async () => {
    const ioErr = new Error('disk full');
    mocks.writeJsonSync.mockImplementationOnce(() => { throw ioErr; });
    mocks.toErrorMessage.mockReturnValueOnce('disk full');
    await expect(store.set('key', 'val')).rejects.toThrow(
      'StateStore.set failed for key "key": disk full',
    );
  });

  it('logs error when writeJsonSync fails', async () => {
    const ioErr = new Error('write error');
    mocks.writeJsonSync.mockImplementationOnce(() => { throw ioErr; });
    mocks.toErrorMessage.mockReturnValueOnce('write error');
    await store.set('key', 'val').catch(() => {});
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to save state',
      expect.objectContaining({ key: 'key', error: 'write error' }),
    );
  });

  it('can store complex nested objects', async () => {
    const complex = { arr: [1, 2, 3], nested: { deep: true }, nullVal: null };
    await store.set('complex', complex);
    expect(mocks.writeJsonSync).toHaveBeenCalledWith('/state/complex.json', complex);
  });

  it('can store primitive values', async () => {
    await store.set('counter', 42);
    expect(mocks.writeJsonSync).toHaveBeenCalledWith('/state/counter.json', 42);
  });
});

// ─── get() ────────────────────────────────────────────────────────────────────

describe('JsonStateStore — get()', () => {
  let store: JsonStateStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new JsonStateStore(makeConfig('/state'), '/project');
  });

  it('returns null when key does not exist (ENOENT)', async () => {
    mocks.readFileSync.mockImplementationOnce(() => { throw makeEnoentError(); });
    const result = await store.get('missing');
    expect(result).toBeNull();
  });

  it('reads from {stateDir}/{key}.json', async () => {
    mocks.readFileSync.mockReturnValueOnce(JSON.stringify({ value: 1 }));
    await store.get('session');
    expect(mocks.readFileSync).toHaveBeenCalledWith('/state/session.json', 'utf-8');
  });

  it('returns parsed JSON value', async () => {
    const data = { id: 42, name: 'alice' };
    mocks.readFileSync.mockReturnValueOnce(JSON.stringify(data));
    const result = await store.get<typeof data>('user');
    expect(result).toEqual(data);
  });

  it('preserves generic type — TypeScript type passes through', async () => {
    interface Session { phase: string; count: number }
    const session: Session = { phase: 'active', count: 5 };
    mocks.readFileSync.mockReturnValueOnce(JSON.stringify(session));
    const result = await store.get<Session>('session');
    expect(result?.phase).toBe('active');
    expect(result?.count).toBe(5);
  });

  it('throws wrapped error for non-ENOENT I/O errors', async () => {
    mocks.readFileSync.mockImplementationOnce(() => { throw makePermissionError(); });
    mocks.toErrorMessage.mockReturnValueOnce('EACCES: permission denied');
    await expect(store.get('protected')).rejects.toThrow(
      'StateStore.get failed for key "protected": EACCES: permission denied',
    );
  });

  it('throws wrapped error for corrupt JSON', async () => {
    mocks.readFileSync.mockReturnValueOnce('{ not valid json }');
    mocks.toErrorMessage.mockImplementationOnce((e: unknown) => String(e instanceof Error ? e.message : e));
    await expect(store.get('corrupt')).rejects.toThrow(
      /StateStore.get failed for key "corrupt"/,
    );
  });

  it('logs error on non-ENOENT failures', async () => {
    mocks.readFileSync.mockImplementationOnce(() => { throw makePermissionError(); });
    mocks.toErrorMessage.mockReturnValueOnce('permission denied');
    await store.get('key').catch(() => {});
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to load state',
      expect.objectContaining({ key: 'key', error: 'permission denied' }),
    );
  });

  it('does not log error on ENOENT (key missing is not an error)', async () => {
    mocks.readFileSync.mockImplementationOnce(() => { throw makeEnoentError(); });
    await store.get('missing');
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });
});

// ─── delete() ─────────────────────────────────────────────────────────────────

describe('JsonStateStore — delete()', () => {
  let store: JsonStateStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new JsonStateStore(makeConfig('/state'), '/project');
  });

  it('calls unlinkSync with correct path', async () => {
    await store.delete('session');
    expect(mocks.unlinkSync).toHaveBeenCalledWith('/state/session.json');
  });

  it('is silent (no throw) when key does not exist (ENOENT)', async () => {
    mocks.unlinkSync.mockImplementationOnce(() => { throw makeEnoentError(); });
    await expect(store.delete('missing')).resolves.toBeUndefined();
  });

  it('logs debug on successful delete', async () => {
    await store.delete('key');
    expect(mocks.loggerDebug).toHaveBeenCalledWith('Deleted state', { key: 'key' });
  });

  it('does NOT log debug when key was already gone (ENOENT)', async () => {
    mocks.unlinkSync.mockImplementationOnce(() => { throw makeEnoentError(); });
    await store.delete('missing');
    // debug is not called for ENOENT
    expect(mocks.loggerDebug).not.toHaveBeenCalledWith(
      'Deleted state',
      expect.anything(),
    );
  });

  it('throws wrapped error for non-ENOENT errors', async () => {
    mocks.unlinkSync.mockImplementationOnce(() => { throw makePermissionError(); });
    mocks.toErrorMessage.mockReturnValueOnce('permission denied');
    await expect(store.delete('protected')).rejects.toThrow(
      'StateStore.delete failed for key "protected": permission denied',
    );
  });

  it('logs error on non-ENOENT failures', async () => {
    mocks.unlinkSync.mockImplementationOnce(() => { throw makePermissionError(); });
    mocks.toErrorMessage.mockReturnValueOnce('permission denied');
    await store.delete('key').catch(() => {});
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to delete state',
      expect.objectContaining({ key: 'key', error: 'permission denied' }),
    );
  });
});

// ─── keys() ───────────────────────────────────────────────────────────────────

describe('JsonStateStore — keys()', () => {
  let store: JsonStateStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new JsonStateStore(makeConfig('/state'), '/project');
  });

  it('returns keys by stripping .json extension from directory entries', async () => {
    mocks.readdirSync.mockReturnValueOnce(['session.json', 'config.json', 'counter.json']);
    const keys = await store.keys();
    expect(keys).toEqual(expect.arrayContaining(['session', 'config', 'counter']));
    expect(keys).toHaveLength(3);
  });

  it('excludes .json.tmp files', async () => {
    mocks.readdirSync.mockReturnValueOnce(['session.json', 'session.json.tmp']);
    const keys = await store.keys();
    expect(keys).toEqual(['session']);
  });

  it('excludes non-json files', async () => {
    mocks.readdirSync.mockReturnValueOnce(['session.json', 'session.lock', 'session.json.lock']);
    const keys = await store.keys();
    expect(keys).toEqual(['session']);
  });

  it('returns empty array when directory is empty', async () => {
    mocks.readdirSync.mockReturnValueOnce([]);
    const keys = await store.keys();
    expect(keys).toEqual([]);
  });

  it('calls ensureDirSync before reading directory', async () => {
    mocks.readdirSync.mockReturnValueOnce([]);
    await store.keys();
    expect(mocks.ensureDirSync).toHaveBeenCalledWith('/state');
  });

  it('reads from stateDir', async () => {
    mocks.readdirSync.mockReturnValueOnce(['a.json']);
    await store.keys();
    expect(mocks.readdirSync).toHaveBeenCalledWith('/state');
  });

  it('throws wrapped error when readdirSync fails', async () => {
    mocks.readdirSync.mockImplementationOnce(() => { throw makePermissionError(); });
    mocks.toErrorMessage.mockReturnValueOnce('permission denied');
    await expect(store.keys()).rejects.toThrow(/StateStore.keys failed: permission denied/);
  });

  it('logs error when readdirSync fails', async () => {
    mocks.readdirSync.mockImplementationOnce(() => { throw makePermissionError(); });
    mocks.toErrorMessage.mockReturnValueOnce('permission denied');
    await store.keys().catch(() => {});
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to list state keys',
      expect.objectContaining({ error: 'permission denied' }),
    );
  });

  it('handles keys with dots in name', async () => {
    mocks.readdirSync.mockReturnValueOnce(['runtime.checkpoint.json']);
    const keys = await store.keys();
    expect(keys).toEqual(['runtime.checkpoint']);
  });
});

// ─── update() — read-modify-write with advisory lock ─────────────────────────

describe('JsonStateStore — update()', () => {
  let store: JsonStateStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new JsonStateStore(makeConfig('/state'), '/project');
  });

  it('acquires lockfile before read and releases after write', async () => {
    // Simulate existing state
    mocks.readFileSync.mockReturnValueOnce(JSON.stringify(5));
    const order: string[] = [];
    mocks.writeFileSync.mockImplementationOnce((_path: string, _content: string, opts: unknown) => {
      // First writeFileSync call is the lock acquisition
      const flag = (opts as { flag?: string })?.flag;
      if (flag === 'wx') order.push('lock-acquired');
    });
    mocks.writeJsonSync.mockImplementationOnce(() => order.push('state-written'));
    mocks.unlinkSync.mockImplementationOnce(() => order.push('lock-released'));

    await store.update<number>('counter', (current) => (current ?? 0) + 1);

    expect(order).toEqual(['lock-acquired', 'state-written', 'lock-released']);
  });

  it('passes current value to updater', async () => {
    const currentData = { count: 10 };
    mocks.readFileSync.mockReturnValueOnce(JSON.stringify(currentData));
    const updater = vi.fn((val: typeof currentData | null) => ({ count: (val?.count ?? 0) + 1 }));
    await store.update('counter', updater);
    expect(updater).toHaveBeenCalledWith(currentData);
  });

  it('passes null to updater when key does not exist', async () => {
    mocks.readFileSync.mockImplementationOnce(() => { throw makeEnoentError(); });
    const updater = vi.fn((val: null) => ({ initialized: true, val }));
    await store.update('new-key', updater);
    expect(updater).toHaveBeenCalledWith(null);
  });

  it('saves the value returned by updater', async () => {
    mocks.readFileSync.mockReturnValueOnce(JSON.stringify(0));
    await store.update<number>('counter', () => 99);
    expect(mocks.writeJsonSync).toHaveBeenCalledWith('/state/counter.json', 99);
  });

  it('releases lock even when updater throws', async () => {
    mocks.readFileSync.mockReturnValueOnce(JSON.stringify({}));
    const updater = () => { throw new Error('updater failed'); };
    await expect(store.update('key', updater)).rejects.toThrow('updater failed');
    // Lock released via unlinkSync
    expect(mocks.unlinkSync).toHaveBeenCalled();
  });

  it('releases lock even when set() throws', async () => {
    mocks.readFileSync.mockReturnValueOnce(JSON.stringify({}));
    mocks.writeJsonSync.mockImplementationOnce(() => { throw new Error('write failed'); });
    mocks.toErrorMessage.mockReturnValueOnce('write failed');
    await expect(store.update('key', () => ({}))).rejects.toThrow();
    expect(mocks.unlinkSync).toHaveBeenCalled();
  });

  it('acquires lock with wx flag (exclusive create)', async () => {
    mocks.readFileSync.mockReturnValueOnce(JSON.stringify({}));
    await store.update('key', (v) => v ?? {});
    const lockWriteCall = mocks.writeFileSync.mock.calls.find(
      (call) => (call[2] as { flag?: string })?.flag === 'wx',
    );
    expect(lockWriteCall).toBeDefined();
  });

  it('writes process.pid as lockfile content', async () => {
    mocks.readFileSync.mockReturnValueOnce(JSON.stringify({}));
    await store.update('key', (v) => v ?? {});
    const lockCall = mocks.writeFileSync.mock.calls.find(
      (call) => (call[2] as { flag?: string })?.flag === 'wx',
    );
    expect(lockCall?.[1]).toBe(String(process.pid));
  });

  it('lock path is {statePath}.lock', async () => {
    mocks.readFileSync.mockReturnValueOnce(JSON.stringify({}));
    await store.update('mykey', (v) => v ?? {});
    const lockCall = mocks.writeFileSync.mock.calls.find(
      (call) => (call[2] as { flag?: string })?.flag === 'wx',
    );
    expect(lockCall?.[0]).toBe('/state/mykey.json.lock');
    // And unlinkSync is called on the same path
    expect(mocks.unlinkSync).toHaveBeenCalledWith('/state/mykey.json.lock');
  });
});

// ─── Lock acquisition — retry and failure ────────────────────────────────────

describe('JsonStateStore — lock acquisition', () => {
  let store: JsonStateStore;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    store = new JsonStateStore(makeConfig('/state'), '/project');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('succeeds on first attempt when no contention', async () => {
    mocks.readFileSync.mockReturnValueOnce(JSON.stringify({}));
    // writeFileSync for lock does not throw -> success
    await expect(store.update('key', (v) => v ?? {})).resolves.toBeUndefined();
  });

  it('retries on EEXIST (lock contention) and succeeds on second attempt', async () => {
    mocks.readFileSync.mockReturnValueOnce(JSON.stringify({}));
    // First lock attempt fails with EEXIST, second succeeds
    mocks.writeFileSync
      .mockImplementationOnce((_: unknown, __: unknown, opts: unknown) => {
        if ((opts as { flag?: string })?.flag === 'wx') throw makeEexistError();
      })
      .mockImplementationOnce(() => {}); // second attempt succeeds

    const updatePromise = store.update('key', (v) => v ?? {});
    // Advance timers for the backoff delay (50ms default)
    await vi.advanceTimersByTimeAsync(100);
    await expect(updatePromise).resolves.toBeUndefined();
  });

  it('retries on EEXIST up to maxAttempts before throwing', async () => {
    // All 3 lock attempts fail with EEXIST
    mocks.writeFileSync.mockImplementation((_: unknown, __: unknown, opts: unknown) => {
      if ((opts as { flag?: string })?.flag === 'wx') throw makeEexistError();
    });

    // Run update and advance timers concurrently to avoid unhandled rejection.
    // The rejection is caught by expect().rejects once both settle.
    const [, updateResult] = await Promise.allSettled([
      vi.advanceTimersByTimeAsync(200),
      store.update('key', (v) => v ?? {}),
    ]);
    expect(updateResult.status).toBe('rejected');
    expect((updateResult as PromiseRejectedResult).reason).toMatchObject({
      message: expect.stringMatching(/StateStore: could not acquire lock.*after 3 attempts/),
    });
  });

  it('propagates non-EEXIST errors immediately (no retry)', async () => {
    const permErr = makePermissionError();
    mocks.writeFileSync.mockImplementationOnce((_: unknown, __: unknown, opts: unknown) => {
      if ((opts as { flag?: string })?.flag === 'wx') throw permErr;
    });

    const updatePromise = store.update('key', (v) => v ?? {});
    await expect(updatePromise).rejects.toBe(permErr);
    // Only one writeFileSync attempt for the lock (no retry)
    const lockAttempts = mocks.writeFileSync.mock.calls.filter(
      (call) => (call[2] as { flag?: string })?.flag === 'wx',
    );
    expect(lockAttempts).toHaveLength(1);
  });

  it('logs debug message on lock contention retry', async () => {
    mocks.readFileSync.mockReturnValueOnce(JSON.stringify({}));
    // Fail once, succeed second
    let lockCallCount = 0;
    mocks.writeFileSync.mockImplementation((_: unknown, __: unknown, opts: unknown) => {
      if ((opts as { flag?: string })?.flag === 'wx') {
        lockCallCount++;
        if (lockCallCount === 1) throw makeEexistError();
      }
    });

    const updatePromise = store.update('key', (v) => v ?? {});
    await vi.advanceTimersByTimeAsync(100);
    await updatePromise;
    expect(mocks.loggerDebug).toHaveBeenCalledWith(
      'Lock contention — retrying',
      expect.objectContaining({ attempt: 1, backoffMs: 50 }),
    );
  });
});

// ─── Lock release — releaseLock ────────────────────────────────────────────────

describe('JsonStateStore — lock release', () => {
  let store: JsonStateStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new JsonStateStore(makeConfig('/state'), '/project');
  });

  it('calls unlinkSync to release the lock after successful update', async () => {
    mocks.readFileSync.mockReturnValueOnce(JSON.stringify({}));
    await store.update('key', (v) => v ?? {});
    expect(mocks.unlinkSync).toHaveBeenCalledWith('/state/key.json.lock');
  });

  it('swallows ENOENT from unlinkSync (lock already gone is not an error)', async () => {
    mocks.readFileSync.mockReturnValueOnce(JSON.stringify({}));
    mocks.unlinkSync.mockImplementationOnce(() => { throw makeEnoentError(); });
    await expect(store.update('key', (v) => v ?? {})).resolves.toBeUndefined();
  });

  it('swallows arbitrary errors from unlinkSync (do not mask original exception)', async () => {
    mocks.readFileSync.mockReturnValueOnce(JSON.stringify({}));
    mocks.unlinkSync.mockImplementationOnce(() => { throw new Error('unlink failed unexpectedly'); });
    await expect(store.update('key', (v) => v ?? {})).resolves.toBeUndefined();
  });

  it('swallows unlinkSync errors even when update itself succeeded', async () => {
    mocks.readFileSync.mockReturnValueOnce(JSON.stringify({ x: 1 }));
    mocks.unlinkSync.mockImplementationOnce(() => { throw new Error('unlink error'); });
    // Should NOT propagate the unlink error
    await expect(store.update('key', (v) => v ?? {})).resolves.toBeUndefined();
  });
});
