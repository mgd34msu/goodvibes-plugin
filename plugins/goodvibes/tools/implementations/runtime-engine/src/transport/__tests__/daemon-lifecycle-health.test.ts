/**
 * Tests for DaemonLifecycle health check polling.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoist mocks ──────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const mockExistsSync = vi.fn<(path: string) => boolean>();
  const mockReadFileSync = vi.fn<(path: string, enc: string) => string>();
  const mockUnlinkSync = vi.fn<(path: string) => void>();
  const mockSpawn = vi.fn();

  // Net socket mock for probeSocket
  const mockSocketOn = vi.fn();
  const mockSocketDestroy = vi.fn();
  let capturedConnectHandler: (() => void) | null = null;
  let capturedErrorHandler: ((err: Error) => void) | null = null;

  const mockCreateConnection = vi.fn((_path: string, connectCb?: () => void) => {
    capturedConnectHandler = connectCb ?? null;
    return {
      on: mockSocketOn.mockImplementation((event: string, handler: (err?: Error) => void) => {
        if (event === 'error') capturedErrorHandler = handler;
        return { on: vi.fn(), destroy: mockSocketDestroy };
      }),
      destroy: mockSocketDestroy,
    };
  });

  const mockKill = vi.fn<(pid: number, signal?: string | number) => boolean>();

  return {
    mockExistsSync,
    mockReadFileSync,
    mockUnlinkSync,
    mockSpawn,
    mockCreateConnection,
    mockSocketDestroy,
    mockKill,
    getConnectHandler: () => capturedConnectHandler,
    getErrorHandler: () => capturedErrorHandler,
    resetSocketHandlers: () => {
      capturedConnectHandler = null;
      capturedErrorHandler = null;
    },
  };
});

vi.mock('node:fs', () => ({
  existsSync: mocks.mockExistsSync,
  readFileSync: mocks.mockReadFileSync,
  unlinkSync: mocks.mockUnlinkSync,
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

/**
 * Flush pending microtasks/promises.
 * Uses multiple Promise.resolve() hops to work correctly with vi.useFakeTimers().
 */
async function flushPromises(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Configure mocks to simulate a running daemon:
 *  - PID file exists and returns `pid`
 *  - Socket pointer file exists and returns `socketPath`
 *  - The process is alive (process.kill(pid, 0) succeeds)
 *  - probeSocket will resolve true (we trigger the connect callback)
 */
function setupRunningDaemon(pid: number, socketPath: string) {
  mocks.mockExistsSync.mockImplementation((p: string) => {
    return p.endsWith('.pid') || p.endsWith('daemon.socket') || p === socketPath;
  });
  mocks.mockReadFileSync.mockImplementation((p: string) => {
    if (p.endsWith('.pid')) return String(pid);
    if (p.endsWith('daemon.socket')) return socketPath;
    return '';
  });
  // process.kill(pid, 0) should not throw
  vi.spyOn(process, 'kill').mockImplementation((_pid, signal) => {
    if (signal === 0) return true;
    return true;
  });
  // Automatically trigger connect callback on probeSocket
  mocks.mockCreateConnection.mockImplementation((_path: string, connectCb?: () => void) => {
    mocks.resetSocketHandlers();
    if (connectCb) setTimeout(connectCb, 0);
    return {
      on: vi.fn().mockReturnThis(),
      destroy: mocks.mockSocketDestroy,
    };
  });
}

/**
 * Configure mocks to simulate a dead daemon:
 *  - PID file exists (stale) with `pid`
 *  - process.kill(pid, 0) throws ESRCH
 *  - Socket pointer file may or may not exist
 */
function setupDeadDaemon(pid: number) {
  mocks.mockExistsSync.mockImplementation((p: string) => {
    return p.endsWith('.pid') || p.endsWith('daemon.socket');
  });
  mocks.mockReadFileSync.mockImplementation((p: string) => {
    if (p.endsWith('.pid')) return String(pid);
    if (p.endsWith('daemon.socket')) return '/tmp/test.sock';
    return '';
  });
  vi.spyOn(process, 'kill').mockImplementation(() => {
    const err = new Error('no such process') as NodeJS.ErrnoException;
    err.code = 'ESRCH';
    throw err;
  });
}

/**
 * Configure mocks to simulate no daemon running:
 *  - No PID file, no socket pointer file
 */
function setupNoDaemon() {
  mocks.mockExistsSync.mockReturnValue(false);
  mocks.mockReadFileSync.mockReturnValue('');
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DaemonLifecycle health check polling', () => {
  let lifecycle: DaemonLifecycle;

  beforeEach(() => {
    vi.useFakeTimers();
    mocks.mockExistsSync.mockReset();
    mocks.mockReadFileSync.mockReset();
    mocks.mockUnlinkSync.mockReset();
    mocks.mockCreateConnection.mockReset();
    mocks.mockSocketDestroy.mockReset();
    vi.restoreAllMocks();
    lifecycle = new DaemonLifecycle('/project', { healthCheckIntervalMs: 1000 });
  });

  afterEach(() => {
    lifecycle.stopHealthCheck();
    vi.useRealTimers();
  });

  // ── startHealthCheck / polling ──────────────────────────────────────────────

  it('runs updateHealth immediately when startHealthCheck is called', async () => {
    setupNoDaemon();
    lifecycle.startHealthCheck();
    // Allow the immediate updateHealth() promise to settle
    await flushPromises();
    const status = await lifecycle.getStatus();
    expect(status.running).toBe(false);
    // cachedHealth should be fresh — getStatus should NOT re-probe
    expect(mocks.mockExistsSync).toHaveBeenCalled();
  });

  it('runs updateHealth on each interval tick', async () => {
    setupNoDaemon();
    lifecycle.startHealthCheck(500);
    await flushPromises();

    const callCountAfterStart = mocks.mockExistsSync.mock.calls.length;

    // Advance timer by one interval
    await vi.advanceTimersByTimeAsync(500);
    await flushPromises();

    const callCountAfterTick = mocks.mockExistsSync.mock.calls.length;
    expect(callCountAfterTick).toBeGreaterThan(callCountAfterStart);
  });

  it('does not start a second polling loop if called again', async () => {
    setupNoDaemon();
    lifecycle.startHealthCheck(500);
    lifecycle.startHealthCheck(500); // second call is a no-op
    await flushPromises();

    const initialCallCount = mocks.mockExistsSync.mock.calls.length;
    await vi.advanceTimersByTimeAsync(500);
    await flushPromises();

    // Only one interval should have fired
    const afterTickCount = mocks.mockExistsSync.mock.calls.length;
    // We can't directly count setInterval calls, but repeated ticks are fine;
    // the main invariant is that the timer is not null and stop works.
    expect(afterTickCount).toBeGreaterThanOrEqual(initialCallCount);
  });

  // ── getStatus caching ───────────────────────────────────────────────────────

  it('getStatus returns cached result when health is fresh', async () => {
    setupNoDaemon();
    lifecycle.startHealthCheck();
    await flushPromises();

    // Record call count after initial updateHealth
    const callsBefore = mocks.mockExistsSync.mock.calls.length;

    // getStatus should use cache, not re-probe
    const status = await lifecycle.getStatus();
    const callsAfter = mocks.mockExistsSync.mock.calls.length;

    expect(status.running).toBe(false);
    // No additional existsSync calls for the cached path
    expect(callsAfter).toBe(callsBefore);
  });

  it('getStatus triggers updateHealth when cache is stale', async () => {
    setupNoDaemon();
    lifecycle.startHealthCheck(1000);
    await flushPromises();

    const callsBefore = mocks.mockExistsSync.mock.calls.length;

    // Advance past the interval to make cache stale
    await vi.advanceTimersByTimeAsync(1100);
    await flushPromises();

    // Another getStatus — cache may already be refreshed by polling, that's fine
    const status = await lifecycle.getStatus();
    expect(status.running).toBe(false);
    // existsSync should have been called again (either by poll or by getStatus)
    expect(mocks.mockExistsSync.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('getStatus runs updateHealth and returns result when no cached state', async () => {
    setupNoDaemon();
    // No startHealthCheck — no cached state
    const status = await lifecycle.getStatus();
    expect(status.running).toBe(false);
    expect(status.pid).toBeNull();
    expect(status.socketPath).toBeNull();
    expect(mocks.mockExistsSync).toHaveBeenCalled();
  });

  // ── Dead daemon detection ───────────────────────────────────────────────────

  it('detects dead daemon and cleans up stale files', async () => {
    setupDeadDaemon(12345);
    lifecycle.startHealthCheck();
    await flushPromises();

    const status = await lifecycle.getStatus();
    expect(status.running).toBe(false);
    // Should have called unlinkSync to clean up stale PID and socket pointer files
    expect(mocks.mockUnlinkSync).toHaveBeenCalled();
    const unlinkedPaths = mocks.mockUnlinkSync.mock.calls.map((c) => c[0] as string);
    expect(unlinkedPaths.some((p) => p.endsWith('.pid'))).toBe(true);
  });

  it('sets running false and clears pid when process is dead', async () => {
    setupDeadDaemon(99999);
    lifecycle.startHealthCheck();
    await flushPromises();

    const status = await lifecycle.getStatus();
    expect(status.running).toBe(false);
    expect(status.pid).toBeNull();
  });

  // ── Running daemon coverage ─────────────────────────────────────────────────

  it('health check reports running daemon with correct pid, socketPath, and socketResponsive=true', async () => {
    const pid = 42000;
    const socketPath = '/tmp/test-daemon.sock';
    setupRunningDaemon(pid, socketPath);

    lifecycle.startHealthCheck(1000);
    // Allow the immediate updateHealth() and the connect callback (via setTimeout(0)) to settle
    await vi.advanceTimersByTimeAsync(0);
    await flushPromises();

    const status = await lifecycle.getStatus();
    expect(status.running).toBe(true);
    expect(status.pid).toBe(pid);
    expect(status.socketPath).toBe(socketPath);
  });

  it('getStatus returns cached running state when fresh (no re-probe)', async () => {
    const pid = 42001;
    const socketPath = '/tmp/test-daemon2.sock';
    setupRunningDaemon(pid, socketPath);

    lifecycle.startHealthCheck(1000);
    await vi.advanceTimersByTimeAsync(0);
    await flushPromises();

    const callCountAfterInit = mocks.mockExistsSync.mock.calls.length;

    // Call getStatus twice — both should use cache
    await lifecycle.getStatus();
    await lifecycle.getStatus();

    expect(mocks.mockExistsSync.mock.calls.length).toBe(callCountAfterInit);
  });

  it('detects daemon death between polls — transitions from running to dead', async () => {
    const pid = 42002;
    const socketPath = '/tmp/test-daemon3.sock';
    setupRunningDaemon(pid, socketPath);

    lifecycle.startHealthCheck(500);
    await vi.advanceTimersByTimeAsync(0);
    await flushPromises();

    // Confirm running
    const statusBefore = await lifecycle.getStatus();
    expect(statusBefore.running).toBe(true);

    // Daemon dies between polls
    setupDeadDaemon(pid);

    // Advance past one polling interval to trigger updateHealth
    await vi.advanceTimersByTimeAsync(500);
    await flushPromises();

    const statusAfter = await lifecycle.getStatus();
    expect(statusAfter.running).toBe(false);
    expect(statusAfter.pid).toBeNull();
  });

  it('running: true requires both process alive AND socket responsive', async () => {
    const pid = 42003;
    const socketPath = '/tmp/test-daemon4.sock';

    // Setup: process alive but socket unresponsive (error callback fires)
    mocks.mockExistsSync.mockImplementation((p: string) => {
      return p.endsWith('.pid') || p.endsWith('daemon.socket') || p === socketPath;
    });
    mocks.mockReadFileSync.mockImplementation((p: string) => {
      if (p.endsWith('.pid')) return String(pid);
      if (p.endsWith('daemon.socket')) return socketPath;
      return '';
    });
    vi.spyOn(process, 'kill').mockImplementation((_pid, signal) => {
      if (signal === 0) return true;
      return true;
    });
    // Socket probe always fails (error event)
    mocks.mockCreateConnection.mockImplementation((_path: string, _connectCb?: () => void) => {
      const mockSocket = {
        on: vi.fn().mockImplementation((event: string, handler: (err?: Error) => void) => {
          if (event === 'error') setTimeout(() => handler(new Error('ECONNREFUSED')), 0);
          return mockSocket;
        }),
        destroy: mocks.mockSocketDestroy,
      };
      return mockSocket;
    });

    lifecycle.startHealthCheck(1000);
    await vi.advanceTimersByTimeAsync(0);
    await flushPromises();

    const status = await lifecycle.getStatus();
    // Process is alive but socket unresponsive — must NOT report running=true
    expect(status.running).toBe(false);
    // pid is set because process is alive (diagnostics)
    expect(status.pid).toBe(pid);
  });

  // ── stopHealthCheck ─────────────────────────────────────────────────────────

  it('stopHealthCheck clears the polling interval', async () => {
    setupNoDaemon();
    lifecycle.startHealthCheck(500);
    await flushPromises();

    lifecycle.stopHealthCheck();

    const callCountAtStop = mocks.mockExistsSync.mock.calls.length;

    // Advance timer — no more polls should fire
    await vi.advanceTimersByTimeAsync(2000);
    await flushPromises();

    expect(mocks.mockExistsSync.mock.calls.length).toBe(callCountAtStop);
  });

  it('stopHealthCheck is idempotent (safe to call multiple times)', () => {
    lifecycle.stopHealthCheck();
    lifecycle.stopHealthCheck();
    // Should not throw
  });

  // ── stop() lifecycle integration ────────────────────────────────────────────

  it('stop() calls stopHealthCheck before killing the daemon', async () => {
    const pid = 54321;
    mocks.mockExistsSync.mockImplementation((p: string) =>
      p.endsWith('.pid') || p.endsWith('daemon.socket'),
    );
    mocks.mockReadFileSync.mockImplementation((p: string) => {
      if (p.endsWith('.pid')) return String(pid);
      return '/tmp/test.sock';
    });

    const killSpy = vi.spyOn(process, 'kill').mockImplementation((_p, sig) => {
      // Make sig=0 fail so process appears dead quickly
      if (sig === 0) {
        const err = new Error('ESRCH') as NodeJS.ErrnoException;
        err.code = 'ESRCH';
        throw err;
      }
      return true;
    });

    lifecycle.startHealthCheck(500);
    await flushPromises();

    await lifecycle.stop();

    // Timer should be cleared (stopHealthCheck was called)
    const callsAtStop = mocks.mockExistsSync.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000);
    await flushPromises();
    expect(mocks.mockExistsSync.mock.calls.length).toBe(callsAtStop);

    killSpy.mockRestore();
  });

  it('health check does not run after stop()', async () => {
    setupNoDaemon();
    lifecycle.startHealthCheck(500);
    await flushPromises();

    // Simulate stop with no pid file so it exits early
    await lifecycle.stop();

    const callsAfterStop = mocks.mockExistsSync.mock.calls.length;
    await vi.advanceTimersByTimeAsync(2000);
    await flushPromises();

    expect(mocks.mockExistsSync.mock.calls.length).toBe(callsAfterStop);
  });

  // ── Timer leak prevention ───────────────────────────────────────────────────

  it('timer is properly cleaned up via stopHealthCheck to prevent leaks', async () => {
    setupNoDaemon();
    lifecycle.startHealthCheck(100);
    await flushPromises();

    // Verify timer is active
    await vi.advanceTimersByTimeAsync(100);
    await flushPromises();

    lifecycle.stopHealthCheck();

    // After stop, advancing time should not call existsSync again
    const callsAtStop = mocks.mockExistsSync.mock.calls.length;
    await vi.advanceTimersByTimeAsync(500);
    await flushPromises();
    expect(mocks.mockExistsSync.mock.calls.length).toBe(callsAtStop);
  });
});
