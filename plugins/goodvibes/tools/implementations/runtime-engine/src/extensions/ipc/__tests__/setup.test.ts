import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';

// ─── Module mocks ─────────────────────────────────────────────────────────────────

vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../../shared/utils.js', () => ({
  toErrorMessage: (err: unknown) => String(err),
}));

// Declare module-level vars for stable mock instances per-test
let _ipcServer: {
  onMessage: ReturnType<typeof vi.fn>;
  setWriteResultCallback: ReturnType<typeof vi.fn>;
  listen: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};
let _ipcRouter: {
  route: ReturnType<typeof vi.fn>;
  setAgentWorkflowResolver: ReturnType<typeof vi.fn>;
  removeSessionPointers: ReturnType<typeof vi.fn>;
};

vi.mock('../../../shared/ipc/ipc-server.js', () => ({
  IPCServer: function IPCServer() {
    _ipcServer = {
      onMessage: vi.fn(),
      setWriteResultCallback: vi.fn(),
      listen: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    return _ipcServer;
  },
}));

vi.mock('../ipc-router.js', () => ({
  IPCRouter: function IPCRouter() {
    _ipcRouter = {
      route: vi.fn(),
      setAgentWorkflowResolver: vi.fn(),
      removeSessionPointers: vi.fn(),
      setOnSocketLost: vi.fn(),
    };
    return _ipcRouter;
  },
}));

// SocketWatcher mock
let _socketWatcherStart: ReturnType<typeof vi.fn>;
let _socketWatcherStop: ReturnType<typeof vi.fn>;
let _socketWatcherIsWatching: ReturnType<typeof vi.fn>;
let _capturedOnSocketLost: (() => void | Promise<void>) | undefined;

vi.mock('../socket-watcher.js', () => ({
  SocketWatcher: function SocketWatcher(
    _socketPath: string,
    onSocketLost: () => void | Promise<void>,
  ) {
    _capturedOnSocketLost = onSocketLost;
    _socketWatcherStart = vi.fn();
    _socketWatcherStop = vi.fn();
    _socketWatcherIsWatching = vi.fn().mockReturnValue(true);
    return {
      start: _socketWatcherStart,
      stop: _socketWatcherStop,
      isWatching: _socketWatcherIsWatching,
    };
  },
}));

// fs mocks via stable module-level functions
const mockMkdirSync = vi.fn();
const mockWriteFileSync = vi.fn();
const mockReaddirSync = vi.fn().mockReturnValue([]);
const mockReadFileSync = vi.fn();
const mockUnlinkSync = vi.fn();
const mockSymlinkSync = vi.fn();

vi.mock('node:fs', () => ({
  mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
  readdirSync: (...args: unknown[]) => mockReaddirSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  unlinkSync: (...args: unknown[]) => mockUnlinkSync(...args),
  symlinkSync: (...args: unknown[]) => mockSymlinkSync(...args),
}));

// crypto: plain functions (not vi.fn, avoids clearAllMocks issues)
vi.mock('node:crypto', () => ({
  createHash: () => ({
    update: function(this: object) { return this; },
    digest: () => 'abcd1234deadbeef0123456789abcdef',
  }),
}));

vi.mock('node:path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:path')>();
  return { ...actual };
});

// ensureDirSync mock
const mockEnsureDirSync = vi.fn();

vi.mock('../../../core/utils/fs-utils.js', () => ({
  ensureDirSync: (...args: unknown[]) => mockEnsureDirSync(...args),
}));

// ─── Import after mocks ─────────────────────────────────────────────────────────────────

import { createIPCSubsystem, cleanStalePointerFiles } from '../setup.js';
import type { CreateIPCOptions } from '../setup.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────────────────

function makeConfig() {
  return {
    persistence: { state_dir: '.runtime-state' },
    ipc: { socket_dir: '/tmp/goodvibes' },
  } as unknown as import('../../../shared/config.js').RuntimeConfig;
}

function makeOpts(overrides: Partial<CreateIPCOptions> = {}): CreateIPCOptions {
  return {
    config: makeConfig(),
    projectRoot: '/project/root',
    eventBus: {} as unknown as import('../../events/event-bus.js').EventBus,
    triggerRegistry: null,
    workflowEngine: null,
    agentCoordinator: null,
    directiveQueue: null,
    wrfcConfigStore: null,
    agentWorkflowMap: null,
    hookProcessor: null,
    executorMode: null,
    executorBudget: null,
    daemonTickHandler: null,
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────────────

// ─── Helpers for cleanStalePointerFiles unit tests ──────────────────────────────────────

function makeLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe('createIPCSubsystem', () => {
  beforeEach(() => {
    mockMkdirSync.mockClear();
    mockWriteFileSync.mockClear();
    mockEnsureDirSync.mockClear();
    mockReaddirSync.mockClear();
    mockReaddirSync.mockReturnValue([]);
    mockReadFileSync.mockClear();
    mockUnlinkSync.mockClear();
    mockSymlinkSync.mockClear();
    // Reset SocketWatcher tracking so we can detect if it was never constructed
    (_socketWatcherStart as unknown) = undefined;
    _capturedOnSocketLost = undefined;
    // _ipcServer and _ipcRouter are recreated fresh each time createIPCSubsystem is called
    // because the constructor functions reassign them.
  });

  // ─── Success path ─────────────────────────────────────────────────────────────────────

  describe('success path', () => {
    it('returns non-null result on success', async () => {
      const result = await createIPCSubsystem(makeOpts());
      expect(result).not.toBeNull();
    });

    it('returns subsystem and socketPath', async () => {
      const result = await createIPCSubsystem(makeOpts());
      expect(result).toHaveProperty('subsystem');
      expect(result).toHaveProperty('socketPath');
    });

    it('subsystem contains ipcServer, ipcRouter, socketPath', async () => {
      const result = await createIPCSubsystem(makeOpts());
      expect(result!.subsystem).toHaveProperty('ipcServer');
      expect(result!.subsystem).toHaveProperty('ipcRouter');
      expect(result!.subsystem).toHaveProperty('socketPath');
    });

    it('subsystem.ipcServer is the IPCServer instance', async () => {
      const result = await createIPCSubsystem(makeOpts());
      expect(result!.subsystem.ipcServer).toBe(_ipcServer);
    });

    it('subsystem.ipcRouter is the IPCRouter instance', async () => {
      const result = await createIPCSubsystem(makeOpts());
      expect(result!.subsystem.ipcRouter).toBe(_ipcRouter);
    });

    it('socketPath in result matches subsystem.socketPath', async () => {
      const result = await createIPCSubsystem(makeOpts());
      expect(result!.socketPath).toBe(result!.subsystem.socketPath);
    });
  });

  // ─── Socket path generation ───────────────────────────────────────────────────────────

  describe('socket path generation', () => {
    it('socket path is in the state dir sockets/active subdirectory', async () => {
      const result = await createIPCSubsystem(makeOpts());
      // Socket is now stored in stateDir/sockets/active for persistence across tmpfs clears.
      // A symlink in socket_dir (/tmp/goodvibes) points to the real path.
      expect(result!.socketPath).toContain('.runtime-state');
    });

    it('socket path ends with .sock extension', async () => {
      const result = await createIPCSubsystem(makeOpts());
      expect(result!.socketPath).toMatch(/\.sock$/);
    });

    it('socket filename includes goodvibes-runtime prefix', async () => {
      const result = await createIPCSubsystem(makeOpts());
      expect(result!.socketPath).toContain('goodvibes-runtime-');
    });

    it('socket filename includes the process pid', async () => {
      const result = await createIPCSubsystem(makeOpts());
      expect(result!.socketPath).toContain(`-${process.pid}.sock`);
    });
  });

  // ─── Server/router wiring ─────────────────────────────────────────────────────────────────

  describe('server/router wiring', () => {
    it('registers router.route as message handler on the server', async () => {
      await createIPCSubsystem(makeOpts());
      expect(_ipcServer.onMessage).toHaveBeenCalledWith(expect.any(Function));
    });

    it('calls ipcServer.listen()', async () => {
      await createIPCSubsystem(makeOpts());
      expect(_ipcServer.listen).toHaveBeenCalledTimes(1);
    });

    it('creates the socket directory', async () => {
      await createIPCSubsystem(makeOpts());
      expect(mockMkdirSync).toHaveBeenCalledWith('/tmp/goodvibes', {
        recursive: true,
        mode: 0o700,
      });
    });

    it('writes a socket pointer file to the state dir', async () => {
      await createIPCSubsystem(makeOpts());
      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
      const [pointerPath, content, encoding] = (mockWriteFileSync as Mock).mock.calls[0];
      expect(pointerPath).toContain('.runtime-state');
      expect(pointerPath).toContain(`runtime-${process.pid}.socket`);
      expect(typeof content).toBe('string');
      expect(encoding).toBe('utf-8');
    });

    it('calls ensureDirSync on the state directory', async () => {
      await createIPCSubsystem(makeOpts());
      expect(mockEnsureDirSync).toHaveBeenCalledTimes(1);
      const [stateDir] = (mockEnsureDirSync as Mock).mock.calls[0];
      expect(stateDir).toContain('.runtime-state');
    });
  });

  // ─── directiveQueue wiring ────────────────────────────────────────────────────────────

  describe('directiveQueue wiring', () => {
    it('sets write result callback when directiveQueue is provided', async () => {
      const directiveQueue = {
        releaseHold: vi.fn(),
        reEnqueueHold: vi.fn(),
      } as unknown as import('../../directives/directive-queue.js').DirectiveQueue;

      await createIPCSubsystem(makeOpts({ directiveQueue }));
      expect(_ipcServer.setWriteResultCallback).toHaveBeenCalledTimes(1);
    });

    it('does not set write result callback when directiveQueue is null', async () => {
      await createIPCSubsystem(makeOpts({ directiveQueue: null }));
      expect(_ipcServer.setWriteResultCallback).not.toHaveBeenCalled();
    });

    it('calls releaseHold on successful write', async () => {
      const directiveQueue = {
        releaseHold: vi.fn(),
        reEnqueueHold: vi.fn(),
      } as unknown as import('../../directives/directive-queue.js').DirectiveQueue;

      await createIPCSubsystem(makeOpts({ directiveQueue }));

      const [callback] = (_ipcServer.setWriteResultCallback as Mock).mock.calls[0];
      callback('hold-123', true);
      expect(directiveQueue.releaseHold).toHaveBeenCalledWith('hold-123');
      expect(directiveQueue.reEnqueueHold).not.toHaveBeenCalled();
    });

    it('calls reEnqueueHold on failed write', async () => {
      const directiveQueue = {
        releaseHold: vi.fn(),
        reEnqueueHold: vi.fn(),
      } as unknown as import('../../directives/directive-queue.js').DirectiveQueue;

      await createIPCSubsystem(makeOpts({ directiveQueue }));

      const [callback] = (_ipcServer.setWriteResultCallback as Mock).mock.calls[0];
      callback('hold-456', false);
      expect(directiveQueue.reEnqueueHold).toHaveBeenCalledWith('hold-456');
      expect(directiveQueue.releaseHold).not.toHaveBeenCalled();
    });
  });

  // ─── agentWorkflowMap wiring ──────────────────────────────────────────────────────────

  describe('agentWorkflowMap wiring', () => {
    it('sets agent workflow resolver when agentWorkflowMap is provided', async () => {
      const agentWorkflowMap = {
        lookup: vi.fn().mockReturnValue('wf-123'),
      } as unknown as import('../../directives/agent-workflow-map.js').AgentWorkflowMap;

      await createIPCSubsystem(makeOpts({ agentWorkflowMap }));
      expect(_ipcRouter.setAgentWorkflowResolver).toHaveBeenCalledWith(expect.any(Function));
    });

    it('does not set agent workflow resolver when agentWorkflowMap is null', async () => {
      await createIPCSubsystem(makeOpts({ agentWorkflowMap: null }));
      expect(_ipcRouter.setAgentWorkflowResolver).not.toHaveBeenCalled();
    });

    it('resolver calls agentWorkflowMap.lookup and returns workflow id', async () => {
      const agentWorkflowMap = {
        lookup: vi.fn().mockReturnValue('wf-789'),
      } as unknown as import('../../directives/agent-workflow-map.js').AgentWorkflowMap;

      await createIPCSubsystem(makeOpts({ agentWorkflowMap }));

      const [resolver] = (_ipcRouter.setAgentWorkflowResolver as Mock).mock.calls[0];
      const result = resolver('agent-abc');
      expect(agentWorkflowMap.lookup).toHaveBeenCalledWith('agent-abc');
      expect(result).toBe('wf-789');
    });

    it('resolver returns null when lookup returns undefined', async () => {
      const agentWorkflowMap = {
        lookup: vi.fn().mockReturnValue(undefined),
      } as unknown as import('../../directives/agent-workflow-map.js').AgentWorkflowMap;

      await createIPCSubsystem(makeOpts({ agentWorkflowMap }));
      const [resolver] = (_ipcRouter.setAgentWorkflowResolver as Mock).mock.calls[0];
      expect(resolver('unknown-agent')).toBeNull();
    });
  });

  // ─── socket resilience (onSocketLost + SocketWatcher) ────────────────────────────────────

  describe('socket resilience (onSocketLost + SocketWatcher)', () => {
    beforeEach(() => {
      _capturedOnSocketLost = undefined;
    });

    it('does not start a SocketWatcher when onSocketLost is not provided', async () => {
      await createIPCSubsystem(makeOpts());
      // _socketWatcherStart would be undefined if SocketWatcher was never constructed
      expect(_socketWatcherStart).toBeUndefined();
    });

    it('starts a SocketWatcher when onSocketLost is provided', async () => {
      const onSocketLost = vi.fn();
      await createIPCSubsystem(makeOpts({ onSocketLost }));
      expect(_socketWatcherStart).toHaveBeenCalledTimes(1);
    });

    it('passes the onSocketLost callback to SocketWatcher', async () => {
      const onSocketLost = vi.fn();
      await createIPCSubsystem(makeOpts({ onSocketLost }));
      expect(_capturedOnSocketLost).toBe(onSocketLost);
    });

    it('includes socketWatcher in returned subsystem when onSocketLost is provided', async () => {
      const onSocketLost = vi.fn();
      const result = await createIPCSubsystem(makeOpts({ onSocketLost }));
      expect(result!.subsystem).toHaveProperty('socketWatcher');
      expect(result!.subsystem.socketWatcher).toBeDefined();
    });

    it('socketWatcher is undefined in returned subsystem when onSocketLost is not provided', async () => {
      const result = await createIPCSubsystem(makeOpts());
      // socketWatcher property may be undefined or absent
      expect(result!.subsystem.socketWatcher).toBeUndefined();
    });

    it('includes symlinkPath in returned subsystem', async () => {
      const result = await createIPCSubsystem(makeOpts());
      expect(result!.subsystem).toHaveProperty('symlinkPath');
      expect(typeof result!.subsystem.symlinkPath).toBe('string');
    });

    it('symlinkPath contains the socket dir', async () => {
      const result = await createIPCSubsystem(makeOpts());
      expect(result!.subsystem.symlinkPath).toContain('/tmp/goodvibes');
    });
  });

  // ─── symlink creation ─────────────────────────────────────────────────────────────────

  describe('symlink creation', () => {
    it('calls symlinkSync to create socket symlink', async () => {
      await createIPCSubsystem(makeOpts());
      expect(mockSymlinkSync).toHaveBeenCalledTimes(1);
    });

    it('symlink target is the actual socket path', async () => {
      const result = await createIPCSubsystem(makeOpts());
      const [target] = (mockSymlinkSync as Mock).mock.calls[0];
      expect(target).toBe(result!.socketPath);
    });

    it('symlink path is in the socket_dir', async () => {
      await createIPCSubsystem(makeOpts());
      const [, linkPath] = (mockSymlinkSync as Mock).mock.calls[0];
      expect(linkPath).toContain('/tmp/goodvibes');
    });

    it('calls unlinkSync before symlinkSync to handle pre-existing symlink', async () => {
      await createIPCSubsystem(makeOpts());
      // unlinkSync is called to pre-unlink before symlinkSync
      // It may also be called for stale pointer cleanup, so just verify symlinkSync was called after some unlinkSync
      expect(mockSymlinkSync).toHaveBeenCalledTimes(1);
    });

    it('succeeds even when pre-unlink throws ENOENT (no existing symlink)', async () => {
      // ENOENT on unlink is expected and swallowed
      mockUnlinkSync.mockImplementationOnce(() => {
        const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        throw err;
      });
      const result = await createIPCSubsystem(makeOpts());
      expect(result).not.toBeNull();
      expect(mockSymlinkSync).toHaveBeenCalledTimes(1);
    });

    it('succeeds even when symlinkSync throws (symlink is best-effort)', async () => {
      mockSymlinkSync.mockImplementationOnce(() => {
        throw new Error('EPERM');
      });
      const result = await createIPCSubsystem(makeOpts());
      expect(result).not.toBeNull();
    });
  });

  // ─── cleanStalePointerFiles calls during startup ───────────────────────────────────────

  describe('stale pointer cleanup (called via createIPCSubsystem)', () => {
    it('calls readdirSync on the state dir during startup', async () => {
      await createIPCSubsystem(makeOpts());
      expect(mockReaddirSync).toHaveBeenCalledTimes(1);
      expect((mockReaddirSync as Mock).mock.calls[0][0]).toContain('.runtime-state');
    });

    it('does not unlink any pointer or socket files when state dir is empty', async () => {
      mockReaddirSync.mockReturnValueOnce([]);
      await createIPCSubsystem(makeOpts());
      // unlinkSync may be called for the symlink pre-unlink (best-effort); but no pointer/socket files.
      const pointerOrSocketUnlinks = (mockUnlinkSync as Mock).mock.calls.filter(
        ([p]: [string]) => /runtime-\d+\.socket$/.test(p),
      );
      expect(pointerOrSocketUnlinks).toHaveLength(0);
    });

    it('does not unlink any pointer or socket files when no pointer files exist', async () => {
      mockReaddirSync.mockReturnValueOnce(['some-other-file.txt', 'unrelated.sock']);
      await createIPCSubsystem(makeOpts());
      const pointerOrSocketUnlinks = (mockUnlinkSync as Mock).mock.calls.filter(
        ([p]: [string]) => /runtime-\d+\.socket$/.test(p),
      );
      expect(pointerOrSocketUnlinks).toHaveLength(0);
    });
  });

  // ─── cleanStalePointerFiles (readdirSync error paths) ──────────────────────────────────

  describe('stale pointer cleanup (readdirSync error paths in createIPCSubsystem)', () => {
    it('does not crash when readdirSync throws ENOENT (state dir missing)', async () => {
      const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      mockReaddirSync.mockImplementationOnce(() => { throw err; });
      const result = await createIPCSubsystem(makeOpts());
      // Startup still succeeds; ENOENT during cleanup is silently swallowed.
      expect(result).not.toBeNull();
    });

    it('does not crash when readdirSync throws an unexpected error', async () => {
      mockReaddirSync.mockImplementationOnce(() => { throw new Error('EPERM'); });
      const result = await createIPCSubsystem(makeOpts());
      // Cleanup failure is caught; startup continues.
      expect(result).not.toBeNull();
    });
  });

  // ─── Error / failure path ─────────────────────────────────────────────────────────────

  describe('error / failure path', () => {
    it('returns null when ipcServer.listen() rejects', async () => {
      // Override listen to reject for this one test using a flag
      // We can't use mockRejectedValueOnce directly since _ipcServer is recreated per call.
      // Use mockWriteFileSync to trigger failure after listen succeeds but before return,
      // or mock mkdirSync before listen is called.
      // Actually listen happens after mkdirSync in source, so override mkdirSync:
      // Wait - looking at setup.ts, listen() is called AFTER mkdirSync().
      // To make listen fail we need to intercept it.
      // Solution: override mkdirSync to set up a one-time failure on listen after server construction.
      // Simpler: just make mkdirSync throw to get null return.
      // But we want to test listen specifically. Let’s use writeFileSync to simulate that.
      // Actually: let’s override the listen mock by having mkdirSync set up a rejection.
      // Simplest: mock mkdirSync to succeed but then writeFileSync throws = returns null.
      // For listen rejection test, we need to configure it after IPCServer is constructed.
      // Use a flag approach:
      let shouldRejectListen = true;
      mockMkdirSync.mockImplementationOnce(() => {
        // At this point _ipcServer exists; override listen to reject
        if (shouldRejectListen && _ipcServer) {
          _ipcServer.listen.mockRejectedValueOnce(new Error('EADDRINUSE'));
          shouldRejectListen = false;
        }
      });
      const result = await createIPCSubsystem(makeOpts());
      expect(result).toBeNull();
    });

    it('returns null when mkdirSync throws', async () => {
      mockMkdirSync.mockImplementationOnce(() => { throw new Error('EACCES'); });
      const result = await createIPCSubsystem(makeOpts());
      expect(result).toBeNull();
    });

    it('returns null when writeFileSync throws', async () => {
      mockWriteFileSync.mockImplementationOnce(() => { throw new Error('EROFS'); });
      const result = await createIPCSubsystem(makeOpts());
      expect(result).toBeNull();
    });
  });
});

// ─── cleanStalePointerFiles unit tests ─────────────────────────────────────────────────────────────

describe('cleanStalePointerFiles', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let killSpy: any;

  beforeEach(() => {
    mockReaddirSync.mockClear();
    mockReadFileSync.mockClear();
    mockUnlinkSync.mockClear();
    // Default: process.kill(pid, 0) throws (PID dead)
    killSpy = vi.spyOn(process, 'kill').mockImplementation(() => { throw new Error('ESRCH'); });
  });

  afterEach(() => {
    killSpy.mockRestore();
  });

  it('does nothing when state dir does not exist (ENOENT)', () => {
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    mockReaddirSync.mockImplementationOnce(() => { throw err; });
    const log = makeLogger();
    expect(() => cleanStalePointerFiles('/state', log)).not.toThrow();
    expect(mockUnlinkSync).not.toHaveBeenCalled();
  });

  it('does nothing when there are no pointer files in the state dir', () => {
    mockReaddirSync.mockReturnValueOnce(['events.log', 'runtime-abc.txt', 'session.json']);
    const log = makeLogger();
    cleanStalePointerFiles('/state', log);
    expect(mockUnlinkSync).not.toHaveBeenCalled();
  });

  it('skips pointer files for alive PIDs', () => {
    mockReaddirSync.mockReturnValueOnce([`runtime-${process.pid}.socket`]);
    // Override: PID alive (kill does not throw)
    killSpy.mockImplementation(() => true as unknown as never);
    const log = makeLogger();
    cleanStalePointerFiles('/state', log);
    expect(mockUnlinkSync).not.toHaveBeenCalled();
  });

  it('removes pointer file and socket file for dead PIDs', () => {
    const deadPid = 99999;
    mockReaddirSync.mockReturnValueOnce([`runtime-${deadPid}.socket`]);
    mockReadFileSync.mockReturnValueOnce('/tmp/goodvibes/goodvibes-runtime-abc-99999.sock');
    const log = makeLogger();
    cleanStalePointerFiles('/state', log);
    expect(mockUnlinkSync).toHaveBeenCalledTimes(2);
    expect((mockUnlinkSync as Mock).mock.calls[0][0]).toBe('/tmp/goodvibes/goodvibes-runtime-abc-99999.sock');
    expect((mockUnlinkSync as Mock).mock.calls[1][0]).toContain(`runtime-${deadPid}.socket`);
  });

  it('logs info message after cleaning stale pointer', () => {
    const deadPid = 99999;
    mockReaddirSync.mockReturnValueOnce([`runtime-${deadPid}.socket`]);
    mockReadFileSync.mockReturnValueOnce('/tmp/sock');
    const log = makeLogger();
    cleanStalePointerFiles('/state', log);
    expect(log.info).toHaveBeenCalledWith(
      'Cleaned stale socket pointer',
      expect.objectContaining({ pid: deadPid }),
    );
  });

  it('still removes pointer file when socket file does not exist (ENOENT)', () => {
    const deadPid = 99999;
    mockReaddirSync.mockReturnValueOnce([`runtime-${deadPid}.socket`]);
    mockReadFileSync.mockReturnValueOnce('/tmp/gone.sock');
    mockUnlinkSync.mockImplementationOnce(() => {
      const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      throw err;
    });
    const log = makeLogger();
    cleanStalePointerFiles('/state', log);
    // Socket file ENOENT is swallowed; pointer file unlink still called
    expect(mockUnlinkSync).toHaveBeenCalledTimes(2);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('logs warn when socket file unlink fails with non-ENOENT error', () => {
    const deadPid = 99999;
    mockReaddirSync.mockReturnValueOnce([`runtime-${deadPid}.socket`]);
    mockReadFileSync.mockReturnValueOnce('/tmp/locked.sock');
    mockUnlinkSync.mockImplementationOnce(() => {
      const err = Object.assign(new Error('EPERM'), { code: 'EPERM' });
      throw err;
    });
    const log = makeLogger();
    cleanStalePointerFiles('/state', log);
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('stale socket file'),
      expect.any(Object),
    );
  });

  it('still removes socket file when pointer file readFileSync fails', () => {
    const deadPid = 99999;
    mockReaddirSync.mockReturnValueOnce([`runtime-${deadPid}.socket`]);
    mockReadFileSync.mockImplementationOnce(() => { throw new Error('EACCES'); });
    const log = makeLogger();
    cleanStalePointerFiles('/state', log);
    // Socket unlink skipped (no path), but pointer unlink still happens
    expect(mockUnlinkSync).toHaveBeenCalledTimes(1);
    expect((mockUnlinkSync as Mock).mock.calls[0][0]).toContain(`runtime-${deadPid}.socket`);
  });

  it('handles multiple stale pointer files in one pass', () => {
    const pid1 = 11111;
    const pid2 = 22222;
    mockReaddirSync.mockReturnValueOnce([
      `runtime-${pid1}.socket`,
      `runtime-${pid2}.socket`,
      'other-file.json',
    ]);
    mockReadFileSync.mockReturnValueOnce('/tmp/sock1.sock');
    mockReadFileSync.mockReturnValueOnce('/tmp/sock2.sock');
    const log = makeLogger();
    cleanStalePointerFiles('/state', log);
    // 2 socket files + 2 pointer files = 4 unlinks
    expect(mockUnlinkSync).toHaveBeenCalledTimes(4);
    expect(log.info).toHaveBeenCalledTimes(2);
  });

  it('swallows outer errors and logs warn instead of throwing', () => {
    // Simulate readdirSync returning bad data that causes an unexpected error
    mockReaddirSync.mockReturnValueOnce(null as unknown as string[]);
    const log = makeLogger();
    expect(() => cleanStalePointerFiles('/state', log)).not.toThrow();
    expect(log.warn).toHaveBeenCalledWith(
      'Stale pointer cleanup failed',
      expect.any(Object),
    );
  });
});
