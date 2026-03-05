/**
 * Tests for DaemonLifecycle lockfile-based startup mutex.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoist mocks ──────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const mockExistsSync = vi.fn<(path: string) => boolean>();
  const mockReadFileSync = vi.fn<(path: string, enc: string) => string>();
  const mockUnlinkSync = vi.fn<(path: string) => void>();
  const mockOpenSync = vi.fn<(path: string, flags: string) => number>();
  const mockWriteSync = vi.fn<(fd: number, data: string) => number>();
  const mockCloseSync = vi.fn<(fd: number) => void>();
  const mockSpawn = vi.fn();
  const mockCreateConnection = vi.fn((_path: string, connectCb?: () => void) => {
    if (connectCb) setTimeout(connectCb, 0);
    return {
      on: vi.fn().mockReturnThis(),
      destroy: vi.fn(),
    };
  });
  const mockKill = vi.fn<(pid: number, signal?: string | number) => boolean>();

  return {
    mockExistsSync,
    mockReadFileSync,
    mockUnlinkSync,
    mockOpenSync,
    mockWriteSync,
    mockCloseSync,
    mockSpawn,
    mockCreateConnection,
    mockKill,
  };
});

vi.mock('node:fs', () => ({
  existsSync: mocks.mockExistsSync,
  readFileSync: mocks.mockReadFileSync,
  unlinkSync: mocks.mockUnlinkSync,
  openSync: mocks.mockOpenSync,
  writeSync: mocks.mockWriteSync,
  closeSync: mocks.mockCloseSync,
  mkdirSync: vi.fn(),
}));

vi.mock('node:net', () => ({
  createConnection: mocks.mockCreateConnection,
}));

vi.mock('node:child_process', () => ({
  spawn: mocks.mockSpawn,
}));

vi.mock('../../shared/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

// ─── Import SUT after mocks ────────────────────────────────────────────────────

import { DaemonLifecycle } from '../daemon-lifecycle.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Make openSync succeed (returns a fake fd), simulating no existing lock.
 */
function setupLockFree() {
  mocks.mockOpenSync.mockReturnValue(42);
  mocks.mockWriteSync.mockReturnValue(0);
  mocks.mockCloseSync.mockReturnValue(undefined);
}

/**
 * Make openSync throw EEXIST, simulating lock held by given pid.
 */
function setupLockHeldByPid(lockerPid: number, isAlive: boolean) {
  const eexist = Object.assign(new Error('EEXIST'), { code: 'EEXIST' }) as NodeJS.ErrnoException;
  mocks.mockOpenSync.mockImplementation(() => { throw eexist; });
  mocks.mockReadFileSync.mockImplementation((p: string) => {
    if (p.endsWith('daemon.lock')) return String(lockerPid);
    return '';
  });
  mocks.mockExistsSync.mockImplementation((p: string) => {
    return p.endsWith('daemon.lock');
  });
  vi.spyOn(process, 'kill').mockImplementation((_pid, signal) => {
    if (signal === 0) {
      if (isAlive) return true;
      const err = Object.assign(new Error('ESRCH'), { code: 'ESRCH' }) as NodeJS.ErrnoException;
      throw err;
    }
    return true;
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DaemonLifecycle lock methods', () => {
  let lifecycle: DaemonLifecycle;

  beforeEach(() => {
    vi.useFakeTimers();
    mocks.mockExistsSync.mockReset();
    mocks.mockReadFileSync.mockReset();
    mocks.mockUnlinkSync.mockReset();
    mocks.mockOpenSync.mockReset();
    mocks.mockWriteSync.mockReset();
    mocks.mockCloseSync.mockReset();
    mocks.mockSpawn.mockReset();
    mocks.mockCreateConnection.mockReset();
    vi.restoreAllMocks();
    lifecycle = new DaemonLifecycle('/project');
  });

  afterEach(() => {
    lifecycle.stopHealthCheck();
    vi.useRealTimers();
  });

  // ── acquireLock ─────────────────────────────────────────────────────────────

  it('acquireLock succeeds when no lock file exists', () => {
    setupLockFree();
    // acquireLock is private — test via doStart by checking that openSync was called with wx
    // We expose it indirectly: openSync called with 'wx' mode means atomic lock attempt
    expect(mocks.mockOpenSync).not.toHaveBeenCalled();

    // Simulate a full no-daemon-running scenario and call start
    // We only verify openSync is called with 'wx' flag on the lock path
    // by observing it was called (acquireLock internally calls openSync)
    setupLockFree();
    mocks.mockExistsSync.mockReturnValue(false); // no pid file, no daemon running

    // We need to test acquireLock directly. Since it's private, we access it via prototype.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (lifecycle as any).acquireLock();
    expect(result).toBe(true);
    expect(mocks.mockOpenSync).toHaveBeenCalledWith(
      expect.stringContaining('daemon.lock'),
      'wx',
    );
    expect(mocks.mockWriteSync).toHaveBeenCalledWith(42, String(process.pid));
    expect(mocks.mockCloseSync).toHaveBeenCalledWith(42);
  });

  it('acquireLock fails when lock file exists and locker PID is alive', () => {
    const alivePid = 99999;
    setupLockHeldByPid(alivePid, true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (lifecycle as any).acquireLock();
    expect(result).toBe(false);
  });

  it('acquireLock removes stale lock and retries when locker PID is dead', () => {
    const deadPid = 11111;

    // First openSync: EEXIST (stale lock held by dead pid)
    // Second openSync (retry): succeeds
    const eexist = Object.assign(new Error('EEXIST'), { code: 'EEXIST' }) as NodeJS.ErrnoException;
    let openCallCount = 0;
    mocks.mockOpenSync.mockImplementation(() => {
      openCallCount++;
      if (openCallCount === 1) throw eexist;
      return 42;
    });
    mocks.mockReadFileSync.mockImplementation((p: string) => {
      if (p.endsWith('daemon.lock')) return String(deadPid);
      return '';
    });
    mocks.mockExistsSync.mockImplementation((p: string) => {
      return p.endsWith('daemon.lock');
    });
    mocks.mockWriteSync.mockReturnValue(0);
    mocks.mockCloseSync.mockReturnValue(undefined);

    // Dead process — kill(pid, 0) throws ESRCH
    vi.spyOn(process, 'kill').mockImplementation((_pid, signal) => {
      if (signal === 0) {
        const err = Object.assign(new Error('ESRCH'), { code: 'ESRCH' }) as NodeJS.ErrnoException;
        throw err;
      }
      return true;
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (lifecycle as any).acquireLock();
    expect(result).toBe(true);
    // Stale lock should have been unlinked
    expect(mocks.mockUnlinkSync).toHaveBeenCalledWith(
      expect.stringContaining('daemon.lock'),
    );
    // openSync should have been called twice (first fail, then retry)
    expect(openCallCount).toBe(2);
  });

  // ── releaseLock ─────────────────────────────────────────────────────────────

  it('releaseLock removes the lock file', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (lifecycle as any).releaseLock();
    expect(mocks.mockUnlinkSync).toHaveBeenCalledWith(
      expect.stringContaining('daemon.lock'),
    );
  });

  it('releaseLock is safe when lock file does not exist (no throw)', () => {
    mocks.mockUnlinkSync.mockImplementation(() => {
      const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) as NodeJS.ErrnoException;
      throw err;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => (lifecycle as any).releaseLock()).not.toThrow();
  });

  // ── cleanupStaleFiles stale lock cleanup ─────────────────────────────────────

  it('cleanupStaleFiles removes lock file when holder PID is dead', () => {
    const deadPid = 55555;
    mocks.mockExistsSync.mockImplementation((p: string) => {
      return p.endsWith('daemon.lock');
    });
    mocks.mockReadFileSync.mockImplementation((p: string) => {
      if (p.endsWith('daemon.lock')) return String(deadPid);
      return '';
    });
    vi.spyOn(process, 'kill').mockImplementation((_pid, signal) => {
      if (signal === 0) {
        const err = Object.assign(new Error('ESRCH'), { code: 'ESRCH' }) as NodeJS.ErrnoException;
        throw err;
      }
      return true;
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (lifecycle as any).cleanupStaleFiles();

    expect(mocks.mockUnlinkSync).toHaveBeenCalledWith(
      expect.stringContaining('daemon.lock'),
    );
  });

  it('cleanupStaleFiles does NOT remove lock file when holder PID is alive', () => {
    const alivePid = 77777;
    mocks.mockExistsSync.mockImplementation((p: string) => {
      return p.endsWith('daemon.lock');
    });
    mocks.mockReadFileSync.mockImplementation((p: string) => {
      if (p.endsWith('daemon.lock')) return String(alivePid);
      return '';
    });
    vi.spyOn(process, 'kill').mockImplementation((_pid, signal) => {
      if (signal === 0) return true;
      return true;
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (lifecycle as any).cleanupStaleFiles();

    const lockUnlinks = mocks.mockUnlinkSync.mock.calls.filter(
      (c) => (c[0] as string).endsWith('daemon.lock'),
    );
    expect(lockUnlinks).toHaveLength(0);
  });
});
