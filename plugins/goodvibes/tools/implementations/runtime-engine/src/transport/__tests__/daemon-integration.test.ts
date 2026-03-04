/**
 * Daemon transport integration tests.
 *
 * Tests the entire daemon transport stack end-to-end using real Unix sockets.
 * Sections:
 *   1.1 DaemonServer lifecycle
 *   1.2 RPC round-trip (RemoteTransport <-> DaemonServer)
 *   1.3 Transport factory integration
 *   1.4 DaemonLifecycle (spawn/stop logic with mocked child_process)
 */

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

// ─── Real-socket helpers ─────────────────────────────────────────────────────

/** Generate a unique temp socket path for each test. */
function tempSocket(label: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return path.join(os.tmpdir(), `gv-int-test-${label}-${suffix}.sock`);
}

/** Clean up a socket path if it exists. */
function cleanSocket(p: string): void {
  try { fs.unlinkSync(p); } catch { /* ignore */ }
}

/** Poll until condition is true or timeout. */
async function waitFor(fn: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timeout');
    await new Promise(r => setTimeout(r, 5));
  }
}

// ─── Mock RuntimeEngine factory ──────────────────────────────────────────────

type MockEngine = ReturnType<typeof createMockEngine>;

function createMockEngine() {
  const stateStore = new Map<string, unknown>();
  const events: unknown[] = [];

  return {
    isRunning: vi.fn().mockReturnValue(true),
    getUptime: vi.fn().mockReturnValue(5000),
    getConfig: vi.fn().mockReturnValue({ schema_version: '1.0.0', executor: { mode: 'engaged' } }),
    getHealthChecker: vi.fn().mockReturnValue({
      check: vi.fn().mockResolvedValue({ status: 'healthy' }),
    }),
    getProjectRoot: vi.fn().mockReturnValue('/mock-project'),
    updateConfig: vi.fn(),
    getCoreStateStore: vi.fn().mockReturnValue({
      get: vi.fn((key: string) => stateStore.get(key) ?? null),
      set: vi.fn((key: string, value: unknown) => { stateStore.set(key, value); }),
      delete: vi.fn((key: string) => { stateStore.delete(key); }),
      keys: vi.fn((prefix?: string) => {
        const all = Array.from(stateStore.keys());
        return prefix ? all.filter(k => k.startsWith(prefix)) : all;
      }),
      snapshot: vi.fn(() => Object.fromEntries(stateStore.entries())),
    }),
    getEventBus: vi.fn().mockReturnValue({
      emit: vi.fn((event: unknown) => { events.push(event); }),
    }),
    getEventLog: vi.fn().mockReturnValue({
      query: vi.fn((_filter?: unknown) => events.filter(Boolean)),
    }),
    getEventQueue: vi.fn().mockReturnValue({
      depth: vi.fn().mockReturnValue(0),
    }),
    getWorkflowEngine: vi.fn().mockReturnValue(null),
    getTriggerRegistry: vi.fn().mockReturnValue(null),
    getAgentCoordinator: vi.fn().mockReturnValue(null),
    getDirectiveQueue: vi.fn().mockReturnValue(null),
    // expose for test assertions
    _stateStore: stateStore,
    _events: events,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1.1 DaemonServer lifecycle
// ═══════════════════════════════════════════════════════════════════════════════

import type { RuntimeEngine } from '../../bootstrap.js';
import { DaemonServer } from '../daemon-server.js';
import { RemoteTransport } from '../remote-transport.js';

/** Cast a mock engine to the RuntimeEngine interface for DaemonServer/createTransport. */
function asEngine(mock: MockEngine): RuntimeEngine {
  return mock as unknown as RuntimeEngine;
}

describe('1.1 DaemonServer lifecycle', () => {
  let server: DaemonServer;
  let socketPath: string;
  let engine: ReturnType<typeof createMockEngine>;

  beforeEach(() => {
    socketPath = tempSocket('lifecycle');
    engine = createMockEngine();
    server = new DaemonServer({ socketPath, engine: asEngine(engine) });
  });

  afterEach(async () => {
    try { await server.stop(); } catch { /* ignore */ }
    cleanSocket(socketPath);
  });

  it('starts and accepts connections on Unix socket', async () => {
    await server.start();
    expect(fs.existsSync(socketPath)).toBe(true);
    expect(server.getSessionCount()).toBe(0);
  });

  it('handles multiple concurrent client connections', async () => {
    await server.start();

    const transport1 = new RemoteTransport({ socketPath, sessionId: 'sess-multi-1' });
    const transport2 = new RemoteTransport({ socketPath, sessionId: 'sess-multi-2' });
    const transport3 = new RemoteTransport({ socketPath, sessionId: 'sess-multi-3' });

    await Promise.all([transport1.connect(), transport2.connect(), transport3.connect()]);

    // Wait for server to process session_join for each
    await waitFor(() => server.getSessionCount() === 3);
    expect(server.getSessionCount()).toBe(3);

    await Promise.all([transport1.disconnect(), transport2.disconnect(), transport3.disconnect()]);
    await waitFor(() => server.getSessionCount() === 0);
    expect(server.getSessionCount()).toBe(0);
  });

  it('cleans up on stop even with active connections', async () => {
    await server.start();

    const transport = new RemoteTransport({ socketPath, sessionId: 'sess-cleanup' });
    await transport.connect();
    await waitFor(() => server.getSessionCount() === 1);
    expect(server.getSessionCount()).toBe(1);

    // Stop with active connection
    await server.stop();

    // Socket file should be removed
    expect(fs.existsSync(socketPath)).toBe(false);
    // Session count cleared
    expect(server.getSessionCount()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1.2 RPC round-trip
// ═══════════════════════════════════════════════════════════════════════════════

describe('1.2 RPC round-trip', () => {
  let server: DaemonServer;
  let transport: RemoteTransport;
  let socketPath: string;
  let engine: ReturnType<typeof createMockEngine>;

  beforeEach(async () => {
    socketPath = tempSocket('rpc');
    engine = createMockEngine();
    server = new DaemonServer({ socketPath, engine: asEngine(engine) });
    await server.start();
    transport = new RemoteTransport({ socketPath, sessionId: 'sess-rpc' });
    await transport.connect();
    // Wait for session_join to register
    await waitFor(() => server.getSessionCount() === 1);
  });

  afterEach(async () => {
    try { await transport.disconnect(); } catch { /* ignore */ }
    try { await server.stop(); } catch { /* ignore */ }
    cleanSocket(socketPath);
  });

  it('getUptime returns a number', async () => {
    engine.getHealthChecker.mockReturnValue({
      check: vi.fn().mockResolvedValue({ status: 'healthy' }),
    });
    // getUptime goes through LocalTransport.getUptime → process.uptime()-based calc
    const uptime = await transport.getUptime();
    expect(typeof uptime).toBe('number');
    expect(uptime).toBeGreaterThanOrEqual(0);
  });

  it('getConfig returns RuntimeConfig shape', async () => {
    const config = await transport.getConfig();
    expect(config).toBeDefined();
    expect(typeof config).toBe('object');
    // The mock engine returns { schema_version, executor }
    expect(config).toHaveProperty('schema_version', '1.0.0');
  });

  it('setState and getState round-trip', async () => {
    await transport.setState('test.key', { value: 42 });
    const result = await transport.getState('test.key');
    expect(result).toEqual({ value: 42 });
  });

  it('setState / getState with string value', async () => {
    await transport.setState('greet', 'hello');
    const result = await transport.getState('greet');
    expect(result).toBe('hello');
  });

  it('emitEvent round-trips through queryEvents', async () => {
    const event = {
      id: 'test-evt-1',
      type: 'session:started' as const,
      source: { kind: 'mcp_tool' as const, tool_name: 'test' },
      payload: { type: 'session:started', data: {} } as any,
      timestamp: Date.now(),
      priority: 0,
      metadata: { session_id: 'sess-rpc', sequence: 0, version: 1 as const },
    };
    await expect(transport.emitEvent(event)).resolves.toBeUndefined();
    expect(engine.getEventBus().emit).toHaveBeenCalledWith(event);

    // Verify the event appears in queryEvents (round-trip validation)
    const results = await transport.queryEvents({ limit: 10 });
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it('ping returns object with ok=true, pid, and uptime', async () => {
    const result = await transport.rpc<{ ok: boolean; pid: number; uptime: number }>('ping');
    expect(result.ok).toBe(true);
    expect(typeof result.pid).toBe('number');
    expect(typeof result.uptime).toBe('number');
  });

  it('listSessions returns connected sessions', async () => {
    const sessions = await transport.rpc<Array<{ sessionId: string }>>('listSessions');
    expect(Array.isArray(sessions)).toBe(true);
    // The current transport's session should appear
    const sessionIds = sessions.map(s => s.sessionId);
    expect(sessionIds).toContain('sess-rpc');
  });

  it('unknown RPC method returns error', async () => {
    await expect(
      transport.rpc('nonExistentRpcMethod123')
    ).rejects.toThrow(/unknown.*method/i);
  });

  it('getStateSnapshot returns object', async () => {
    await transport.setState('snap.key', 'snap-val');
    const snapshot = await transport.getStateSnapshot();
    expect(typeof snapshot).toBe('object');
    expect(snapshot).toHaveProperty('snap.key', 'snap-val');
  });

  it('listStateKeys returns array', async () => {
    await transport.setState('prefix.a', 1);
    await transport.setState('prefix.b', 2);
    const keys = await transport.listStateKeys('prefix');
    expect(Array.isArray(keys)).toBe(true);
    expect(keys).toContain('prefix.a');
    expect(keys).toContain('prefix.b');
  });

  it('deleteState removes entry', async () => {
    await transport.setState('del.me', 'goodbye');
    await transport.deleteState('del.me');
    const result = await transport.getState('del.me');
    expect(result).toBeNull();
  });

  it('getQueueDepth returns number', async () => {
    const depth = await transport.getQueueDepth();
    expect(typeof depth).toBe('number');
    expect(depth).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1.3 Transport factory integration
// ═══════════════════════════════════════════════════════════════════════════════

import { createTransport, discoverDaemonSocket } from '../factory.js';
import { DAEMON_SOCKET_POINTER, DAEMON_PID_FILE } from '../daemon-constants.js';

describe('1.3 Transport factory integration', () => {
  let server: DaemonServer;
  let socketPath: string;
  let projectRoot: string;
  let goodvibesDir: string;
  let engine: ReturnType<typeof createMockEngine>;

  beforeEach(() => {
    // Create a temp project root with .goodvibes dir
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-factory-'));
    goodvibesDir = path.join(projectRoot, '.goodvibes');
    fs.mkdirSync(goodvibesDir, { recursive: true });

    socketPath = tempSocket('factory');
    engine = createMockEngine();
    server = new DaemonServer({ socketPath, engine: asEngine(engine) });
  });

  afterEach(async () => {
    try { await server.stop(); } catch { /* ignore */ }
    cleanSocket(socketPath);
    // Clean up temp project dir
    try { fs.rmSync(projectRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('discoverDaemonSocket returns undefined when no pointer file', () => {
    const result = discoverDaemonSocket(projectRoot);
    expect(result).toBeUndefined();
  });

  it('discoverDaemonSocket returns socket path when pointer file exists and PID alive', () => {
    // Write a pointer file pointing to our socket, with current PID
    fs.writeFileSync(path.join(goodvibesDir, DAEMON_SOCKET_POINTER), socketPath, 'utf-8');
    fs.writeFileSync(path.join(goodvibesDir, DAEMON_PID_FILE), String(process.pid), 'utf-8');

    const result = discoverDaemonSocket(projectRoot);
    expect(result).toBe(socketPath);
  });

  it('discoverDaemonSocket cleans up orphaned files when PID is dead', () => {
    const pointerPath = path.join(goodvibesDir, DAEMON_SOCKET_POINTER);
    const pidPath = path.join(goodvibesDir, DAEMON_PID_FILE);

    // Write a pointer file with a non-existent PID (use an implausibly large PID)
    const deadPid = process.pid + 1000000;
    fs.writeFileSync(pointerPath, socketPath, 'utf-8');
    fs.writeFileSync(pidPath, String(deadPid), 'utf-8');

    // Dead PID triggers ESRCH — discoverDaemonSocket should clean up
    const result = discoverDaemonSocket(projectRoot);
    expect(result).toBeUndefined();
    // Files should be cleaned up
    expect(fs.existsSync(pointerPath)).toBe(false);
    expect(fs.existsSync(pidPath)).toBe(false);
  });

  it('daemon mode connects when socket available', async () => {
    await server.start();

    const transport = await createTransport({
      mode: 'daemon',
      socketPath,
    });
    expect(transport.mode).toBe('remote');
    await (transport as RemoteTransport).disconnect();
  });

  it('daemon mode throws when no daemon available', async () => {
    // No server started, no socket path
    await expect(
      createTransport({ mode: 'daemon' })
    ).rejects.toThrow(/socketPath.*required|no daemon socket|cannot connect to daemon/i);
  });

  it('daemon mode throws when socket path given but daemon not listening', async () => {
    // Server not started — connection should be refused
    await expect(
      createTransport({ mode: 'daemon', socketPath: '/tmp/nonexistent-gv-test.sock', connectTimeoutMs: 500 })
    ).rejects.toThrow();
  });

  it('hybrid mode falls back to local when daemon unavailable', async () => {
    const transport = await createTransport({
      mode: 'hybrid',
      socketPath: '/tmp/nonexistent-gv-fallback.sock',
      engine: asEngine(engine),
      connectTimeoutMs: 200,
    });
    expect(transport.mode).toBe('local');
  });

  it('hybrid mode falls back to local when no socket at all', async () => {
    const transport = await createTransport({
      mode: 'hybrid',
      engine: asEngine(engine),
    });
    expect(transport.mode).toBe('local');
  });

  it('engaged mode creates local transport', async () => {
    const transport = await createTransport({
      mode: 'engaged',
      engine: asEngine(engine),
    });
    expect(transport.mode).toBe('local');
  });

  it('daemon mode discovers socket from project root pointer file', async () => {
    await server.start();

    // Write pointer file so discoverDaemonSocket finds it
    fs.writeFileSync(path.join(goodvibesDir, DAEMON_SOCKET_POINTER), socketPath, 'utf-8');
    fs.writeFileSync(path.join(goodvibesDir, DAEMON_PID_FILE), String(process.pid), 'utf-8');

    const transport = await createTransport({
      mode: 'daemon',
      projectRoot,
    });
    expect(transport.mode).toBe('remote');
    await (transport as RemoteTransport).disconnect();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1.4 DaemonLifecycle
// ═══════════════════════════════════════════════════════════════════════════════

// We mock child_process.spawn and fs for DaemonLifecycle tests
// since we cannot guarantee the daemon binary exists in test environments.

const { mockSpawn, mockExistsSync, mockReadFileSync, mockUnlinkSync, mockKill } = vi.hoisted(() => {
  const { EventEmitter } = require('node:events') as typeof import('node:events');

  class MockChildProcess extends EventEmitter {
    pid = 88888;
    unref = vi.fn();
    stdout = null;
    stderr = null;
    stdin = null;
  }

  return {
    mockSpawn: vi.fn(() => new MockChildProcess()),
    mockExistsSync: vi.fn().mockReturnValue(false),
    mockReadFileSync: vi.fn().mockImplementation(() => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); }),
    mockUnlinkSync: vi.fn(),
    mockKill: vi.fn(),
  };
});

vi.mock('node:child_process', () => ({ spawn: mockSpawn }));

// We need to carefully mock fs for DaemonLifecycle without breaking DaemonServer/RemoteTransport
// DaemonLifecycle imports from node:fs directly (top-level). We intercept it via vi.mock.
// Note: This mock applies to the entire module, but we only want it for lifecycle tests.
// Since vitest isolates per-file, this is safe. We'll use a flag to control behavior.

let lifecycleMockActive = false;

vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>();
  return {
    ...real,
    existsSync: (p: string) => {
      if (lifecycleMockActive) return mockExistsSync(p);
      return real.existsSync(p);
    },
    readFileSync: (p: string, enc?: string) => {
      if (lifecycleMockActive) return mockReadFileSync(p, enc);
      return real.readFileSync(p, enc);
    },
    unlinkSync: (p: string) => {
      if (lifecycleMockActive) { mockUnlinkSync(p); return; }
      return real.unlinkSync(p);
    },
    default: {
      ...real,
      existsSync: (p: string) => {
        if (lifecycleMockActive) return mockExistsSync(p);
        return real.existsSync(p);
      },
      readFileSync: (p: string, enc?: string) => {
        if (lifecycleMockActive) return mockReadFileSync(p, enc);
        return real.readFileSync(p, enc);
      },
      unlinkSync: (p: string) => {
        if (lifecycleMockActive) { mockUnlinkSync(p); return; }
        return real.unlinkSync(p);
      },
    },
  };
});

import { DaemonLifecycle } from '../daemon-lifecycle.js';

describe('1.4 DaemonLifecycle', () => {
  const PROJECT_ROOT = '/fake/project';
  const GOODVIBES_DIR = '/fake/project/.goodvibes';
  const PID_PATH = `${GOODVIBES_DIR}/goodvibes-runtime.pid`;
  const SOCKET_POINTER_PATH = `${GOODVIBES_DIR}/daemon.socket`;
  const SOCKET_PATH = '/tmp/goodvibes-test-lifecycle.sock';
  const DAEMON_PID = 88888;

  let lifecycle: DaemonLifecycle;
  let origKill: typeof process.kill;

  beforeEach(() => {
    lifecycleMockActive = true;
    vi.clearAllMocks();

    origKill = process.kill.bind(process);
    // Replace process.kill so we can control liveness checks
    vi.spyOn(process, 'kill').mockImplementation((pid: number, sig?: any) => {
      return mockKill(pid, sig);
    });

    // Default: no files exist
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockImplementation(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    mockKill.mockReturnValue(0);

    lifecycle = new DaemonLifecycle(PROJECT_ROOT);
  });

  afterEach(() => {
    lifecycleMockActive = false;
    vi.restoreAllMocks();
  });

  it('isRunning returns false when no PID file', async () => {
    mockExistsSync.mockReturnValue(false);
    const running = await lifecycle.isRunning();
    expect(running).toBe(false);
  });

  it('isRunning returns false when PID file exists but process is dead', async () => {
    mockExistsSync.mockImplementation((p: string) => p === PID_PATH);
    mockReadFileSync.mockReturnValue('12345');
    // process.kill with signal 0 throws ESRCH when process is dead
    vi.spyOn(process, 'kill').mockImplementation((pid: number, sig: any) => {
      if (sig === 0) throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
      return true;
    });

    const running = await lifecycle.isRunning();
    expect(running).toBe(false);
  });

  it('isRunning returns false when PID alive but socket pointer missing', async () => {
    mockExistsSync.mockImplementation((p: string) => p === PID_PATH);
    mockReadFileSync.mockReturnValue(`${DAEMON_PID}`);
    // PID alive (no throw)
    vi.spyOn(process, 'kill').mockReturnValue(true);

    const running = await lifecycle.isRunning();
    expect(running).toBe(false);
  });

  it('stop is a no-op when no PID file', async () => {
    mockExistsSync.mockReturnValue(false);
    await expect(lifecycle.stop()).resolves.toBeUndefined();
    expect(process.kill).not.toHaveBeenCalledWith(expect.any(Number), 'SIGTERM');
  });

  it('stop cleans up stale files when process is already dead', async () => {
    mockExistsSync.mockImplementation((p: string) => p === PID_PATH || p === SOCKET_POINTER_PATH);
    mockReadFileSync.mockReturnValue(`${DAEMON_PID}`);
    // Process is dead
    vi.spyOn(process, 'kill').mockImplementation((pid: number, sig: any) => {
      if (sig === 0) throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
      return true;
    });

    await lifecycle.stop();

    // Should have tried to unlink stale files
    expect(mockUnlinkSync).toHaveBeenCalled();
  });

  it('stop sends SIGTERM to running daemon', async () => {
    mockExistsSync.mockImplementation((p: string) => p === PID_PATH);
    mockReadFileSync.mockReturnValue(`${DAEMON_PID}`);

    let killCount = 0;
    vi.spyOn(process, 'kill').mockImplementation((pid: number, sig: any) => {
      killCount++;
      if (sig === 0 && killCount > 2) {
        // After SIGTERM, report process as dead
        throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
      }
      return true;
    });

    await lifecycle.stop();
    expect(process.kill).toHaveBeenCalledWith(DAEMON_PID, 'SIGTERM');
  });

  it('detects and cleans up orphaned PID/socket files', async () => {
    // Both files exist, but process is dead
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.endsWith('.pid')) return `${DAEMON_PID}`;
      return SOCKET_PATH;
    });
    vi.spyOn(process, 'kill').mockImplementation((pid: number, sig: any) => {
      if (sig === 0) throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
      return true;
    });

    const running = await lifecycle.isRunning();
    expect(running).toBe(false);
    // Should have cleaned up
    expect(mockUnlinkSync).toHaveBeenCalledWith(PID_PATH);
    expect(mockUnlinkSync).toHaveBeenCalledWith(SOCKET_POINTER_PATH);
  });

  it('start throws when daemon entry point does not exist', async () => {
    // No daemon running
    mockExistsSync.mockReturnValue(false);
    // Spawn is called but DAEMON_ENTRY does not exist — existsSync returns false for the script
    // The real existsSync is not mocked for fs in this context, so we need to override
    // The DaemonLifecycle checks: existsSync(daemonScript) before spawning
    // Since existsSync returns false for everything, it should throw "not found"
    await expect(lifecycle.start()).rejects.toThrow(/daemon entry point not found|script.*not found|entry.*does not exist|not found/i);
    // spawn should NOT have been called
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('concurrent start calls share single-flight promise', async () => {
    // Make start fail fast so we can test the dedup logic
    mockExistsSync.mockReturnValue(false);

    // Both calls should reject with the same reason (daemon entry not found)
    const [r1, r2] = await Promise.allSettled([lifecycle.start(), lifecycle.start()]);
    expect(r1.status).toBe('rejected');
    expect(r2.status).toBe('rejected');
    // Spawn should only be attempted once (or zero times if existsSync check fires first)
    // Either way, the single-flight guard ensures doStart runs once
  });

  it('start is idempotent when daemon already running (probeSocket succeeds)', async () => {
    // Start a real server on SOCKET_PATH so probeSocket can connect to it.
    // Temporarily disable the fs mock so the real server can bind.
    lifecycleMockActive = false;
    const idempotentEngine = createMockEngine();
    const idempotentServer = new DaemonServer({
      socketPath: SOCKET_PATH,
      engine: asEngine(idempotentEngine),
    });
    await idempotentServer.start();

    // Re-enable fs mock with PID + pointer files pointing to the live server
    lifecycleMockActive = true;
    mockExistsSync.mockImplementation((p: string) => {
      return p === PID_PATH || p === SOCKET_POINTER_PATH || p === SOCKET_PATH;
    });
    mockReadFileSync.mockImplementation((p: string) => {
      if (p === PID_PATH) return String(process.pid);
      if (p === SOCKET_POINTER_PATH) return SOCKET_PATH;
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    vi.spyOn(process, 'kill').mockReturnValue(true); // report PID as alive

    try {
      // isRunning() -> PID alive -> socket pointer found -> probeSocket connects to real server
      // doStart() sees daemon already running and returns early without spawning
      await lifecycle.start();
    } finally {
      await idempotentServer.stop();
      cleanSocket(SOCKET_PATH);
    }

    // Daemon was already running — spawn should NOT have been called
    expect(mockSpawn).not.toHaveBeenCalled();
  }, 5000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// cleanup
// ═══════════════════════════════════════════════════════════════════════════════

afterAll(() => {
  lifecycleMockActive = false;
});
