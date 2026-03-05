/**
 * Tests for transport factory — mode-based selection and socket discovery.
 *
 * Covers:
 * - engaged mode → LocalTransport
 * - daemon mode (no socket, connect success, connect failure)
 * - hybrid mode (no socket, connect success, connect failure)
 * - Socket discovery (env var, pointer file)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────

// Use var so it is hoisted to undefined rather than entering TDZ —
// vi.mock factories execute before const/let bindings are initialized.
// eslint-disable-next-line no-var
var h = vi.hoisted(() => {
  // require is safe here — vi.hoisted runs before ESM imports are resolved
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter } = require('node:events') as typeof import('node:events');

  const mockEngine = {
    isReady: vi.fn().mockReturnValue(true),
    getUptime: vi.fn().mockReturnValue(1000),
    getState: vi.fn(),
    setState: vi.fn(),
    stateStore: { get: vi.fn(), set: vi.fn(), delete: vi.fn(), keys: vi.fn(), snapshot: vi.fn() },
    eventBus: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
    eventLog: { query: vi.fn().mockReturnValue([]) },
    eventQueue: { depth: vi.fn().mockReturnValue(0) },
    workflowEngine: { start: vi.fn(), status: vi.fn() },
    triggerRegistry: { list: vi.fn().mockReturnValue([]) },
    agentCoordinator: null,
    directiveQueue: null,
    healthChecker: null,
  };

  class MockSocket extends EventEmitter {
    write = vi.fn();
    destroy = vi.fn();
    end = vi.fn();
    connect = vi.fn();
    setTimeout = vi.fn();
  }

  const capturedSockets: MockSocket[] = [];

  const mockLocalTransport = {
    mode: 'local' as const,
    isReady: vi.fn().mockReturnValue(true),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  };

  const mockRemoteTransport = {
    mode: 'remote' as const,
    isReady: vi.fn().mockReturnValue(false),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  };

  return {
    mockEngine,
    MockSocket,
    capturedSockets,
    mockReadFileSync: vi.fn(),
    mockExistsSync: vi.fn(),
    mockLocalTransport,
    mockRemoteTransport,
  };
});

const { mockEngine, MockSocket, capturedSockets, mockReadFileSync,
  mockExistsSync, mockLocalTransport, mockRemoteTransport } = h;

vi.mock('node:net', () => ({
  createConnection: vi.fn((...args: unknown[]) => {
    const sock = new h.MockSocket();
    h.capturedSockets.push(sock);
    // Auto-emit connect on next tick for success tests
    // Tests override via respondWith pattern
    return sock;
  }),
}));

vi.mock('node:fs', () => ({
  readFileSync: h.mockReadFileSync,
  existsSync: h.mockExistsSync,
}));

vi.mock('../local-transport.js', () => ({
  LocalTransport: vi.fn(function () { return h.mockLocalTransport; }),
}));

vi.mock('../remote-transport.js', () => ({
  RemoteTransport: vi.fn(function () { return h.mockRemoteTransport; }),
}));

vi.mock('../../../shared/logger.js', () => ({
  createLogger: vi.fn().mockReturnValue({
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
  }),
}));

// ── Import under test ──────────────────────────────────────────

import { createTransport } from '../factory.js';
import { LocalTransport } from '../local-transport.js';
import { RemoteTransport } from '../remote-transport.js';

// ── Constants ──────────────────────────────────────────────────

const SOCKET_PATH = '/tmp/test-daemon.sock';

// ── Helpers ────────────────────────────────────────────────────

function setupSocketDiscovery(opts: { envVar?: string; pointerFile?: string | null }) {
  if (opts.envVar) {
    process.env.GOODVIBES_DAEMON_SOCKET = opts.envVar;
  } else {
    delete process.env.GOODVIBES_DAEMON_SOCKET;
  }

  if (opts.pointerFile) {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(opts.pointerFile);
  } else {
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
  }
}

function clearSocketDiscovery() {
  delete process.env.GOODVIBES_DAEMON_SOCKET;
  mockExistsSync.mockReturnValue(false);
  mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
}

// ── Tests ──────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  capturedSockets.length = 0;
  clearSocketDiscovery();
  mockRemoteTransport.connect.mockResolvedValue(undefined);
  mockRemoteTransport.isReady.mockReturnValue(false);
});

// ── engaged mode ───────────────────────────────────────────────

describe('createTransport — engaged mode', () => {
  it('returns LocalTransport wrapping the engine', async () => {
    const transport = await createTransport({ mode: 'engaged', engine: mockEngine as any });

    expect(LocalTransport).toHaveBeenCalledWith(mockEngine);
    expect(transport).toBe(mockLocalTransport);
  });

  it('ignores socket path even if present', async () => {
    setupSocketDiscovery({ envVar: SOCKET_PATH });

    const transport = await createTransport({ mode: 'engaged', engine: mockEngine as any });

    expect(transport).toBe(mockLocalTransport);
    expect(RemoteTransport).not.toHaveBeenCalled();
  });
});

// ── daemon mode ────────────────────────────────────────────────

describe('createTransport — daemon mode', () => {
  it('throws when no socket path is discoverable', async () => {
    clearSocketDiscovery();

    await expect(
      createTransport({ mode: 'daemon' })
    ).rejects.toThrow(/socket/i);
  });

  it('returns RemoteTransport when socket found and connect succeeds', async () => {
    setupSocketDiscovery({ envVar: SOCKET_PATH });
    mockRemoteTransport.connect.mockResolvedValue(undefined);

    const transport = await createTransport({ mode: 'daemon' });

    expect(RemoteTransport).toHaveBeenCalled();
    expect(mockRemoteTransport.connect).toHaveBeenCalled();
    expect(transport).toBe(mockRemoteTransport);
  });

  it('throws when socket found but connect fails', async () => {
    setupSocketDiscovery({ envVar: SOCKET_PATH });
    mockRemoteTransport.connect.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      createTransport({ mode: 'daemon' })
    ).rejects.toThrow('ECONNREFUSED');
  });
});

// ── hybrid mode ────────────────────────────────────────────────

describe('createTransport — hybrid mode', () => {
  it('returns LocalTransport when no socket is discoverable', async () => {
    clearSocketDiscovery();

    const transport = await createTransport({ mode: 'hybrid', engine: mockEngine as any });

    expect(LocalTransport).toHaveBeenCalledWith(mockEngine);
    expect(transport).toBe(mockLocalTransport);
    expect(RemoteTransport).not.toHaveBeenCalled();
  });

  it('returns RemoteTransport when socket found and connect succeeds', async () => {
    setupSocketDiscovery({ envVar: SOCKET_PATH });
    mockRemoteTransport.connect.mockResolvedValue(undefined);

    const transport = await createTransport({ mode: 'hybrid', engine: mockEngine as any });

    expect(RemoteTransport).toHaveBeenCalled();
    expect(mockRemoteTransport.connect).toHaveBeenCalled();
    expect(transport).toBe(mockRemoteTransport);
  });

  it('falls back to LocalTransport when socket found but connect fails', async () => {
    setupSocketDiscovery({ envVar: SOCKET_PATH });
    mockRemoteTransport.connect.mockRejectedValue(new Error('ECONNREFUSED'));

    const transport = await createTransport({ mode: 'hybrid', engine: mockEngine as any });

    // Should have tried remote first
    expect(RemoteTransport).toHaveBeenCalled();
    expect(mockRemoteTransport.connect).toHaveBeenCalled();
    // Then fallen back to local
    expect(LocalTransport).toHaveBeenCalledWith(mockEngine);
    expect(transport).toBe(mockLocalTransport);
  });
});

// ── socket discovery ───────────────────────────────────────────

describe('createTransport — socket discovery', () => {
  it('prefers GOODVIBES_DAEMON_SOCKET env var over pointer file', async () => {
    setupSocketDiscovery({ envVar: '/tmp/env-socket.sock', pointerFile: '/tmp/pointer-socket.sock' });
    mockRemoteTransport.connect.mockResolvedValue(undefined);

    await createTransport({ mode: 'daemon' });

    // RemoteTransport should be constructed with env var path
    const constructorCall = (RemoteTransport as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(constructorCall).toBeDefined();
    // The socket path from env var should be used
    expect(JSON.stringify(constructorCall)).toContain('/tmp/env-socket.sock');
  });

  it('falls back to pointer file when env var is not set', async () => {
    setupSocketDiscovery({ pointerFile: '/tmp/pointer-socket.sock' });
    mockRemoteTransport.connect.mockResolvedValue(undefined);

    await createTransport({ mode: 'daemon' });

    expect(RemoteTransport).toHaveBeenCalled();
    expect(mockReadFileSync).toHaveBeenCalled();
  });

  it('uses explicit socketPath option over discovery', async () => {
    setupSocketDiscovery({ envVar: '/tmp/env-socket.sock' });
    mockRemoteTransport.connect.mockResolvedValue(undefined);

    await createTransport({ mode: 'daemon', socketPath: '/tmp/explicit.sock' });

    const constructorCall = (RemoteTransport as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(constructorCall).toBeDefined();
    expect(JSON.stringify(constructorCall)).toContain('/tmp/explicit.sock');
  });
});

// ── edge cases ─────────────────────────────────────────────────

describe('createTransport — edge cases', () => {
  it('throws for unknown mode', async () => {
    await expect(
      createTransport({ mode: 'invalid' as any })
    ).rejects.toThrow();
  });

  it('daemon mode requires no engine parameter', async () => {
    setupSocketDiscovery({ envVar: SOCKET_PATH });
    mockRemoteTransport.connect.mockResolvedValue(undefined);

    // Should not throw even without engine
    const transport = await createTransport({ mode: 'daemon' });
    expect(transport).toBe(mockRemoteTransport);
  });

  it('engaged mode requires engine parameter', async () => {
    await expect(
      createTransport({ mode: 'engaged' })
    ).rejects.toThrow(/engine/i);
  });
});
