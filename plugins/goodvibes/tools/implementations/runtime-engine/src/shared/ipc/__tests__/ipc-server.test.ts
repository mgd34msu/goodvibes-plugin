/**
 * Tests for IPCServer — Unix domain socket server for hook ↔ runtime engine communication.
 *
 * Strategy:
 * - Mock node:net to avoid real socket I/O
 * - Mock node:fs to avoid real filesystem operations
 * - Test all public API surface: listen, close, onMessage, setWriteResultCallback
 * - Test connection handling via simulated socket events
 * - Test message framing, parsing, validation, and response writing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted mock variables (must come before vi.mock calls) ──────────────────────
//
// IMPORTANT: vi.hoisted() cannot reference ES module imports (they are not
// yet initialized when hoisted code runs). Use require() or keep factories
// free of import references.
const {
  mockMkdirSync,
  mockExistsSync,
  mockUnlinkSync,
  mockChmodSync,
  mockCreateServer,
  getCapturedConnectionHandler,
  getMockServerInstance,
} = vi.hoisted(() => {
  // Inline EventEmitter via require so we don't depend on ES import hoisting
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter } = require('node:events') as { EventEmitter: typeof import('node:events').EventEmitter };

  type ListenFn = (path: string, cb: () => void) => MockServer;
  type CloseFn = (cb?: () => void) => MockServer;

  class MockServer extends EventEmitter {
    listen: ReturnType<typeof vi.fn> & ListenFn;
    close: ReturnType<typeof vi.fn> & CloseFn;
    removeListener: ReturnType<typeof vi.fn> & ((eventName: string | symbol, listener: (...args: any[]) => void) => this);
    _listenCallback: (() => void) | null = null;
    _closeCallback: (() => void) | null = null;

    constructor() {
      super();
      this.listen = vi.fn((_path: string, cb: () => void) => {
        this._listenCallback = cb;
        return this;
      }) as ReturnType<typeof vi.fn> & ListenFn;
      this.close = vi.fn((cb?: () => void) => {
        this._closeCallback = cb ?? null;
        return this;
      }) as ReturnType<typeof vi.fn> & CloseFn;
      this.removeListener = vi.fn() as unknown as ReturnType<typeof vi.fn> & ((eventName: string | symbol, listener: (...args: any[]) => void) => MockServer);
    }
  }

  let capturedConnectionHandler: ((socket: unknown) => void) | null = null;
  let mockServerInstance: MockServer | null = null;

  const mockCreateServer = vi.fn((handler: (socket: unknown) => void) => {
    capturedConnectionHandler = handler;
    mockServerInstance = new MockServer();
    return mockServerInstance;
  });

  return {
    mockMkdirSync: vi.fn(),
    mockExistsSync: vi.fn().mockReturnValue(false),
    mockUnlinkSync: vi.fn(),
    mockChmodSync: vi.fn(),
    mockCreateServer,
    getCapturedConnectionHandler: () => capturedConnectionHandler,
    getMockServerInstance: () => mockServerInstance as MockServer,
  };
});

// ─── Module mocks ─────────────────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  mkdirSync: mockMkdirSync,
  existsSync: mockExistsSync,
  unlinkSync: mockUnlinkSync,
  chmodSync: mockChmodSync,
}));

vi.mock('node:net', () => ({
  createServer: mockCreateServer,
}));

vi.mock('../../logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ─── MockSocket (defined after module mocks, used only in test bodies) ─────────────

import { EventEmitter } from 'node:events';

class MockSocket extends EventEmitter {
  destroyed = false;
  _isPaused = false;

  end = vi.fn((_data?: unknown, _encoding?: unknown, cb?: () => void) => {
    if (typeof cb === 'function') cb();
    return this;
  });

  destroy = vi.fn(() => {
    this.destroyed = true;
    return this;
  });

  pause = vi.fn(() => {
    this._isPaused = true;
    return this;
  });
}

// ─── Import under test ────────────────────────────────────────────────────────────
const SOCKET_PATH = '/tmp/gv-test/runtime.sock';

import { IPCServer } from '../ipc-server.js';
import type { IPCMessage, IPCResponse } from '../protocol.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeValidMsg(overrides: Partial<IPCMessage> = {}): IPCMessage {
  return {
    type: 'heartbeat',
    id: 'msg-1',
    ...overrides,
  } as IPCMessage;
}

function ackHandler(msg: IPCMessage): Promise<IPCResponse> {
  return Promise.resolve({ id: msg.id, status: 'ok', data: { kind: 'ack' } } as IPCResponse);
}

function simulateSend(socket: MockSocket, line: string): void {
  socket.emit('data', Buffer.from(line + '\n'));
}

function simulateSendChunked(socket: MockSocket, line: string): void {
  const full = line + '\n';
  const half = Math.floor(full.length / 2);
  socket.emit('data', Buffer.from(full.slice(0, half)));
  socket.emit('data', Buffer.from(full.slice(half)));
}

function simulateConnection(socket: MockSocket): void {
  const handler = getCapturedConnectionHandler();
  if (!handler) throw new Error('No connection handler captured — call listen() first');
  handler(socket);
}

async function startServer(srv: IPCServer): Promise<void> {
  const listenPromise = srv.listen();
  const mockSrv = getMockServerInstance();
  // Trigger the listen callback (last call's second argument)
  const calls = mockSrv.listen.mock.calls;
  const lastCall = calls[calls.length - 1];
  if (lastCall?.[1]) (lastCall[1] as () => void)();
  await listenPromise;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('IPCServer', () => {
  let server: IPCServer;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
    server = new IPCServer(SOCKET_PATH);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── Constructor / getters ───────────────────────────────────────────────────

  describe('constructor and getters', () => {
    it('getSocketPath returns the configured path', () => {
      expect(server.getSocketPath()).toBe(SOCKET_PATH);
    });

    it('clientCount starts at 0', () => {
      expect(server.clientCount).toBe(0);
    });
  });

  // ─── onMessage / setWriteResultCallback ───────────────────────────────────────

  describe('onMessage', () => {
    it('registers a handler without throwing', () => {
      expect(() => server.onMessage(ackHandler)).not.toThrow();
    });

    it('second call replaces the previous handler', () => {
      const handler1 = vi.fn().mockResolvedValue({ id: 'x', status: 'ok' } as IPCResponse);
      const handler2 = vi.fn().mockResolvedValue({ id: 'x', status: 'ok' } as IPCResponse);
      server.onMessage(handler1);
      server.onMessage(handler2);
      // Neither called yet
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });

  describe('setWriteResultCallback', () => {
    it('registers a callback without throwing', () => {
      expect(() => server.setWriteResultCallback(vi.fn())).not.toThrow();
    });
  });

  // ─── listen() ───────────────────────────────────────────────────────────────────

  describe('listen()', () => {
    it('creates the socket directory with mode 0o700', async () => {
      await startServer(server);
      expect(mockMkdirSync).toHaveBeenCalledWith(
        '/tmp/gv-test',
        { recursive: true, mode: 0o700 }
      );
    });

    it('sets chmod 0o700 on the directory', async () => {
      await startServer(server);
      expect(mockChmodSync).toHaveBeenCalledWith('/tmp/gv-test', 0o700);
    });

    it('removes stale socket file when it exists', async () => {
      mockExistsSync.mockReturnValue(true);
      await startServer(server);
      expect(mockUnlinkSync).toHaveBeenCalledWith(SOCKET_PATH);
    });

    it('does not call unlinkSync during listen when no stale socket exists', async () => {
      mockExistsSync.mockReturnValue(false);
      await startServer(server);
      const unlinkedPaths = mockUnlinkSync.mock.calls.map((c: unknown[]) => c[0]);
      expect(unlinkedPaths).not.toContain(SOCKET_PATH);
    });

    it('swallows unlink error on stale socket removal and still resolves', async () => {
      mockExistsSync.mockReturnValue(true);
      mockUnlinkSync.mockImplementationOnce(() => { throw new Error('busy'); });
      await expect(startServer(server)).resolves.toBeUndefined();
    });

    it('calls server.listen with socket path', async () => {
      await startServer(server);
      const srv = getMockServerInstance();
      expect(srv.listen).toHaveBeenCalledWith(SOCKET_PATH, expect.any(Function));
    });

    it('sets chmod 0o600 on socket file after binding', async () => {
      await startServer(server);
      expect(mockChmodSync).toHaveBeenCalledWith(SOCKET_PATH, 0o600);
    });

    it('rejects when server emits error during listen', async () => {
      const listenPromise = server.listen();
      getMockServerInstance().emit('error', new Error('EADDRINUSE'));
      await expect(listenPromise).rejects.toThrow('EADDRINUSE');
    });
  });

  // ─── close() ───────────────────────────────────────────────────────────────────

  describe('close()', () => {
    it('resolves immediately when server was never started', async () => {
      await expect(server.close()).resolves.toBeUndefined();
    });

    it('destroys all open connections on close', async () => {
      await startServer(server);

      const socket = new MockSocket();
      simulateConnection(socket);
      expect(server.clientCount).toBe(1);

      const closePromise = server.close();
      getMockServerInstance()._closeCallback?.();
      await closePromise;

      expect(socket.destroy).toHaveBeenCalled();
    });

    it('resets clientCount to 0 after close', async () => {
      await startServer(server);

      const socket = new MockSocket();
      simulateConnection(socket);

      const closePromise = server.close();
      getMockServerInstance()._closeCallback?.();
      await closePromise;

      expect(server.clientCount).toBe(0);
    });

    it('calls server.close() on the underlying server', async () => {
      await startServer(server);

      const closePromise = server.close();
      getMockServerInstance()._closeCallback?.();
      await closePromise;

      expect(getMockServerInstance().close).toHaveBeenCalled();
    });

    it('removes the socket file after close', async () => {
      await startServer(server);
      mockExistsSync.mockReturnValue(true);

      const closePromise = server.close();
      getMockServerInstance()._closeCallback?.();
      await closePromise;

      expect(mockUnlinkSync).toHaveBeenCalledWith(SOCKET_PATH);
    });

    it('calls writeResultCallback(holdId, false) for in-flight holds on close', async () => {
      await startServer(server);

      const cb = vi.fn();
      server.setWriteResultCallback(cb);
      server.onMessage(async (msg: IPCMessage) => ({
        response: { id: msg.id, status: 'ok', data: { kind: 'ack' } } as IPCResponse,
        holdId: 'hold-123',
      }));

      const socket = new MockSocket();
      // Prevent end callback from firing (keeps hold in-flight)
      socket.end = vi.fn(() => socket as unknown as typeof socket);
      simulateConnection(socket);

      simulateSend(socket, JSON.stringify(makeValidMsg()));
      await Promise.resolve();
      await Promise.resolve();

      const closePromise = server.close();
      getMockServerInstance()._closeCallback?.();
      await closePromise;

      expect(cb).toHaveBeenCalledWith('hold-123', false);
    });
  });

  // ─── Connection handling ───────────────────────────────────────────────────────

  describe('connection handling', () => {
    beforeEach(async () => {
      await startServer(server);
    });

    it('increments clientCount on new connection', () => {
      const socket = new MockSocket();
      simulateConnection(socket);
      expect(server.clientCount).toBe(1);
    });

    it('decrements clientCount when socket closes', () => {
      const socket = new MockSocket();
      simulateConnection(socket);
      expect(server.clientCount).toBe(1);
      socket.emit('close');
      expect(server.clientCount).toBe(0);
    });

    it('tracks multiple concurrent connections', () => {
      const s1 = new MockSocket();
      const s2 = new MockSocket();
      const s3 = new MockSocket();
      simulateConnection(s1);
      simulateConnection(s2);
      simulateConnection(s3);
      expect(server.clientCount).toBe(3);
    });

    it('handles socket error: removes connection and destroys socket', () => {
      const socket = new MockSocket();
      simulateConnection(socket);
      expect(server.clientCount).toBe(1);

      socket.emit('error', new Error('connection reset'));

      expect(socket.destroy).toHaveBeenCalled();
      expect(server.clientCount).toBe(0);
    });

    it('calls writeResultCallback(holdId, false) on socket error with in-flight hold', async () => {
      const cb = vi.fn();
      server.setWriteResultCallback(cb);
      server.onMessage(async (msg: IPCMessage) => ({
        response: { id: msg.id, status: 'ok', data: { kind: 'ack' } } as IPCResponse,
        holdId: 'hold-err',
      }));

      const socket = new MockSocket();
      socket.end = vi.fn(() => socket as unknown as typeof socket);
      simulateConnection(socket);

      simulateSend(socket, JSON.stringify(makeValidMsg()));
      await Promise.resolve();
      await Promise.resolve();

      socket.emit('error', new Error('write failed'));

      expect(cb).toHaveBeenCalledWith('hold-err', false);
    });
  });

  // ─── Message framing ────────────────────────────────────────────────────────────

  describe('message framing', () => {
    beforeEach(async () => {
      await startServer(server);
      server.onMessage(ackHandler);
    });

    it('processes a complete message with newline delimiter', async () => {
      const socket = new MockSocket();
      simulateConnection(socket);

      simulateSend(socket, JSON.stringify(makeValidMsg()));
      await Promise.resolve();
      await Promise.resolve();

      expect(socket.end).toHaveBeenCalled();
      const written = (socket.end as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      const parsed = JSON.parse(written.trim());
      expect(parsed).toMatchObject({ id: 'msg-1', status: 'ok' });
    });

    it('handles chunked message data (data arrives in multiple chunks)', async () => {
      const socket = new MockSocket();
      simulateConnection(socket);

      simulateSendChunked(socket, JSON.stringify(makeValidMsg({ id: 'chunked-1' })));
      await Promise.resolve();
      await Promise.resolve();

      expect(socket.end).toHaveBeenCalled();
      const written = (socket.end as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      const parsed = JSON.parse(written.trim());
      expect(parsed).toMatchObject({ id: 'chunked-1', status: 'ok' });
    });

    it('pauses socket after receiving complete message', async () => {
      const socket = new MockSocket();
      simulateConnection(socket);

      simulateSend(socket, JSON.stringify(makeValidMsg()));
      await Promise.resolve();

      expect(socket.pause).toHaveBeenCalled();
    });

    it('destroys socket when message exceeds 1MB size limit', () => {
      const socket = new MockSocket();
      simulateConnection(socket);

      // 1 MB + 1 byte, no newline — triggers size check
      const oversized = Buffer.alloc(1_048_577, 'x');
      socket.emit('data', oversized);

      expect(socket.destroy).toHaveBeenCalled();
    });

    it('buffers multiple chunks until newline arrives', async () => {
      const socket = new MockSocket();
      simulateConnection(socket);

      const msg = JSON.stringify(makeValidMsg({ id: 'multi' }));
      socket.emit('data', Buffer.from(msg.slice(0, 5)));
      socket.emit('data', Buffer.from(msg.slice(5, 10)));
      socket.emit('data', Buffer.from(msg.slice(10) + '\n'));

      await Promise.resolve();
      await Promise.resolve();

      expect(socket.end).toHaveBeenCalledOnce();
      const written = (socket.end as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      const parsed = JSON.parse(written.trim());
      expect(parsed).toMatchObject({ id: 'multi', status: 'ok' });
    });
  });

  // ─── processMessage / error handling ───────────────────────────────────────────

  describe('processMessage', () => {
    beforeEach(async () => {
      await startServer(server);
    });

    it('sends error response for invalid JSON', async () => {
      server.onMessage(ackHandler);
      const socket = new MockSocket();
      simulateConnection(socket);

      socket.emit('data', Buffer.from('NOT_JSON\n'));
      await Promise.resolve();
      await Promise.resolve();

      expect(socket.end).toHaveBeenCalled();
      const written = (socket.end as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      const parsed = JSON.parse(written.trim());
      expect(parsed).toMatchObject({
        id: 'unknown',
        status: 'error',
        error: 'Invalid message schema',
      });
    });

    it('sends error response for valid JSON that fails schema validation', async () => {
      server.onMessage(ackHandler);
      const socket = new MockSocket();
      simulateConnection(socket);

      // Valid JSON but not a valid IPCMessage
      socket.emit('data', Buffer.from(JSON.stringify({ id: 'x', foo: 'bar' }) + '\n'));
      await Promise.resolve();
      await Promise.resolve();

      expect(socket.end).toHaveBeenCalled();
      const written = (socket.end as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      const parsed = JSON.parse(written.trim());
      expect(parsed).toMatchObject({
        status: 'error',
        error: 'Invalid message schema',
      });
    });

    it('preserves message id in validation error response when available', async () => {
      server.onMessage(ackHandler);
      const socket = new MockSocket();
      simulateConnection(socket);

      socket.emit('data', Buffer.from(JSON.stringify({ id: 'some-id', type: 'unknown_type' }) + '\n'));
      await Promise.resolve();
      await Promise.resolve();

      const written = (socket.end as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      const parsed = JSON.parse(written.trim());
      expect(parsed.id).toBe('some-id');
    });

    it('sends error response when no handler is registered', async () => {
      // No server.onMessage() call
      const socket = new MockSocket();
      simulateConnection(socket);

      simulateSend(socket, JSON.stringify(makeValidMsg()));
      await Promise.resolve();
      await Promise.resolve();

      expect(socket.end).toHaveBeenCalled();
      const written = (socket.end as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      const parsed = JSON.parse(written.trim());
      expect(parsed).toMatchObject({
        id: 'msg-1',
        status: 'error',
        error: 'No handler registered',
      });
    });

    it('sends error response when handler throws', async () => {
      server.onMessage(async () => { throw new Error('handler exploded'); });
      const socket = new MockSocket();
      simulateConnection(socket);

      simulateSend(socket, JSON.stringify(makeValidMsg()));
      await Promise.resolve();
      await Promise.resolve();

      expect(socket.end).toHaveBeenCalled();
      const written = (socket.end as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      const parsed = JSON.parse(written.trim());
      expect(parsed).toMatchObject({
        id: 'msg-1',
        status: 'error',
        error: 'handler exploded',
      });
    });

    it('handles ResponseEnvelope returned by handler (with holdId)', async () => {
      const cb = vi.fn();
      server.setWriteResultCallback(cb);
      server.onMessage(async (msg: IPCMessage) => ({
        response: { id: msg.id, status: 'ok', data: { kind: 'ack' } } as IPCResponse,
        holdId: 'hold-abc',
      }));

      const socket = new MockSocket();
      simulateConnection(socket);

      simulateSend(socket, JSON.stringify(makeValidMsg()));
      await Promise.resolve();
      await Promise.resolve();

      // MockSocket.end calls cb synchronously, so writeResultCallback fires with true
      expect(cb).toHaveBeenCalledWith('hold-abc', true);
    });

    it('handles plain IPCResponse returned by handler (no holdId)', async () => {
      const cb = vi.fn();
      server.setWriteResultCallback(cb);
      server.onMessage(ackHandler);

      const socket = new MockSocket();
      simulateConnection(socket);

      simulateSend(socket, JSON.stringify(makeValidMsg()));
      await Promise.resolve();
      await Promise.resolve();

      // No holdId — callback should not be called
      expect(cb).not.toHaveBeenCalled();
    });
  });

  // ─── writeResponse error handling ───────────────────────────────────────────────

  describe('writeResponse error handling', () => {
    beforeEach(async () => {
      await startServer(server);
    });

    it('calls writeResultCallback(holdId, false) when socket.end throws', async () => {
      const cb = vi.fn();
      server.setWriteResultCallback(cb);
      server.onMessage(async (msg: IPCMessage) => ({
        response: { id: msg.id, status: 'ok', data: { kind: 'ack' } } as IPCResponse,
        holdId: 'hold-throw',
      }));

      const socket = new MockSocket();
      socket.end = vi.fn(() => { throw new Error('write error'); });
      simulateConnection(socket);

      simulateSend(socket, JSON.stringify(makeValidMsg()));
      await Promise.resolve();
      await Promise.resolve();

      expect(cb).toHaveBeenCalledWith('hold-throw', false);
      expect(socket.destroy).toHaveBeenCalled();
    });

    it('destroys socket when socket.end throws (even without holdId)', async () => {
      server.onMessage(ackHandler);
      const socket = new MockSocket();
      socket.end = vi.fn(() => { throw new Error('write error'); });
      simulateConnection(socket);

      simulateSend(socket, JSON.stringify(makeValidMsg()));
      await Promise.resolve();
      await Promise.resolve();

      expect(socket.destroy).toHaveBeenCalled();
    });
  });

  // ─── idle timeout ────────────────────────────────────────────────────────────────

  describe('idle connection timeout', () => {
    beforeEach(async () => {
      await startServer(server);
      server.onMessage(ackHandler);
    });

    it('destroys socket after idle timeout elapses', () => {
      vi.useFakeTimers();

      const socket = new MockSocket();
      simulateConnection(socket);

      vi.advanceTimersByTime(5001);

      expect(socket.destroy).toHaveBeenCalled();
    });

    it('clears idle timer when message arrives before timeout', () => {
      vi.useFakeTimers();

      const socket = new MockSocket();
      simulateConnection(socket);

      // Send a complete message before the idle timeout fires
      simulateSend(socket, JSON.stringify(makeValidMsg()));

      // Advance past idle timeout
      vi.advanceTimersByTime(5001);

      // socket.destroy should NOT have been called by the idle timer
      // (socket.end IS called by writeResponse, but socket.destroy is idle-timer only)
      const destroyCalls = (socket.destroy as ReturnType<typeof vi.fn>).mock.calls.length;
      expect(destroyCalls).toBe(0);
    });
  });
});
