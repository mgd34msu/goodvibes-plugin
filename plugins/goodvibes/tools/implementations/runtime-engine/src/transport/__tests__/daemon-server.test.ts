/**
 * Tests for DaemonServer — Unix socket server hosting RuntimeEngine for remote sessions.
 *
 * Strategy:
 * - Mock node:net and node:fs to avoid real I/O
 * - Mock RuntimeEngine and LocalTransport for delegation verification
 * - Test server lifecycle, session management, RPC dispatch, and error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const {
  MockServer, MockSocket, mockCreateServer, getCapturedConnectionHandler,
  mockMkdirSync, mockExistsSync, mockUnlinkSync, mockChmodSync,
} = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter } = require('node:events') as { EventEmitter: typeof import('node:events').EventEmitter };

  class MockServer extends EventEmitter {
    _listenCb: (() => void) | null = null;
    _closeCb: (() => void) | null = null;
    listen = vi.fn((_path: string, cb: () => void) => {
      this._listenCb = cb;
      return this;
    });
    close = vi.fn((cb?: () => void) => {
      this._closeCb = cb ?? null;
      return this;
    });
    removeListener = vi.fn();
  }

  class MockSocket extends EventEmitter {
    writeData: string[] = [];
    destroyed = false;
    write = vi.fn((data?: string) => {
      if (data) this.writeData.push(data);
    });
    end = vi.fn();
    destroy = vi.fn(() => { this.destroyed = true; });
    pause = vi.fn();
  }

  let capturedHandler: ((socket: unknown) => void) | null = null;
  let serverInstance: MockServer | null = null;

  const mockCreateServer = vi.fn((handler: (socket: unknown) => void) => {
    capturedHandler = handler;
    serverInstance = new MockServer();
    return serverInstance;
  });

  return {
    MockServer,
    MockSocket,
    mockCreateServer,
    getCapturedConnectionHandler: () => capturedHandler!,
    getMockServerInstance: () => serverInstance!,
    mockMkdirSync: vi.fn(),
    mockExistsSync: vi.fn().mockReturnValue(false),
    mockUnlinkSync: vi.fn(),
    mockChmodSync: vi.fn(),
  };
});

vi.mock('node:net', () => ({ createServer: mockCreateServer }));
vi.mock('node:fs', () => ({
  mkdirSync: mockMkdirSync,
  existsSync: mockExistsSync,
  unlinkSync: mockUnlinkSync,
  chmodSync: mockChmodSync,
  default: {
    mkdirSync: mockMkdirSync,
    existsSync: mockExistsSync,
    unlinkSync: mockUnlinkSync,
    chmodSync: mockChmodSync,
  },
}));
vi.mock('node:path', () => ({
  dirname: vi.fn((p: string) => p.split('/').slice(0, -1).join('/')),
  default: { dirname: vi.fn((p: string) => p.split('/').slice(0, -1).join('/')) },
}));
vi.mock('../../../shared/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  })),
}));

// Mock LocalTransport to verify delegation
const mockLocalTransportInstance = {
  getUptime: vi.fn().mockResolvedValue(5000),
  getConfig: vi.fn().mockResolvedValue({}),
  getHealth: vi.fn().mockResolvedValue({ status: 'healthy' }),
  getVersion: vi.fn().mockResolvedValue('1.0.0'),
  getProjectRoot: vi.fn().mockResolvedValue('/test'),
  updateConfig: vi.fn().mockResolvedValue(undefined),
  getState: vi.fn().mockResolvedValue(undefined),
  setState: vi.fn().mockResolvedValue(undefined),
  deleteState: vi.fn().mockResolvedValue(undefined),
  listStateKeys: vi.fn().mockResolvedValue([]),
  getStateSnapshot: vi.fn().mockResolvedValue({}),
  emitEvent: vi.fn().mockResolvedValue(undefined),
  queryEvents: vi.fn().mockResolvedValue([]),
  getQueueDepth: vi.fn().mockResolvedValue(0),
  getWorkflow: vi.fn().mockResolvedValue(null),
  listWorkflows: vi.fn().mockResolvedValue([]),
  startWorkflow: vi.fn().mockResolvedValue({ workflow_id: 'wf-1' }),
  transitionWorkflow: vi.fn().mockResolvedValue({}),
  listTriggers: vi.fn().mockResolvedValue([]),
  getTrigger: vi.fn().mockResolvedValue(null),
  registerTrigger: vi.fn().mockResolvedValue(undefined),
  unregisterTrigger: vi.fn().mockResolvedValue(false),
  getAgent: vi.fn().mockResolvedValue(null),
  listAgents: vi.fn().mockResolvedValue([]),
  drainDirectives: vi.fn().mockResolvedValue({ directives: [] }),
};

const MockLocalTransport = vi.fn(() => mockLocalTransportInstance);
vi.mock('../local-transport.js', () => ({
  LocalTransport: MockLocalTransport,
}));

import { DaemonServer } from '../daemon-server.js';

// Mock engine with all accessor methods
function createMockEngine() {
  return {
    isRunning: vi.fn().mockReturnValue(true),
    getUptime: vi.fn().mockReturnValue(5000),
    getConfig: vi.fn().mockReturnValue({}),
    getHealthChecker: vi.fn().mockReturnValue({ check: vi.fn().mockReturnValue({ status: 'healthy' }) }),
    getProjectRoot: vi.fn().mockReturnValue('/test'),
    updateConfig: vi.fn(),
    getCoreStateStore: vi.fn().mockReturnValue({
      get: vi.fn(), set: vi.fn(), delete: vi.fn(), keys: vi.fn(), snapshot: vi.fn(),
    }),
    getEventBus: vi.fn().mockReturnValue({ emit: vi.fn() }),
    getEventLog: vi.fn().mockReturnValue({ query: vi.fn() }),
    getEventQueue: vi.fn().mockReturnValue({ depth: vi.fn().mockReturnValue(0) }),
    getWorkflowEngine: vi.fn().mockReturnValue(null),
    getTriggerRegistry: vi.fn().mockReturnValue(null),
    getAgentCoordinator: vi.fn().mockReturnValue(null),
    getDirectiveQueue: vi.fn().mockReturnValue(null),
  };
}

describe('DaemonServer', () => {
  const SOCKET_PATH = '/tmp/goodvibes-daemon-test.sock';
  let server: DaemonServer;
  let engine: ReturnType<typeof createMockEngine>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
    // Restore LocalTransport mock methods after clearAllMocks
    mockLocalTransportInstance.getUptime.mockResolvedValue(5000);
    engine = createMockEngine();
    server = new DaemonServer(engine as any, SOCKET_PATH);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── Shared helpers ─────────────────────────────────────────────────────────

  /** Start the server and resolve when listening */
  async function startServer(): Promise<void> {
    const startPromise = server.start();
    const srv = mockCreateServer.mock.results[0].value as InstanceType<typeof MockServer>;
    srv._listenCb?.();
    await startPromise;
  }

  /** Send a message to an already-started server via a simulated socket connection */
  async function sendMessage(message: Record<string, unknown>): Promise<string> {
    const handler = getCapturedConnectionHandler();
    const socket = new MockSocket();
    handler(socket);

    socket.emit('data', Buffer.from(JSON.stringify(message) + '\n'));
    await new Promise((r) => setTimeout(r, 10));

    return (socket as any).writeData[0] || (socket as any).endData?.[0] || '';
  }

  // ─── start() ───────────────────────────────────────────────────────────

  describe('start', () => {
    it('creates directory, binds server, and sets chmod 0o600', async () => {
      await startServer();

      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ recursive: true }),
      );
      expect(mockCreateServer).toHaveBeenCalledOnce();
      expect(mockChmodSync).toHaveBeenCalledWith(SOCKET_PATH, 0o600);
    });

    it('removes stale socket if it exists', async () => {
      mockExistsSync.mockReturnValue(true);
      await startServer();

      expect(mockUnlinkSync).toHaveBeenCalledWith(SOCKET_PATH);
    });
  });

  // ─── stop() ────────────────────────────────────────────────────────────

  describe('stop', () => {
    it('resolves immediately when server was never started', async () => {
      await expect(server.stop()).resolves.toBeUndefined();
    });

    it('closes server, unlinks socket, and destroys active connections after start', async () => {
      await startServer();

      // Simulate an active connection
      const handler = getCapturedConnectionHandler();
      const activeSocket = new MockSocket();
      handler(activeSocket);

      const stopPromise = server.stop();
      const srv = mockCreateServer.mock.results[0].value as InstanceType<typeof MockServer>;
      srv._closeCb?.();
      await stopPromise;

      expect(srv.close).toHaveBeenCalledOnce();
      expect(mockUnlinkSync).toHaveBeenCalledWith(SOCKET_PATH);
      expect(activeSocket.destroy).toHaveBeenCalled();
    });
  });

  // ─── Connection timeout ─────────────────────────────────────────────────

  describe('connection timeout', () => {
    it('destroys idle connections after 10 seconds', async () => {
      vi.useFakeTimers();
      await startServer();

      const handler = getCapturedConnectionHandler();
      const socket = new MockSocket();
      handler(socket);

      // Advance time by 10 seconds — idle connection should be timed out
      vi.advanceTimersByTime(10_000);

      expect(socket.destroy).toHaveBeenCalled();
    });
  });

  // ─── getSessionCount() ──────────────────────────────────────────────────

  describe('getSessionCount', () => {
    it('returns 0 initially', () => {
      expect(server.getSessionCount()).toBe(0);
    });
  });

  // ─── Session management via socket messages ─────────────────────────────

  describe('session management', () => {
    beforeEach(async () => {
      await startServer();
    });

    it('session_join increases count', async () => {
      const response = await sendMessage({
        type: 'session_join', id: 'msg-1', session_id: 'sess-a',
      });
      const parsed = JSON.parse(response.trim());
      expect(parsed.status).toBe('ok');
      expect(server.getSessionCount()).toBe(1);
    });

    it('session_leave decreases count', async () => {
      await sendMessage({ type: 'session_join', id: 'm1', session_id: 'sess-a' });
      expect(server.getSessionCount()).toBe(1);

      await sendMessage({ type: 'session_leave', id: 'm2', session_id: 'sess-a' });
      expect(server.getSessionCount()).toBe(0);
    });

    it('duplicate join is idempotent', async () => {
      await sendMessage({ type: 'session_join', id: 'm1', session_id: 'sess-a' });
      await sendMessage({ type: 'session_join', id: 'm2', session_id: 'sess-a' });
      expect(server.getSessionCount()).toBe(1);
    });
  });

  // ─── RPC guard ──────────────────────────────────────────────────────────

  describe('RPC session guard', () => {
    beforeEach(async () => {
      await startServer();
    });

    it('rejects rpc_call from unregistered session', async () => {
      const response = await sendMessage({
        type: 'rpc_call', id: 'msg-1', method: 'getUptime', args: [],
        session_id: 'unregistered',
      });
      const parsed = JSON.parse(response.trim());
      expect(parsed.status).toBe('error');
      expect(parsed.error).toMatch(/not registered|session_join/i);
    });
  });

  // ─── RPC dispatch ───────────────────────────────────────────────────────

  describe('RPC dispatch', () => {
    beforeEach(async () => {
      await startServer();
      await sendMessage({ type: 'session_join', id: 'm1', session_id: 'sess-a' });
    });

    it('dispatches getUptime through LocalTransport and returns result', async () => {
      mockLocalTransportInstance.getUptime.mockResolvedValue(9999);

      const response = await sendMessage({
        type: 'rpc_call', id: 'msg-2', method: 'getUptime', args: [],
        session_id: 'sess-a',
      });
      const parsed = JSON.parse(response.trim());
      expect(parsed.status).toBe('ok');
      expect(parsed.result).toBe(9999);

      // Verify LocalTransport was instantiated and its method was called
      expect(MockLocalTransport).toHaveBeenCalled();
      expect(mockLocalTransportInstance.getUptime).toHaveBeenCalled();
    });
  });

  // ─── RPC unknown method ──────────────────────────────────────────────────

  describe('RPC unknown method', () => {
    beforeEach(async () => {
      await startServer();
      await sendMessage({ type: 'session_join', id: 'm1', session_id: 'sess-a' });
    });

    it('returns error for unknown method', async () => {
      const response = await sendMessage({
        type: 'rpc_call', id: 'msg-2', method: 'nonExistentMethod', args: [],
        session_id: 'sess-a',
      });
      const parsed = JSON.parse(response.trim());
      expect(parsed.status).toBe('error');
      expect(parsed.error).toMatch(/unknown method/i);
    });
  });

  // ─── Invalid JSON ───────────────────────────────────────────────────────

  describe('invalid JSON', () => {
    it('returns error for malformed message', async () => {
      await startServer();

      const handler = getCapturedConnectionHandler();
      const socket = new MockSocket();
      handler(socket);

      socket.emit('data', Buffer.from('not valid json\n'));
      await new Promise((r) => setTimeout(r, 10));

      const response = (socket as any).writeData[0] || (socket as any).endData?.[0] || '';
      const parsed = JSON.parse(response.trim());
      expect(parsed.status).toBe('error');
      expect(parsed.error).toMatch(/invalid json/i);
    });
  });

  // ─── Unknown message type ────────────────────────────────────────────────

  describe('unknown message type', () => {
    beforeEach(async () => {
      await startServer();
    });

    it('returns error for unrecognized type', async () => {
      const response = await sendMessage({
        type: 'unknown_type', id: 'msg-1',
      });
      const parsed = JSON.parse(response.trim());
      expect(parsed.status).toBe('error');
      expect(parsed.error).toMatch(/unknown.*type/i);
    });
  });
});
