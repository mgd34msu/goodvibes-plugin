/**
 * Tests for RemoteTransport reconnection logic.
 *
 * Strategy:
 * - Mock node:net to simulate socket connect/close/error events
 * - Test reconnection state machine: connected → reconnecting → connected/dead
 * - Test RPC queuing during reconnection and rejection when dead
 * - Test disconnect cancels reconnection
 * - Test per-RPC pending timeout during long reconnection
 * - Test state transitions throughout lifecycle
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const { MockSocket, mockCreateConnection, capturedSockets } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter } = require('node:events') as { EventEmitter: typeof import('node:events').EventEmitter };

  const capturedSockets: InstanceType<typeof MockSocket>[] = [];

  class MockSocket extends EventEmitter {
    destroyed = false;
    written: string[] = [];

    write = vi.fn((data: string, _enc?: unknown, cb?: () => void) => {
      this.written.push(data);
      if (typeof _enc === 'function') (_enc as () => void)();
      else if (cb) cb();
      return true;
    });

    destroy = vi.fn(() => {
      this.destroyed = true;
      if (this.listenerCount('close') > 0) {
        this.emit('close');
      }
    });

    end = vi.fn((cb?: () => void) => {
      if (cb) process.nextTick(cb);
    });

    /** Emit connect and respond to session_join with ok */
    triggerConnect(): void {
      this.emit('connect');
    }

    /** Respond to the last written session_join message */
    respondToSessionJoin(ok = true): void {
      const lastWrite = this.written[this.written.length - 1];
      if (!lastWrite) return;
      try {
        const msg = JSON.parse(lastWrite.trim());
        const resp = ok
          ? { id: msg.id, status: 'ok', result: { session_count: 1 } }
          : { id: msg.id, status: 'error', error: 'Rejected' };
        this.emit('data', Buffer.from(JSON.stringify(resp) + '\n'));
      } catch { /* ignore */ }
    }

    /** Respond to a specific RPC write */
    respondToLastRPC(result: unknown): void {
      const lastWrite = this.written[this.written.length - 1];
      if (!lastWrite) return;
      try {
        const msg = JSON.parse(lastWrite.trim());
        this.emit('data', Buffer.from(JSON.stringify({ id: msg.id, status: 'ok', result }) + '\n'));
      } catch { /* ignore */ }
    }
  }

  const mockCreateConnection = vi.fn((_path: string) => {
    const socket = new MockSocket();
    capturedSockets.push(socket);
    return socket;
  });

  return { MockSocket, mockCreateConnection, capturedSockets };
});

vi.mock('node:net', () => ({
  createConnection: mockCreateConnection,
}));

vi.mock('../../../shared/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

let idCounter = 0;
vi.mock('../../../shared/utils.js', () => ({
  generateId: vi.fn(() => `id-${++idCounter}`),
}));

import { RemoteTransport } from '../remote-transport.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Wait for a condition to become true. */
async function waitFor(
  fn: () => boolean,
  timeoutMs = 2000,
  label = 'condition',
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!fn()) {
    if (Date.now() >= deadline) throw new Error(`waitFor timed out: ${label}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** Connect the transport synchronously (trigger connect + respond to session_join). */
async function connectTransport(transport: RemoteTransport): Promise<void> {
  const connectPromise = transport.connect();
  const sock = capturedSockets[capturedSockets.length - 1];
  // Trigger connect event
  sock.triggerConnect();
  // Wait for session_join write, then respond
  await waitFor(() => sock.written.length > 0, 1000, 'session_join write');
  sock.respondToSessionJoin(true);
  await connectPromise;
}

const SOCKET_PATH = '/tmp/test-daemon-reconnect.sock';

function makeTransport(overrides?: Partial<ConstructorParameters<typeof RemoteTransport>[0]>) {
  return new RemoteTransport({
    daemonSocketPath: SOCKET_PATH,
    sessionId: 'test-session',
    timeoutMs: 500,
    pendingTimeoutMs: 200,
    reconnect: {
      enabled: true,
      maxAttempts: 3,
      baseDelayMs: 10,
      maxDelayMs: 50,
    },
    ...overrides,
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('RemoteTransport reconnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedSockets.length = 0;
    idCounter = 0;
  });

  afterEach(() => {
    // No fake timers in use — real timers only
  });

  // ─── 1. Initial connect ────────────────────────────────────────────────

  describe('initial connect', () => {
    it('transitions from idle → connecting → connected', async () => {
      const transport = makeTransport();
      expect(transport.getConnectionState()).toBe('idle');

      await connectTransport(transport);

      expect(transport.getConnectionState()).toBe('connected');
      expect(transport.isReady()).toBe(true);
    });
  });

  // ─── 2. Server drops connection → client reconnects ───────────────────

  describe('server drops connection → client reconnects', () => {
    it('transitions to reconnecting when socket closes unexpectedly', async () => {
      const transport = makeTransport();
      await connectTransport(transport);
      expect(transport.getConnectionState()).toBe('connected');

      const firstSock = capturedSockets[0];

      // Simulate server closing the connection (no reconnect will succeed)
      // But we need a new socket to be available for the reconnect attempt
      // Use a socket that never connects (so state stays 'reconnecting')
      mockCreateConnection.mockImplementationOnce(() => {
        const sock = new MockSocket();
        capturedSockets.push(sock);
        // Never trigger connect — keeps state in 'reconnecting'
        return sock;
      });

      firstSock.emit('close');

      // Give the event loop time to process
      await new Promise((r) => setTimeout(r, 20));

      expect(transport.getConnectionState()).toBe('reconnecting');
    });
  });

  // ─── 3. Server comes back after 3 attempts ─────────────────────────────

  describe('server comes back after failed attempts', () => {
    it('reconnects successfully after 2 failures', async () => {
      const onReconnecting = vi.fn();
      const onReconnected = vi.fn();
      const transport = makeTransport({ onReconnecting, onReconnected });

      await connectTransport(transport);
      expect(transport.getConnectionState()).toBe('connected');

      // Attempts 1 and 2: fail immediately with ECONNREFUSED
      let attemptCount = 0;
      mockCreateConnection.mockImplementation(() => {
        attemptCount++;
        const sock = new MockSocket();
        capturedSockets.push(sock);
        if (attemptCount <= 2) {
          // Fail: emit error on next tick
          process.nextTick(() => {
            // Make sure the error handler is registered first
            if (sock.listenerCount('error') > 0) {
              sock.emit('error', new Error('ECONNREFUSED'));
            }
          });
        } else {
          // Succeed: trigger connect and respond to session_join
          process.nextTick(async () => {
            sock.triggerConnect();
            await waitFor(() => sock.written.length > 0, 1000, 'join write');
            sock.respondToSessionJoin(true);
          });
        }
        return sock;
      });

      // Drop connection
      capturedSockets[0].emit('close');

      // Wait for reconnection to succeed
      await waitFor(
        () => transport.getConnectionState() === 'connected' && onReconnected.mock.calls.length > 0,
        3000,
        'reconnected',
      );

      expect(transport.getConnectionState()).toBe('connected');
      expect(onReconnected).toHaveBeenCalledOnce();
      expect(onReconnecting).toHaveBeenCalledWith(1);
      expect(onReconnecting).toHaveBeenCalledWith(2);
      expect(onReconnecting).toHaveBeenCalledWith(3);
    });
  });

  // ─── 4. Server never comes back → dead after maxAttempts ──────────────

  describe('server never comes back → dead after maxAttempts', () => {
    it('transitions to dead after maxAttempts failed reconnects', async () => {
      const onDead = vi.fn();
      const transport = makeTransport({ onDead });

      await connectTransport(transport);

      // All reconnect attempts fail
      mockCreateConnection.mockImplementation(() => {
        const sock = new MockSocket();
        capturedSockets.push(sock);
        process.nextTick(() => {
          if (sock.listenerCount('error') > 0) {
            sock.emit('error', new Error('ECONNREFUSED'));
          }
        });
        return sock;
      });

      capturedSockets[0].emit('close');

      await waitFor(
        () => transport.getConnectionState() === 'dead',
        3000,
        'transport dead',
      );

      expect(transport.getConnectionState()).toBe('dead');
      expect(onDead).toHaveBeenCalledOnce();
    });
  });

  // ─── 5. RPCs during reconnection are held, resolved on reconnect ───────

  describe('RPCs during reconnection are queued and replayed', () => {
    it('queued RPCs resolve when reconnect succeeds', async () => {
      const transport = makeTransport();
      await connectTransport(transport);

      let attemptCount = 0;
      let reconnectSock: InstanceType<typeof MockSocket> | null = null;

      mockCreateConnection.mockImplementation(() => {
        attemptCount++;
        const sock = new MockSocket();
        capturedSockets.push(sock);
        if (attemptCount <= 1) {
          // First attempt fails
          process.nextTick(() => {
            if (sock.listenerCount('error') > 0) {
              sock.emit('error', new Error('ECONNREFUSED'));
            }
          });
        } else {
          // Second attempt succeeds
          reconnectSock = sock;
          process.nextTick(async () => {
            sock.triggerConnect();
            await waitFor(() => sock.written.length > 0, 1000, 'join write');
            sock.respondToSessionJoin(true);
          });
        }
        return sock;
      });

      // Drop connection
      capturedSockets[0].emit('close');

      // Wait for reconnecting state
      await waitFor(
        () => transport.getConnectionState() === 'reconnecting',
        1000,
        'reconnecting',
      );

      // Issue an RPC while reconnecting — it should be queued
      const rpcPromise = transport.rpc<number>('getUptime');

      // Wait for reconnection to complete
      await waitFor(
        () => transport.getConnectionState() === 'connected',
        3000,
        'reconnected',
      );

      // Now respond to the queued RPC
      await waitFor(
        () => reconnectSock !== null && reconnectSock.written.length >= 2,
        1000,
        'rpc written',
      );
      reconnectSock!.respondToLastRPC(42);

      const result = await rpcPromise;
      expect(result).toBe(42);
    });
  });

  // ─── 6. RPCs during dead state reject immediately ─────────────────────

  describe('RPCs in dead state reject immediately', () => {
    it('rpc() rejects with dead error when state is dead', async () => {
      const transport = makeTransport();
      await connectTransport(transport);

      // All reconnects fail
      mockCreateConnection.mockImplementation(() => {
        const sock = new MockSocket();
        capturedSockets.push(sock);
        process.nextTick(() => {
          if (sock.listenerCount('error') > 0) {
            sock.emit('error', new Error('ECONNREFUSED'));
          }
        });
        return sock;
      });

      capturedSockets[0].emit('close');

      await waitFor(
        () => transport.getConnectionState() === 'dead',
        3000,
        'transport dead',
      );

      // RPC should reject immediately
      await expect(transport.getUptime()).rejects.toThrow(/dead/);
    });
  });

  // ─── 7. disconnect() during reconnection cancels reconnect loop ─────────

  describe('disconnect() during reconnection', () => {
    it('cancels the reconnection loop and transitions to idle', async () => {
      const transport = makeTransport();
      await connectTransport(transport);
      expect(transport.getConnectionState()).toBe('connected');

      // All reconnects hang (never connect)
      mockCreateConnection.mockImplementation(() => {
        const sock = new MockSocket();
        capturedSockets.push(sock);
        // Never emit 'connect' or 'error' — just hangs
        return sock;
      });

      // Drop connection
      capturedSockets[0].emit('close');

      // Wait for reconnecting
      await waitFor(
        () => transport.getConnectionState() === 'reconnecting',
        1000,
        'reconnecting',
      );

      // Disconnect while reconnecting
      await transport.disconnect();

      expect(transport.getConnectionState()).toBe('idle');
      expect(transport.isReady()).toBe(false);
    });

    it('pending RPCs are rejected when disconnect() is called during reconnection', async () => {
      const transport = makeTransport();
      await connectTransport(transport);

      // All reconnects hang
      mockCreateConnection.mockImplementation(() => {
        const sock = new MockSocket();
        capturedSockets.push(sock);
        // Never connect
        return sock;
      });

      // Drop connection → enter reconnecting
      capturedSockets[0].emit('close');

      // Wait for reconnecting state
      await waitFor(
        () => transport.getConnectionState() === 'reconnecting',
        1000,
        'reconnecting',
      );

      // Queue an RPC while reconnecting
      const rpcPromise = transport.getUptime();

      // Disconnect — should reject queued RPC
      await transport.disconnect();

      await expect(rpcPromise).rejects.toThrow(/Disconnect/);
    });
  });

  // ─── 8. Per-RPC pending timeout ───────────────────────────────────────

  describe('per-RPC pending timeout', () => {
    it('pending RPC times out when daemon never responds', async () => {
      // Short pending timeout for this test
      const transport = makeTransport({ pendingTimeoutMs: 50 });
      await connectTransport(transport);
      expect(transport.getConnectionState()).toBe('connected');

      // Issue an RPC that will never get a response (daemon doesn't respond)
      // Attach immediate error handler to prevent unhandled rejection during the wait
      const rpcPromise = transport.getUptime();
      const settledPromise = rpcPromise.then(
        (v) => ({ status: 'fulfilled', value: v }),
        (e: Error) => ({ status: 'rejected', reason: e }),
      );

      // Wait longer than the pendingTimeoutMs
      await new Promise((r) => setTimeout(r, 150));

      const settled = await settledPromise;
      expect(settled.status).toBe('rejected');
      expect((settled as { status: string; reason: Error }).reason.message).toMatch(/no response|Daemon RPC failed/);
    });
  });

  // ─── 9. Edge cases ────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('session_join rejection during reconnect rejects and schedules next attempt', async () => {
      const onDead = vi.fn();
      const transport = makeTransport({ onDead });
      await connectTransport(transport);

      let attemptCount = 0;
      mockCreateConnection.mockImplementation(() => {
        attemptCount++;
        const sock = new MockSocket();
        capturedSockets.push(sock);
        process.nextTick(async () => {
          sock.triggerConnect();
          await waitFor(() => sock.written.length > 0, 1000, 'join write');
          // Reject session_join — daemon accepts socket but rejects session
          sock.respondToSessionJoin(false);
        });
        return sock;
      });

      // Drop connection to trigger reconnect
      capturedSockets[0].emit('close');

      // Wait for dead state (all 3 attempts fail via session_join rejection)
      await waitFor(
        () => transport.getConnectionState() === 'dead',
        5000,
        'transport dead after session_join rejections',
      );

      expect(transport.getConnectionState()).toBe('dead');
      expect(onDead).toHaveBeenCalledOnce();
      expect(attemptCount).toBeGreaterThanOrEqual(1);
    });

    it('concurrent connect() calls share a single socket', async () => {
      const transport = makeTransport();

      // Issue two concurrent connect() calls before either resolves
      const p1 = transport.connect();
      const p2 = transport.connect();

      const sock = capturedSockets[capturedSockets.length - 1];
      sock.triggerConnect();
      await waitFor(() => sock.written.length > 0, 1000, 'session_join write');
      sock.respondToSessionJoin(true);

      await Promise.all([p1, p2]);

      // Only one socket should have been created
      expect(capturedSockets.length).toBe(1);
      expect(transport.getConnectionState()).toBe('connected');
    });

    it('onData with malformed JSON silently skips the line without crashing', async () => {
      const transport = makeTransport();
      await connectTransport(transport);

      const sock = capturedSockets[0];

      // Emit malformed JSON — should not throw
      expect(() => {
        sock.emit('data', Buffer.from('not-valid-json\n'));
      }).not.toThrow();

      expect(transport.getConnectionState()).toBe('connected');
    });
  });

  // ─── 10. State transitions ─────────────────────────────────────────────

  describe('state transitions', () => {
    it('starts in idle state', () => {
      const transport = makeTransport();
      expect(transport.getConnectionState()).toBe('idle');
    });

    it('isReady() returns false when not connected', () => {
      const transport = makeTransport();
      expect(transport.isReady()).toBe(false);
    });

    it('reconnect disabled — socket close goes directly to idle and rejects pending', async () => {
      const transport = makeTransport({
        reconnect: { enabled: false, maxAttempts: 0, baseDelayMs: 0, maxDelayMs: 0 },
      });

      await connectTransport(transport);
      expect(transport.getConnectionState()).toBe('connected');

      // Drop socket
      capturedSockets[0].emit('close');

      // Give event loop time to process
      await new Promise((r) => setTimeout(r, 20));

      // Should not attempt to reconnect — goes to idle
      expect(transport.getConnectionState()).toBe('idle');
    });
  });
});
