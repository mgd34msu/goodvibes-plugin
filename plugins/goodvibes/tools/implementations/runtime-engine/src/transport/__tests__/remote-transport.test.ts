/**
 * Tests for RemoteTransport — daemon RPC client over Unix domain socket.
 *
 * Strategy:
 * - Mock node:net to simulate socket connect/write/data/error/timeout
 * - Mock generateId for predictable request IDs
 * - Test connect/disconnect session lifecycle
 * - Test RPC proxy methods, error handling, and timeout
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const { MockSocket, mockCreateConnection, capturedSockets } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter } = require('node:events') as { EventEmitter: typeof import('node:events').EventEmitter };

  const capturedSockets: InstanceType<typeof MockSocket>[] = [];

  class MockSocket extends EventEmitter {
    destroyed = false;
    written: string[] = [];
    write = vi.fn((data: string, _enc?: string, cb?: () => void) => {
      this.written.push(data);
      if (cb) cb();
      return true;
    });
    destroy = vi.fn(() => { this.destroyed = true; });
    pause = vi.fn();
    end = vi.fn();

    /** Helper: simulate daemon responding with JSON */
    respondWith(response: Record<string, unknown>): void {
      process.nextTick(() => {
        this.emit('data', Buffer.from(JSON.stringify(response) + '\n'));
      });
    }

    /** Helper: simulate connect event */
    simulateConnect(): void {
      process.nextTick(() => this.emit('connect'));
    }

    /** Helper: simulate socket error */
    simulateError(err: Error): void {
      process.nextTick(() => this.emit('error', err));
    }
  }

  const mockCreateConnection = vi.fn((_opts: unknown) => {
    const socket = new MockSocket();
    capturedSockets.push(socket);
    // Auto-emit connect on next tick
    process.nextTick(() => socket.emit('connect'));
    return socket;
  });

  return { MockSocket, mockCreateConnection, capturedSockets };
});

vi.mock('node:net', () => ({
  createConnection: mockCreateConnection,
}));

let idCounter = 0;
vi.mock('../../../shared/utils.js', () => ({
  generateId: vi.fn(() => `test-id-${++idCounter}`),
}));

vi.mock('../../../shared/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

import { RemoteTransport } from '../remote-transport.js';

describe('RemoteTransport', () => {
  const SOCKET_PATH = '/tmp/test-daemon.sock';
  const SESSION_ID = 'session-abc';
  let transport: RemoteTransport;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedSockets.length = 0;
    idCounter = 0;
    transport = new RemoteTransport({
      daemonSocketPath: SOCKET_PATH,
      sessionId: SESSION_ID,
      timeoutMs: 100, // short timeout for tests
    });
  });

  // ─── Constructor & mode ─────────────────────────────────────────────────

  describe('constructor & mode', () => {
    it('has mode "remote"', () => {
      expect(transport.mode).toBe('remote');
    });

    it('starts not ready', () => {
      expect(transport.isReady()).toBe(false);
    });
  });

  // ─── connect() ──────────────────────────────────────────────────────────

  describe('connect', () => {
    it('sends session_join and sets ready on ok response', async () => {
      // Override createConnection to respond with ok
      mockCreateConnection.mockImplementationOnce((_opts: unknown) => {
        const sock = new MockSocket();
        capturedSockets.push(sock);
        process.nextTick(() => {
          sock.emit('connect');
        });
        // After write, respond with ok
        sock.write = vi.fn((data: string) => {
          sock.written.push(data);
          const parsed = JSON.parse(data.replace('\n', ''));
          expect(parsed.type).toBe('session_join');
          expect(parsed.session_id).toBe(SESSION_ID);
          sock.respondWith({ id: parsed.id, status: 'ok', result: { session_count: 1 } });
          return true;
        });
        return sock;
      });

      await transport.connect();
      expect(transport.isReady()).toBe(true);
    });

    it('throws when daemon responds with error', async () => {
      mockCreateConnection.mockImplementationOnce((_opts: unknown) => {
        const sock = new MockSocket();
        capturedSockets.push(sock);
        process.nextTick(() => sock.emit('connect'));
        sock.write = vi.fn((data: string) => {
          sock.written.push(data);
          const parsed = JSON.parse(data.replace('\n', ''));
          sock.respondWith({ id: parsed.id, status: 'error', error: 'Rejected' });
          return true;
        });
        return sock;
      });

      await expect(transport.connect()).rejects.toThrow();
      expect(transport.isReady()).toBe(false);
    });

    it('throws when socket times out (no response)', async () => {
      mockCreateConnection.mockImplementationOnce((_opts: unknown) => {
        const sock = new MockSocket();
        capturedSockets.push(sock);
        process.nextTick(() => sock.emit('connect'));
        // Write but never respond — will hit timeout
        sock.write = vi.fn((data: string) => {
          sock.written.push(data);
          return true;
        });
        return sock;
      });

      await expect(transport.connect()).rejects.toThrow();
    }, 5000);
  });

  // ─── disconnect() ───────────────────────────────────────────────────────

  describe('disconnect', () => {
    it('is a no-op when not ready', async () => {
      await transport.disconnect();
      expect(mockCreateConnection).not.toHaveBeenCalled();
    });

    it('sends session_leave and sets ready=false', async () => {
      // First connect
      mockCreateConnection.mockImplementationOnce((_opts: unknown) => {
        const sock = new MockSocket();
        capturedSockets.push(sock);
        process.nextTick(() => sock.emit('connect'));
        sock.write = vi.fn((data: string) => {
          sock.written.push(data);
          const parsed = JSON.parse(data.replace('\n', ''));
          sock.respondWith({ id: parsed.id, status: 'ok', result: {} });
          return true;
        });
        return sock;
      });
      await transport.connect();
      expect(transport.isReady()).toBe(true);

      // Then disconnect
      mockCreateConnection.mockImplementationOnce((_opts: unknown) => {
        const sock = new MockSocket();
        capturedSockets.push(sock);
        process.nextTick(() => sock.emit('connect'));
        sock.write = vi.fn((data: string) => {
          sock.written.push(data);
          const parsed = JSON.parse(data.replace('\n', ''));
          expect(parsed.type).toBe('session_leave');
          sock.respondWith({ id: parsed.id, status: 'ok' });
          return true;
        });
        return sock;
      });
      await transport.disconnect();
      expect(transport.isReady()).toBe(false);
    });
  });

  // ─── RPC proxy methods ──────────────────────────────────────────────────

  /** Helper: configure mock to respond to any RPC call with a result */
  function setupRPCResponse(result: unknown): void {
    mockCreateConnection.mockImplementationOnce((_opts: unknown) => {
      const sock = new MockSocket();
      capturedSockets.push(sock);
      process.nextTick(() => sock.emit('connect'));
      sock.write = vi.fn((data: string) => {
        sock.written.push(data);
        const parsed = JSON.parse(data.replace('\n', ''));
        expect(parsed.type).toBe('rpc_call');
        expect(parsed.session_id).toBe(SESSION_ID);
        sock.respondWith({ id: parsed.id, status: 'ok', result });
        return true;
      });
      return sock;
    });
  }

  describe('RPC proxy methods', () => {
    it('getUptime() sends rpc_call with method "getUptime"', async () => {
      setupRPCResponse(12345);
      const result = await transport.getUptime();
      expect(result).toBe(12345);
      const written = capturedSockets[0].written[0];
      const parsed = JSON.parse(written.replace('\n', ''));
      expect(parsed.method).toBe('getUptime');
      expect(parsed.args).toEqual([]);
    });

    it('getState() sends key as argument', async () => {
      setupRPCResponse('state-value');
      const result = await transport.getState('my.key');
      expect(result).toBe('state-value');
      const written = capturedSockets[0].written[0];
      const parsed = JSON.parse(written.replace('\n', ''));
      expect(parsed.method).toBe('getState');
      expect(parsed.args).toEqual(['my.key']);
    });

    it('setState() sends key and value as arguments', async () => {
      setupRPCResponse(undefined);
      await transport.setState('my.key', { nested: true });
      const written = capturedSockets[0].written[0];
      const parsed = JSON.parse(written.replace('\n', ''));
      expect(parsed.method).toBe('setState');
      expect(parsed.args).toEqual(['my.key', { nested: true }]);
    });

    it('startWorkflow() sends definitionId and context', async () => {
      setupRPCResponse({ workflow_id: 'wf-123' });
      const result = await transport.startWorkflow('my-defn', { key: 'val' });
      expect(result).toEqual({ workflow_id: 'wf-123' });
      const written = capturedSockets[0].written[0];
      const parsed = JSON.parse(written.replace('\n', ''));
      expect(parsed.method).toBe('startWorkflow');
      expect(parsed.args).toEqual(['my-defn', { key: 'val' }]);
    });

    it('drainDirectives() sends target and workflowId', async () => {
      const directives = [{ type: 'inject', content: 'test' }];
      setupRPCResponse({ directives });
      const result = await transport.drainDirectives('subagent_stop', 'wf-1');
      expect(result.directives).toEqual(directives);
      const written = capturedSockets[0].written[0];
      const parsed = JSON.parse(written.replace('\n', ''));
      expect(parsed.method).toBe('drainDirectives');
      expect(parsed.args).toEqual(['subagent_stop', 'wf-1']);
    });
  });

  // ─── RPC error handling ─────────────────────────────────────────────────

  describe('RPC error handling', () => {
    it('throws when daemon returns status error', async () => {
      mockCreateConnection.mockImplementationOnce((_opts: unknown) => {
        const sock = new MockSocket();
        capturedSockets.push(sock);
        process.nextTick(() => sock.emit('connect'));
        sock.write = vi.fn((data: string) => {
          sock.written.push(data);
          const parsed = JSON.parse(data.replace('\n', ''));
          sock.respondWith({ id: parsed.id, status: 'error', error: 'Method failed' });
          return true;
        });
        return sock;
      });

      await expect(transport.getUptime()).rejects.toThrow(/Method failed|Daemon RPC failed/);
    });
  });

  // ─── Timeout handling ───────────────────────────────────────────────────

  describe('timeout handling', () => {
    it('throws when socket never responds', async () => {
      mockCreateConnection.mockImplementationOnce((_opts: unknown) => {
        const sock = new MockSocket();
        capturedSockets.push(sock);
        process.nextTick(() => sock.emit('connect'));
        // Write but never respond
        sock.write = vi.fn((data: string) => {
          sock.written.push(data);
          return true;
        });
        return sock;
      });

      await expect(transport.getUptime()).rejects.toThrow(/no response|Daemon RPC failed/);
    }, 5000);
  });

  // ─── Socket error handling ───────────────────────────────────────────────

  describe('socket error handling', () => {
    it('throws when socket emits error', async () => {
      mockCreateConnection.mockImplementationOnce((_opts: unknown) => {
        const sock = new MockSocket();
        capturedSockets.push(sock);
        // Emit error instead of connect
        process.nextTick(() => sock.emit('error', new Error('ECONNREFUSED')));
        return sock;
      });

      await expect(transport.getUptime()).rejects.toThrow(/no response|Daemon RPC failed/);
    });

    it('throws when connection is refused', async () => {
      mockCreateConnection.mockImplementationOnce((_opts: unknown) => {
        const sock = new MockSocket();
        capturedSockets.push(sock);
        process.nextTick(() => {
          sock.emit('error', new Error('ECONNREFUSED'));
          sock.emit('close');
        });
        return sock;
      });

      await expect(transport.getState('key')).rejects.toThrow();
    });
  });
});
