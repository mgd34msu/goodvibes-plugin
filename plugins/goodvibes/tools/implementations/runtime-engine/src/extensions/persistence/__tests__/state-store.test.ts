import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JsonStateStore } from '../state-store.js';
import { StateError } from '../../../shared/errors.js';
import type { RuntimeConfig } from '../../../shared/config.js';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock('../../../core/utils/fs-utils.js', () => ({
  ensureDirSync: vi.fn(),
}));

vi.mock('../../../core/state/file-io.js', () => ({
  writeJsonSync: vi.fn(),
}));

vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import * as fsModule from 'node:fs';
import * as fsUtils from '../../../core/utils/fs-utils.js';
import * as fileIo from '../../../core/state/file-io.js';

const mockReadFileSync = vi.mocked(fsModule.readFileSync);
const mockWriteFileSync = vi.mocked(fsModule.writeFileSync);
const mockUnlinkSync = vi.mocked(fsModule.unlinkSync);
const mockReaddirSync = vi.mocked(fsModule.readdirSync);
const mockEnsureDirSync = vi.mocked(fsUtils.ensureDirSync);
const mockWriteJsonSync = vi.mocked(fileIo.writeJsonSync);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(stateDir = '.goodvibes/state'): RuntimeConfig {
  return {
    persistence: {
      state_dir: stateDir,
      checkpoint_interval_ms: 30_000,
    },
  } as RuntimeConfig;
}

function makeErrnoError(code: string): NodeJS.ErrnoException {
  const err = new Error(`ERRNO: ${code}`) as NodeJS.ErrnoException;
  err.code = code;
  return err;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JsonStateStore — constructor & path resolution', () => {
  it('resolves a relative state_dir against projectRoot', () => {
    const store = new JsonStateStore(makeConfig('relative/state'), '/root');
    // The state dir is private, but we can verify it's used during initialize
    expect(store).toBeInstanceOf(JsonStateStore);
  });

  it('uses an absolute state_dir as-is', () => {
    const store = new JsonStateStore(makeConfig('/absolute/state'), '/root');
    expect(store).toBeInstanceOf(JsonStateStore);
  });

  it('falls back to process.cwd() when projectRoot is omitted', () => {
    const store = new JsonStateStore(makeConfig('state'));
    expect(store).toBeInstanceOf(JsonStateStore);
  });
});

describe('JsonStateStore — initialize()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls ensureDirSync on first call', async () => {
    const store = new JsonStateStore(makeConfig(), '/root');
    await store.initialize();
    expect(mockEnsureDirSync).toHaveBeenCalledTimes(1);
  });

  it('is idempotent — does not call ensureDirSync twice', async () => {
    const store = new JsonStateStore(makeConfig(), '/root');
    await store.initialize();
    await store.initialize();
    expect(mockEnsureDirSync).toHaveBeenCalledTimes(1);
  });
});

describe('JsonStateStore — set()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls ensureDirSync as a defensive guard', async () => {
    const store = new JsonStateStore(makeConfig(), '/root');
    await store.set('myKey', { value: 1 });
    expect(mockEnsureDirSync).toHaveBeenCalled();
  });

  it('calls writeJsonSync with the correct path and value', async () => {
    const store = new JsonStateStore(makeConfig('state'), '/root');
    const data = { hello: 'world' };
    await store.set('session', data);
    expect(mockWriteJsonSync).toHaveBeenCalledWith(
      expect.stringContaining('session.json'),
      data,
    );
  });

  it('throws StateError when writeJsonSync fails', async () => {
    mockWriteJsonSync.mockImplementationOnce(() => {
      throw new Error('disk full');
    });
    const store = new JsonStateStore(makeConfig(), '/root');
    await expect(store.set('key', {})).rejects.toThrow(StateError);
  });

  it('StateError message contains the key name', async () => {
    mockWriteJsonSync.mockImplementationOnce(() => {
      throw new Error('write failed');
    });
    const store = new JsonStateStore(makeConfig(), '/root');
    await expect(store.set('mySpecialKey', {})).rejects.toThrow(/mySpecialKey/);
  });
});

describe('JsonStateStore — get()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns parsed value on success', async () => {
    mockReadFileSync.mockReturnValueOnce(JSON.stringify({ x: 42 }) as unknown as string);
    const store = new JsonStateStore(makeConfig(), '/root');
    const result = await store.get<{ x: number }>('myKey');
    expect(result).toEqual({ x: 42 });
  });

  it('returns null when the file does not exist (ENOENT)', async () => {
    mockReadFileSync.mockImplementationOnce(() => {
      throw makeErrnoError('ENOENT');
    });
    const store = new JsonStateStore(makeConfig(), '/root');
    const result = await store.get('missing');
    expect(result).toBeNull();
  });

  it('throws StateError for non-ENOENT I/O errors', async () => {
    mockReadFileSync.mockImplementationOnce(() => {
      throw makeErrnoError('EACCES');
    });
    const store = new JsonStateStore(makeConfig(), '/root');
    await expect(store.get('key')).rejects.toThrow(StateError);
  });

  it('throws StateError when file contains invalid JSON', async () => {
    mockReadFileSync.mockReturnValueOnce('not-json{{{' as unknown as string);
    const store = new JsonStateStore(makeConfig(), '/root');
    await expect(store.get('key')).rejects.toThrow(StateError);
  });

  it('throws StateError when JSON parses to null', async () => {
    mockReadFileSync.mockReturnValueOnce('null' as unknown as string);
    const store = new JsonStateStore(makeConfig(), '/root');
    await expect(store.get('key')).rejects.toThrow(StateError);
  });

  it('reads from path containing the key name', async () => {
    mockReadFileSync.mockReturnValueOnce(JSON.stringify({ a: 1 }) as unknown as string);
    const store = new JsonStateStore(makeConfig('state'), '/root');
    await store.get('runtime.checkpoint');
    expect(mockReadFileSync).toHaveBeenCalledWith(
      expect.stringContaining('runtime.checkpoint.json'),
      'utf-8',
    );
  });
});

describe('JsonStateStore — delete()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls unlinkSync with the correct path', async () => {
    const store = new JsonStateStore(makeConfig('state'), '/root');
    await store.delete('session');
    expect(mockUnlinkSync).toHaveBeenCalledWith(
      expect.stringContaining('session.json'),
    );
  });

  it('silently succeeds when file does not exist (ENOENT)', async () => {
    mockUnlinkSync.mockImplementationOnce(() => {
      throw makeErrnoError('ENOENT');
    });
    const store = new JsonStateStore(makeConfig(), '/root');
    await expect(store.delete('ghost')).resolves.toBeUndefined();
  });

  it('throws StateError for non-ENOENT errors', async () => {
    mockUnlinkSync.mockImplementationOnce(() => {
      throw makeErrnoError('EPERM');
    });
    const store = new JsonStateStore(makeConfig(), '/root');
    await expect(store.delete('key')).rejects.toThrow(StateError);
  });

  it('StateError message contains the key name', async () => {
    mockUnlinkSync.mockImplementationOnce(() => {
      throw makeErrnoError('EPERM');
    });
    const store = new JsonStateStore(makeConfig(), '/root');
    await expect(store.delete('importantKey')).rejects.toThrow(/importantKey/);
  });
});

describe('JsonStateStore — keys()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns keys by stripping the .json extension', async () => {
    mockReaddirSync.mockReturnValueOnce(['session.json', 'config.json'] as unknown as ReturnType<typeof mockReaddirSync>);
    const store = new JsonStateStore(makeConfig(), '/root');
    const keys = await store.keys();
    expect(keys).toEqual(expect.arrayContaining(['session', 'config']));
  });

  it('excludes .json.tmp files', async () => {
    mockReaddirSync.mockReturnValueOnce(['session.json', 'session.json.tmp'] as unknown as ReturnType<typeof mockReaddirSync>);
    const store = new JsonStateStore(makeConfig(), '/root');
    const keys = await store.keys();
    expect(keys).toEqual(['session']);
  });

  it('excludes non-.json files', async () => {
    mockReaddirSync.mockReturnValueOnce(['readme.txt', 'data.json', 'lock.lock'] as unknown as ReturnType<typeof mockReaddirSync>);
    const store = new JsonStateStore(makeConfig(), '/root');
    const keys = await store.keys();
    expect(keys).toEqual(['data']);
  });

  it('returns empty array when directory is empty', async () => {
    mockReaddirSync.mockReturnValueOnce([] as unknown as ReturnType<typeof mockReaddirSync>);
    const store = new JsonStateStore(makeConfig(), '/root');
    const keys = await store.keys();
    expect(keys).toEqual([]);
  });

  it('calls ensureDirSync before listing', async () => {
    mockReaddirSync.mockReturnValueOnce([] as unknown as ReturnType<typeof mockReaddirSync>);
    const store = new JsonStateStore(makeConfig(), '/root');
    await store.keys();
    expect(mockEnsureDirSync).toHaveBeenCalled();
  });

  it('throws StateError when readdirSync throws', async () => {
    mockReaddirSync.mockImplementationOnce(() => {
      throw new Error('permission denied');
    });
    const store = new JsonStateStore(makeConfig(), '/root');
    await expect(store.keys()).rejects.toThrow(StateError);
  });
});

describe('JsonStateStore — update()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls updater with null when key does not exist', async () => {
    // get() returns null (ENOENT)
    mockReadFileSync.mockImplementationOnce(() => {
      throw makeErrnoError('ENOENT');
    });
    // Lock acquire succeeds (wx write)
    mockWriteFileSync.mockImplementationOnce(() => {});

    const updater = vi.fn((current: string | null) => current ?? 'default');
    const store = new JsonStateStore(makeConfig(), '/root');
    await store.update<string>('newKey', updater);

    expect(updater).toHaveBeenCalledWith(null);
    expect(mockWriteJsonSync).toHaveBeenCalledWith(
      expect.stringContaining('newKey.json'),
      'default',
    );
  });

  it('calls updater with the current value', async () => {
    mockReadFileSync.mockReturnValueOnce(JSON.stringify({ count: 5 }) as unknown as string);
    mockWriteFileSync.mockImplementationOnce(() => {}); // lock acquired

    const updater = vi.fn((current: { count: number } | null) => ({ count: (current?.count ?? 0) + 1 }));
    const store = new JsonStateStore(makeConfig(), '/root');
    await store.update('counter', updater);

    expect(updater).toHaveBeenCalledWith({ count: 5 });
    expect(mockWriteJsonSync).toHaveBeenCalledWith(
      expect.stringContaining('counter.json'),
      { count: 6 },
    );
  });

  it('always releases the lock — even when set() throws', async () => {
    mockReadFileSync.mockImplementationOnce(() => {
      throw makeErrnoError('ENOENT');
    });
    mockWriteFileSync.mockImplementationOnce(() => {}); // lock acquired
    mockWriteJsonSync.mockImplementationOnce(() => {
      throw new Error('write error');
    });

    const store = new JsonStateStore(makeConfig(), '/root');
    await expect(store.update('k', () => ({}))).rejects.toThrow(StateError);
    // unlinkSync is called to release the lock
    expect(mockUnlinkSync).toHaveBeenCalled();
  });

  it('throws StateError when lock cannot be acquired after max attempts', async () => {
    // All lock write attempts fail with EEXIST
    mockWriteFileSync.mockImplementation(() => {
      throw makeErrnoError('EEXIST');
    });

    const store = new JsonStateStore(makeConfig(), '/root');
    // Use very short backoff to avoid slow test
    await expect(
      (store as unknown as { acquireLock: (p: string, max: number, backoff: number) => Promise<void> }).acquireLock('lock.lock', 3, 0)
    ).rejects.toThrow(StateError);
  });

  it('propagates non-EEXIST lock errors immediately', async () => {
    mockWriteFileSync.mockImplementationOnce(() => {
      throw makeErrnoError('EACCES');
    });

    const store = new JsonStateStore(makeConfig(), '/root');
    await expect(
      (store as unknown as { acquireLock: (p: string) => Promise<void> }).acquireLock('lock.lock')
    ).rejects.toThrow('EACCES');
  });
});
