import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

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

// IPCServer mock — stable object reference
const mockIPCServer = {
  onMessage: vi.fn(),
  setWriteResultCallback: vi.fn(),
  listen: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../../../shared/ipc/ipc-server.js', () => ({
  IPCServer: vi.fn().mockImplementation(() => mockIPCServer),
}));

// IPCRouter mock — stable object reference
const mockIPCRouter = {
  route: vi.fn(),
  setAgentWorkflowResolver: vi.fn(),
  removeSessionPointers: vi.fn(),
};

vi.mock('../ipc-router.js', () => ({
  IPCRouter: vi.fn().mockImplementation(() => mockIPCRouter),
}));

// fs mocks
const mockMkdirSync = vi.fn();
const mockWriteFileSync = vi.fn();

vi.mock('node:fs', () => ({
  mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
}));

// crypto mock — deterministic 8-char hash prefix
vi.mock('node:crypto', () => ({
  createHash: () => ({
    update: function(this: object) { return this; },
    digest: () => 'abcd1234deadbeef0123456789abcdef',
  }),
}));

// path: real implementation
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

import { createIPCSubsystem } from '../setup.js';
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

/**
 * Reset call history on stable mock objects without wiping implementations.
 * We avoid vi.clearAllMocks() because it wipes mockImplementation on constructor mocks.
 */
function resetMocks() {
  mockIPCServer.onMessage.mockClear();
  mockIPCServer.setWriteResultCallback.mockClear();
  mockIPCServer.listen.mockClear();
  mockIPCServer.listen.mockResolvedValue(undefined);
  mockIPCServer.close.mockClear();
  mockIPCServer.close.mockResolvedValue(undefined);

  mockIPCRouter.route.mockClear();
  mockIPCRouter.setAgentWorkflowResolver.mockClear();
  mockIPCRouter.removeSessionPointers.mockClear();

  mockMkdirSync.mockClear();
  mockWriteFileSync.mockClear();
  mockEnsureDirSync.mockClear();
}

// ─── Tests ─────────────────────────────────────────────────────────────────────────────

describe('createIPCSubsystem', () => {
  beforeEach(() => {
    resetMocks();
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
      expect(result!.subsystem.ipcServer).toBe(mockIPCServer);
    });

    it('subsystem.ipcRouter is the IPCRouter instance', async () => {
      const result = await createIPCSubsystem(makeOpts());
      expect(result!.subsystem.ipcRouter).toBe(mockIPCRouter);
    });

    it('socketPath in result matches subsystem.socketPath', async () => {
      const result = await createIPCSubsystem(makeOpts());
      expect(result!.socketPath).toBe(result!.subsystem.socketPath);
    });
  });

  // ─── Socket path generation ───────────────────────────────────────────────────────────

  describe('socket path generation', () => {
    it('socket path includes the socket_dir prefix', async () => {
      const result = await createIPCSubsystem(makeOpts());
      expect(result!.socketPath).toContain('/tmp/goodvibes');
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
      expect(mockIPCServer.onMessage).toHaveBeenCalledWith(expect.any(Function));
    });

    it('calls ipcServer.listen()', async () => {
      await createIPCSubsystem(makeOpts());
      expect(mockIPCServer.listen).toHaveBeenCalledTimes(1);
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
      expect(mockIPCServer.setWriteResultCallback).toHaveBeenCalledTimes(1);
    });

    it('does not set write result callback when directiveQueue is null', async () => {
      await createIPCSubsystem(makeOpts({ directiveQueue: null }));
      expect(mockIPCServer.setWriteResultCallback).not.toHaveBeenCalled();
    });

    it('calls releaseHold on successful write', async () => {
      const directiveQueue = {
        releaseHold: vi.fn(),
        reEnqueueHold: vi.fn(),
      } as unknown as import('../../directives/directive-queue.js').DirectiveQueue;

      await createIPCSubsystem(makeOpts({ directiveQueue }));

      const [callback] = (mockIPCServer.setWriteResultCallback as Mock).mock.calls[0];
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

      const [callback] = (mockIPCServer.setWriteResultCallback as Mock).mock.calls[0];
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
      expect(mockIPCRouter.setAgentWorkflowResolver).toHaveBeenCalledWith(expect.any(Function));
    });

    it('does not set agent workflow resolver when agentWorkflowMap is null', async () => {
      await createIPCSubsystem(makeOpts({ agentWorkflowMap: null }));
      expect(mockIPCRouter.setAgentWorkflowResolver).not.toHaveBeenCalled();
    });

    it('resolver calls agentWorkflowMap.lookup and returns workflow id', async () => {
      const agentWorkflowMap = {
        lookup: vi.fn().mockReturnValue('wf-789'),
      } as unknown as import('../../directives/agent-workflow-map.js').AgentWorkflowMap;

      await createIPCSubsystem(makeOpts({ agentWorkflowMap }));

      const [resolver] = (mockIPCRouter.setAgentWorkflowResolver as Mock).mock.calls[0];
      const result = resolver('agent-abc');
      expect(agentWorkflowMap.lookup).toHaveBeenCalledWith('agent-abc');
      expect(result).toBe('wf-789');
    });

    it('resolver returns null when lookup returns undefined', async () => {
      const agentWorkflowMap = {
        lookup: vi.fn().mockReturnValue(undefined),
      } as unknown as import('../../directives/agent-workflow-map.js').AgentWorkflowMap;

      await createIPCSubsystem(makeOpts({ agentWorkflowMap }));
      const [resolver] = (mockIPCRouter.setAgentWorkflowResolver as Mock).mock.calls[0];
      expect(resolver('unknown-agent')).toBeNull();
    });
  });

  // ─── Error / failure path ─────────────────────────────────────────────────────────────

  describe('error / failure path', () => {
    it('returns null when ipcServer.listen() rejects', async () => {
      mockIPCServer.listen.mockRejectedValueOnce(new Error('EADDRINUSE'));
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
