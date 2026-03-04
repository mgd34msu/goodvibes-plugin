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
  MockLocalTransport, mockLocalTransportInstance,
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

  // LocalTransport mock — hoisted so vi.mock factory can reference it
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
  // Use a regular function (not arrow) so it can be called with `new`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MockLocalTransport = vi.fn(function MockLocalTransportCtor(this: any) {
    Object.assign(this, mockLocalTransportInstance);
    return mockLocalTransportInstance;
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
    MockLocalTransport,
    mockLocalTransportInstance,
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
    // Restore LocalTransport mock state after clearAllMocks (vi.clearAllMocks resets implementations)
    mockLocalTransportInstance.getUptime.mockResolvedValue(5000);
    // Restore with a regular function so it can be called with `new`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    MockLocalTransport.mockImplementation(function(this: any) {
      Object.assign(this, mockLocalTransportInstance);
      return mockLocalTransportInstance;
    });
    engine = createMockEngine();
    server = new DaemonServer({ engine: engine as any, socketPath: SOCKET_PATH });
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

  /**
   * Create a persistent socket connection to the already-started server.
   * Returns the socket so multiple messages can be sent through the same connection.
   */
  function createConnection(): InstanceType<typeof MockSocket> {
    const handler = getCapturedConnectionHandler();
    const socket = new MockSocket();
    handler(socket);
    return socket;
  }

  /** Send a single message through a new connection and return the response */
  async function sendMessage(message: Record<string, unknown>): Promise<string> {
    const socket = createConnection();
    socket.emit('data', Buffer.from(JSON.stringify(message) + '\n'));
    await new Promise((r) => setTimeout(r, 10));
    return socket.writeData[0] || '';
  }

  /** Send a message through an existing socket and return the next response written */
  async function sendOnSocket(
    socket: InstanceType<typeof MockSocket>,
    message: Record<string, unknown>,
  ): Promise<string> {
    const prevCount = socket.writeData.length;
    socket.emit('data', Buffer.from(JSON.stringify(message) + '\n'));
    await new Promise((r) => setTimeout(r, 10));
    return socket.writeData[prevCount] || '';
  }

  // ─── start() ───────────────────────────────────────────────────────────

  describe('start', () => {
    it('creates a server and binds to the socket path', async () => {
      await startServer();

      expect(mockCreateServer).toHaveBeenCalledOnce();
      const srv = mockCreateServer.mock.results[0].value as InstanceType<typeof MockServer>;
      expect(srv.listen).toHaveBeenCalledWith(SOCKET_PATH, expect.any(Function));
    });

    it('resolves after the listen callback fires', async () => {
      const startPromise = server.start();
      const srv = mockCreateServer.mock.results[0].value as InstanceType<typeof MockServer>;

      let resolved = false;
      startPromise.then(() => { resolved = true; });

      await Promise.resolve();
      expect(resolved).toBe(false);

      srv._listenCb?.();
      await startPromise;
      expect(resolved).toBe(true);
    });
  });

  // ─── stop() ────────────────────────────────────────────────────────────

  describe('stop', () => {
    it('resolves immediately when server was never started', async () => {
      await expect(server.stop()).resolves.toBeUndefined();
    });

    it('closes server, unlinks socket, and destroys active connections after start', async () => {
      await startServer();

      // Create an active connection with a registered session
      const activeSocket = createConnection();
      await sendOnSocket(activeSocket, { type: 'session_join', id: 'm1', session_id: 'sess-stop' });

      const srv = mockCreateServer.mock.results[0].value as InstanceType<typeof MockServer>;

      // Stop the server — the dynamic import of node:fs means srv.close() is called asynchronously
      const stopPromise = server.stop();
      // Wait until srv.close() has been called by the implementation
      await vi.waitFor(() => expect(srv.close).toHaveBeenCalled(), { timeout: 1000 });
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

      const socket = createConnection();

      // Advance 10 seconds without sending any data — idle timer should fire
      vi.advanceTimersByTime(10_000);

      expect(socket.destroy).toHaveBeenCalled();
    });

    it('does not destroy connections that receive data before timeout', async () => {
      vi.useFakeTimers();
      await startServer();

      const socket = createConnection();
      // Send a message before the timer fires — clears the idle timer
      socket.emit('data', Buffer.from(JSON.stringify({ type: 'session_join', id: 'm1', session_id: 'sess-t' }) + '\n'));

      // Advance past the timeout — timer was cleared by the data event
      vi.advanceTimersByTime(10_000);

      expect(socket.destroy).not.toHaveBeenCalled();
    });
  });

  // ─── getSessionCount() ──────────────────────────────────────────────────

  describe('getSessionCount', () => {
    it('returns 0 initially', () => {
      expect(server.getSessionCount()).toBe(0);
    });

    it('increases after session_join', async () => {
      await startServer();
      const socket = createConnection();
      await sendOnSocket(socket, { type: 'session_join', id: 'm1', session_id: 'sess-a' });
      expect(server.getSessionCount()).toBe(1);
    });

    it('decreases after session_leave', async () => {
      await startServer();
      const socket = createConnection();
      await sendOnSocket(socket, { type: 'session_join', id: 'm1', session_id: 'sess-a' });
      expect(server.getSessionCount()).toBe(1);

      await sendOnSocket(socket, { type: 'session_leave', id: 'm2', session_id: 'sess-a' });
      expect(server.getSessionCount()).toBe(0);
    });
  });

  // ─── Session management via socket messages ─────────────────────────────

  describe('session management', () => {
    beforeEach(async () => {
      await startServer();
    });

    it('session_join acknowledges with ok status', async () => {
      const response = await sendMessage({
        type: 'session_join', id: 'msg-1', session_id: 'sess-a',
      });
      const parsed = JSON.parse(response.trim());
      expect(parsed.status).toBe('ok');
    });

    it('session_leave acknowledges with ok status', async () => {
      const socket = createConnection();
      await sendOnSocket(socket, { type: 'session_join', id: 'm1', session_id: 'sess-a' });

      const response = await sendOnSocket(socket, { type: 'session_leave', id: 'm2', session_id: 'sess-a' });
      const parsed = JSON.parse(response.trim());
      expect(parsed.status).toBe('ok');
    });

    it('duplicate join with same session_id on same socket is idempotent', async () => {
      const socket = createConnection();
      await sendOnSocket(socket, { type: 'session_join', id: 'm1', session_id: 'sess-a' });
      await sendOnSocket(socket, { type: 'session_join', id: 'm2', session_id: 'sess-a' });
      expect(server.getSessionCount()).toBe(1);
    });
  });

  // ─── RPC guard ──────────────────────────────────────────────────────────

  describe('RPC session guard', () => {
    beforeEach(async () => {
      await startServer();
    });

    it('rejects rpc_call from a connection that has not called session_join', async () => {
      const response = await sendMessage({
        type: 'rpc_call', id: 'msg-1', method: 'getUptime', args: [],
        session_id: 'unregistered',
      });
      const parsed = JSON.parse(response.trim());
      expect(parsed.status).toBe('error');
      expect(parsed.error).toMatch(/session_join/i);
    });
  });

  // ─── RPC dispatch ───────────────────────────────────────────────────────

  describe('RPC dispatch', () => {
    beforeEach(async () => {
      await startServer();
    });

    it('dispatches getUptime through LocalTransport and returns result', async () => {
      mockLocalTransportInstance.getUptime.mockResolvedValue(9999);

      const socket = createConnection();
      await sendOnSocket(socket, { type: 'session_join', id: 'm1', session_id: 'sess-rpc' });

      const rpcResponse = await sendOnSocket(socket, {
        type: 'rpc_call', id: 'msg-2', method: 'getUptime', args: [],
        session_id: 'sess-rpc',
      });
      const parsed = JSON.parse(rpcResponse.trim());
      expect(parsed.status).toBe('ok');
      expect(parsed.result).toBe(9999);

      // Verify LocalTransport was instantiated with the engine as the intermediary
      expect(MockLocalTransport).toHaveBeenCalledWith(engine);
      expect(mockLocalTransportInstance.getUptime).toHaveBeenCalled();
    });
  });

  // ─── RPC unknown method ──────────────────────────────────────────────────

  describe('RPC unknown method', () => {
    beforeEach(async () => {
      await startServer();
    });

    it('returns error for unknown method', async () => {
      const socket = createConnection();
      await sendOnSocket(socket, { type: 'session_join', id: 'm1', session_id: 'sess-b' });

      const response = await sendOnSocket(socket, {
        type: 'rpc_call', id: 'msg-2', method: 'nonExistentMethod', args: [],
        session_id: 'sess-b',
      });
      const parsed = JSON.parse(response.trim());
      expect(parsed.status).toBe('error');
      expect(parsed.error).toMatch(/unknown.*method/i);
    });
  });

  // ─── Invalid JSON ───────────────────────────────────────────────────────

  describe('invalid JSON', () => {
    it('returns error for malformed message', async () => {
      await startServer();

      const socket = createConnection();
      socket.emit('data', Buffer.from('not valid json\n'));
      await new Promise((r) => setTimeout(r, 10));

      const response = socket.writeData[0] || '';
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
