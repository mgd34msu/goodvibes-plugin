/**
 * Comprehensive unit tests for shared/runtime-client.ts
 *
 * Tests cover:
 * - RuntimeClient constructor (discoverSocket via 5 strategies)
 * - isAvailable() — socket path + existsSync
 * - sendHookEvent() — fire-and-forget, error swallowing, response passthrough
 * - query() — send/receive, error swallowing, response passthrough
 * - sendMessage() — socket lifecycle, timeout, close, data, parse error
 * - generateId() — indirectly via sendHookEvent/query
 *
 * Target: 100% line and branch coverage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

// ─── Mocks (must be hoisted before imports) ────────────────────────────────

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock('net', () => ({
  createConnection: vi.fn(),
}));

vi.mock('os', () => ({
  tmpdir: vi.fn(() => '/tmp'),
}));

// ─── Import after mocks ────────────────────────────────────────────────────

import { existsSync, readFileSync, readdirSync, statSync, unlinkSync } from 'fs';
import * as net from 'net';
import { tmpdir } from 'os';
import { RuntimeClient } from '../../shared/runtime-client.js';

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedReaddirSync = vi.mocked(readdirSync);
const mockedStatSync = vi.mocked(statSync);
const mockedUnlinkSync = vi.mocked(unlinkSync);
const mockedCreateConnection = vi.mocked(net.createConnection);
const mockedTmpdir = vi.mocked(tmpdir);

// ─── Fake socket factory ───────────────────────────────────────────────────

/**
 * Creates a fake socket EventEmitter that partially implements the
 * net.Socket interface required by RuntimeClient.
 */
function makeFakeSocket() {
  const emitter = new EventEmitter() as EventEmitter & {
    write: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    once: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
  };

  // Collect once/on handlers so tests can trigger them
  const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};

  emitter.once = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    handlers[event] = handlers[event] ?? [];
    handlers[event].push(handler);
    return emitter;
  });

  emitter.on = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    handlers[event] = handlers[event] ?? [];
    handlers[event].push(handler);
    return emitter;
  });

  emitter.write = vi.fn();
  emitter.destroy = vi.fn();

  const emit = (event: string, ...args: unknown[]) => {
    (handlers[event] ?? []).forEach((h) => h(...args));
  };

  return { socket: emitter, emit, handlers };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('RuntimeClient', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset env to a clean copy each test
    process.env = { ...originalEnv };
    delete process.env['GOODVIBES_RUNTIME_SOCKET'];
    delete process.env['CLAUDE_PROJECT_DIR'];
    mockedTmpdir.mockReturnValue('/tmp');
    mockedExistsSync.mockReturnValue(false);
    // Default: no pointer files in state dir (Strategy 3 finds nothing)
    mockedReaddirSync.mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);
    // Default: statSync returns a recent mtime so Strategy 3 pointer files are processable
    mockedStatSync.mockReturnValue({ mtimeMs: Date.now() } as unknown as ReturnType<typeof statSync>);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ─── discoverSocket / constructor ──────────────────────────────────────

  describe('discoverSocket — Strategy 1 (env var)', () => {
    it('returns socket path from GOODVIBES_RUNTIME_SOCKET env var', () => {
      process.env['GOODVIBES_RUNTIME_SOCKET'] = '/run/goodvibes.sock';
      const client = new RuntimeClient();
      // isAvailable check requires existsSync to return true
      mockedExistsSync.mockReturnValue(true);
      expect(client.isAvailable()).toBe(true);
    });

    it('does not consult existsSync or pointer file when env var is set', () => {
      process.env['GOODVIBES_RUNTIME_SOCKET'] = '/run/goodvibes.sock';
      // Should never call existsSync in constructor for strategy 1
      new RuntimeClient();
      // existsSync should NOT have been called during construction (strategy 1 short-circuits)
      expect(mockedExistsSync).not.toHaveBeenCalled();
    });

    it('uses env var path verbatim (no path manipulation)', () => {
      const sockPath = '/custom/path/to/runtime.sock';
      process.env['GOODVIBES_RUNTIME_SOCKET'] = sockPath;
      mockedExistsSync.mockReturnValue(true);
      const client = new RuntimeClient();
      // The socket path must be the env var value — verify via isAvailable
      expect(client.isAvailable()).toBe(true);
      expect(mockedExistsSync).toHaveBeenCalledWith(sockPath);
    });
  });

  describe('discoverSocket — Strategy 2 (session-keyed pointer file)', () => {
    it('constructs pointer path from runtime-{sessionId}.socket and returns socket when file exists', () => {
      process.env['CLAUDE_PROJECT_DIR'] = '/project';
      const sessionId = 'abc-123-uuid';
      const pointerFile = `/project/.goodvibes/state/runtime-${sessionId}.socket`;
      const socketPath = '/sockets/session-runtime.sock';

      mockedExistsSync.mockImplementation((p) => {
        if (p === `/project/.goodvibes/state`) return true;
        if (p === pointerFile) return true;
        if (p === socketPath) return true;
        return false;
      });
      mockedReadFileSync.mockReturnValue(socketPath as unknown as Buffer);

      const client = new RuntimeClient(sessionId);
      expect(client.isAvailable()).toBe(true);
    });

    it('session-keyed lookup succeeds when matching pointer file exists', () => {
      process.env['CLAUDE_PROJECT_DIR'] = '/project';
      const sessionId = 'my-session-id';
      const socketPath = '/var/run/runtime-my-session-id.sock';

      mockedExistsSync.mockImplementation((p) => {
        if (p === `/project/.goodvibes/state`) return true;
        if (p === socketPath) return true;
        return false;
      });
      mockedReadFileSync.mockReturnValue(socketPath as unknown as Buffer);

      const client = new RuntimeClient(sessionId);
      mockedExistsSync.mockImplementation((p) => p === socketPath);
      expect(client.isAvailable()).toBe(true);
    });

    it('falls through to Strategy 3 when sessionId provided but pointer file does not exist', () => {
      process.env['CLAUDE_PROJECT_DIR'] = '/project';
      const sessionId = 'missing-session';

      // stateDir exists but session pointer file does not
      mockedExistsSync.mockImplementation((p) => {
        if (p === `/project/.goodvibes/state`) return true;
        return false;
      });
      mockedReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const client = new RuntimeClient(sessionId);
      expect(client.isAvailable()).toBe(false);
    });

    it('falls through to Strategy 3 when sessionId is undefined (Strategy 2 skipped entirely)', () => {
      process.env['CLAUDE_PROJECT_DIR'] = '/project';
      // No sessionId — Strategy 2 should be skipped
      mockedExistsSync.mockReturnValue(false);

      const client = new RuntimeClient();
      expect(client.isAvailable()).toBe(false);
      // readFileSync should not be called (Strategy 2 was not entered)
      expect(mockedReadFileSync).not.toHaveBeenCalled();
    });
  });

  describe('discoverSocket — Strategy 3 (PID scan)', () => {
    it('finds a valid runtime-{pid}.socket pointer file and resolves the socket', () => {
      process.env['CLAUDE_PROJECT_DIR'] = '/project';
      const socketPath = '/var/run/runtime-pid.sock';

      mockedExistsSync.mockImplementation((p) => {
        if (p === '/project/.goodvibes/state') return true;
        if (p === socketPath) return true;
        return false;
      });
      mockedReaddirSync.mockReturnValue(['runtime-12345.socket'] as unknown as ReturnType<typeof readdirSync>);
      mockedStatSync.mockReturnValue({ mtimeMs: 1000 } as unknown as ReturnType<typeof statSync>);
      mockedReadFileSync.mockReturnValue(socketPath as unknown as Buffer);

      const client = new RuntimeClient();
      expect(client.isAvailable()).toBe(true);
      expect(mockedReaddirSync).toHaveBeenCalledWith('/project/.goodvibes/state');
    });

    it('skips entries with wrong prefix or extension', () => {
      process.env['CLAUDE_PROJECT_DIR'] = '/project';

      mockedExistsSync.mockImplementation((p) => {
        if (p === '/project/.goodvibes/state') return true;
        return false;
      });
      // Files that should NOT match the widened regex are not present here;
      // files that match but point to non-existent sockets
      mockedReaddirSync.mockReturnValue([
        'session-abc.txt',       // wrong extension
        'runtime.socket',        // legacy file (no suffix separator after "runtime")
        'other-file.socket',     // wrong prefix
      ] as unknown as ReturnType<typeof readdirSync>);
      mockedReadFileSync.mockReturnValue('/tmp/some.sock' as unknown as Buffer);

      const client = new RuntimeClient();
      // None of the entries match the pattern, so Strategy 3 yields nothing
      expect(mockedReadFileSync).not.toHaveBeenCalled();
      expect(client.isAvailable()).toBe(false);
    });

    it('skips entries where the pointed-to socket file does not exist', () => {
      process.env['CLAUDE_PROJECT_DIR'] = '/project';
      const missingSocketPath = '/var/run/gone.sock';

      mockedExistsSync.mockImplementation((p) => {
        if (p === '/project/.goodvibes/state') return true;
        // missingSocketPath does NOT exist
        return false;
      });
      mockedReaddirSync.mockReturnValue(['runtime-99999.socket'] as unknown as ReturnType<typeof readdirSync>);
      mockedStatSync.mockReturnValue({ mtimeMs: 1000 } as unknown as ReturnType<typeof statSync>);
      mockedReadFileSync.mockReturnValue(missingSocketPath as unknown as Buffer);

      const client = new RuntimeClient();
      expect(client.isAvailable()).toBe(false);
    });

    it('falls through to Strategy 4 when no PID pointer files match', () => {
      process.env['CLAUDE_PROJECT_DIR'] = '/project';

      mockedExistsSync.mockImplementation((p) => {
        if (p === '/project/.goodvibes/state') return true;
        return false;
      });
      // readdirSync returns an empty list — no pointer files at all
      mockedReaddirSync.mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);

      const client = new RuntimeClient();
      // Strategies 3 and 4 both fail; client is unavailable
      expect(client.isAvailable()).toBe(false);
    });

    it('selects the newest pointer file first when multiple exist (mtime sort)', () => {
      process.env['CLAUDE_PROJECT_DIR'] = '/project';
      const olderSocketPath = '/var/run/runtime-old.sock';
      const newerSocketPath = '/var/run/runtime-new.sock';

      mockedExistsSync.mockImplementation((p) => {
        if (p === '/project/.goodvibes/state') return true;
        if (p === olderSocketPath) return true;
        if (p === newerSocketPath) return true;
        return false;
      });
      mockedReaddirSync.mockReturnValue([
        'runtime-11111.socket',
        'runtime-22222.socket',
      ] as unknown as ReturnType<typeof readdirSync>);
      // runtime-11111.socket is older, runtime-22222.socket is newer
      mockedStatSync.mockImplementation((p) => {
        if (String(p).includes('runtime-11111')) return { mtimeMs: 1000 } as unknown as ReturnType<typeof statSync>;
        if (String(p).includes('runtime-22222')) return { mtimeMs: 2000 } as unknown as ReturnType<typeof statSync>;
        return { mtimeMs: 0 } as unknown as ReturnType<typeof statSync>;
      });
      mockedReadFileSync.mockImplementation((p) => {
        if (String(p).includes('runtime-22222')) return newerSocketPath as unknown as Buffer;
        return olderSocketPath as unknown as Buffer;
      });

      const client = new RuntimeClient();
      // isAvailable uses existsSync on the discovered socket path
      mockedExistsSync.mockImplementation((p) => p === newerSocketPath);
      // The client should have discovered newerSocketPath (highest mtimeMs)
      expect(client.isAvailable()).toBe(true);
      expect(mockedExistsSync).toHaveBeenCalledWith(newerSocketPath);
    });

    it('falls through to Strategy 4 when all pointer files point to dead sockets', () => {
      process.env['CLAUDE_PROJECT_DIR'] = '/project';

      mockedExistsSync.mockImplementation((p) => {
        if (p === '/project/.goodvibes/state') return true;
        // All socket files are dead (existsSync returns false for them)
        return false;
      });
      mockedReaddirSync.mockReturnValue([
        'runtime-11111.socket',
        'runtime-22222.socket',
      ] as unknown as ReturnType<typeof readdirSync>);
      mockedStatSync.mockReturnValue({ mtimeMs: 1000 } as unknown as ReturnType<typeof statSync>);
      mockedReadFileSync.mockReturnValue('/var/run/dead.sock' as unknown as Buffer);

      const client = new RuntimeClient();
      // Strategy 3 yields nothing; Strategy 4 also absent
      expect(client.isAvailable()).toBe(false);
    });
  });

  describe('discoverSocket — Strategy 4 (legacy pointer file)', () => {
    it('reads socket path from pointer file when env var is absent', () => {
      process.env['CLAUDE_PROJECT_DIR'] = '/project';
      const pointerFile = '/project/.goodvibes/state/runtime.socket';
      const socketPath = '/sockets/runtime.sock';

      // Both pointerFile and socketPath must exist during construction (Strategy 4 validates socketPath)
      mockedExistsSync.mockImplementation((p) => p === pointerFile || p === socketPath);
      mockedReadFileSync.mockReturnValue(socketPath as unknown as Buffer);

      const client = new RuntimeClient();
      expect(client.isAvailable()).toBe(true);
    });

    it('uses process.cwd() as project dir when CLAUDE_PROJECT_DIR is not set', () => {
      const cwd = process.cwd();
      const pointerFile = `${cwd}/.goodvibes/state/runtime.socket`;
      const socketPath = '/sockets/cwd-runtime.sock';

      // Both pointerFile and socketPath must exist during construction (Strategy 4 validates socketPath)
      mockedExistsSync.mockImplementation((p) => p === pointerFile || p === socketPath);
      mockedReadFileSync.mockReturnValue(socketPath as unknown as Buffer);

      const client = new RuntimeClient();
      expect(client.isAvailable()).toBe(true);
    });

    it('trims whitespace from pointer file content', () => {
      process.env['CLAUDE_PROJECT_DIR'] = '/project';
      const pointerFile = '/project/.goodvibes/state/runtime.socket';
      const socketPath = '  /sockets/trimmed.sock  \n';
      const trimmedPath = '/sockets/trimmed.sock';

      // pointerFile and trimmedPath must both exist during construction (Strategy 4 validates socketPath)
      mockedExistsSync.mockImplementation((p) => p === pointerFile || p === trimmedPath);
      mockedReadFileSync.mockReturnValue(socketPath as unknown as Buffer);

      const client = new RuntimeClient();
      expect(client.isAvailable()).toBe(true);
      expect(mockedExistsSync).toHaveBeenCalledWith(trimmedPath);
    });

    it('falls through to Strategy 5 when pointer file content is empty string', () => {
      process.env['CLAUDE_PROJECT_DIR'] = '/project';
      const pointerFile = '/project/.goodvibes/state/runtime.socket';

      // Pointer file exists but is empty
      mockedExistsSync.mockImplementation((p) => p === pointerFile);
      mockedReadFileSync.mockReturnValue('   ' as unknown as Buffer);

      // Strategy 5 fallback also absent
      const client = new RuntimeClient();
      expect(client.isAvailable()).toBe(false);
    });

    it('falls through to Strategy 5 when readFileSync throws', () => {
      process.env['CLAUDE_PROJECT_DIR'] = '/project';
      const pointerFile = '/project/.goodvibes/state/runtime.socket';

      mockedExistsSync.mockImplementation((p) => p === pointerFile);
      mockedReadFileSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      // Strategy 5 fallback also absent
      const client = new RuntimeClient();
      expect(client.isAvailable()).toBe(false);
    });

    it('falls through to Strategy 5 when pointer file does not exist', () => {
      process.env['CLAUDE_PROJECT_DIR'] = '/project';
      // existsSync returns false for the pointer file
      mockedExistsSync.mockReturnValue(false);

      const client = new RuntimeClient();
      expect(client.isAvailable()).toBe(false);
    });
  });

  describe('discoverSocket — Strategy 5 (tmpdir fallback)', () => {
    it('returns tmpdir socket path when pointer file absent and tmpdir socket exists', () => {
      process.env['CLAUDE_PROJECT_DIR'] = '/project';
      const tmpSock = '/tmp/goodvibes-runtime/runtime.sock';

      // Pointer file does not exist, tmpdir socket does
      mockedExistsSync.mockImplementation((p) => p === tmpSock);
      // readFileSync should NOT be called since pointer file does not exist

      const client = new RuntimeClient();
      mockedExistsSync.mockImplementation((p) => p === tmpSock);
      expect(client.isAvailable()).toBe(true);
    });

    it('constructs tmpdir path using os.tmpdir()', () => {
      mockedTmpdir.mockReturnValue('/custom-tmp');
      const tmpSock = '/custom-tmp/goodvibes-runtime/runtime.sock';

      mockedExistsSync.mockImplementation((p) => p === tmpSock);

      const client = new RuntimeClient();
      mockedExistsSync.mockImplementation((p) => p === tmpSock);
      expect(client.isAvailable()).toBe(true);
      expect(mockedExistsSync).toHaveBeenCalledWith(tmpSock);
    });

    it('returns null (socket not discovered) when all 5 strategies fail', () => {
      mockedExistsSync.mockReturnValue(false);
      const client = new RuntimeClient();
      expect(client.isAvailable()).toBe(false);
    });
  });

  describe('discoverSocket — fallback chain order', () => {
    it('env var takes priority over pointer file', () => {
      process.env['GOODVIBES_RUNTIME_SOCKET'] = '/env/runtime.sock';
      process.env['CLAUDE_PROJECT_DIR'] = '/project';

      // Even if pointer file would exist, env var should win
      const pointerFile = '/project/.goodvibes/state/runtime.socket';
      mockedExistsSync.mockImplementation((p) => p === pointerFile || p === '/env/runtime.sock');
      mockedReadFileSync.mockReturnValue('/pointer/runtime.sock' as unknown as Buffer);

      new RuntimeClient();
      // readFileSync should NOT have been called (env var short-circuited)
      expect(mockedReadFileSync).not.toHaveBeenCalled();
    });

    it('pointer file takes priority over tmpdir when pointer file exists and is non-empty', () => {
      process.env['CLAUDE_PROJECT_DIR'] = '/project';
      const pointerFile = '/project/.goodvibes/state/runtime.socket';
      const pointerSocketPath = '/pointer/runtime.sock';
      const tmpSock = '/tmp/goodvibes-runtime/runtime.sock';

      mockedExistsSync.mockImplementation((p) => {
        if (p === pointerFile) return true;
        if (p === tmpSock) return true;
        if (p === pointerSocketPath) return true;
        return false;
      });
      mockedReadFileSync.mockReturnValue(pointerSocketPath as unknown as Buffer);

      const client = new RuntimeClient();
      // isAvailable should resolve to pointerSocketPath, not tmpSock
      expect(client.isAvailable()).toBe(true);
      // existsSync should be called with pointerSocketPath (not tmpSock) for isAvailable check
      expect(mockedExistsSync).toHaveBeenCalledWith(pointerSocketPath);
    });
  });

  // ─── isAvailable() ─────────────────────────────────────────────────────

  describe('isAvailable()', () => {
    it('returns false when socket path is null (no strategy succeeded)', () => {
      mockedExistsSync.mockReturnValue(false);
      const client = new RuntimeClient();
      expect(client.isAvailable()).toBe(false);
    });

    it('returns false when socket path discovered but file does not exist on disk', () => {
      process.env['GOODVIBES_RUNTIME_SOCKET'] = '/run/goodvibes.sock';
      // After construction, existsSync returns false for isAvailable check
      mockedExistsSync.mockReturnValue(false);
      const client = new RuntimeClient();
      expect(client.isAvailable()).toBe(false);
    });

    it('returns true when socket path discovered and file exists on disk', () => {
      process.env['GOODVIBES_RUNTIME_SOCKET'] = '/run/goodvibes.sock';
      mockedExistsSync.mockReturnValue(true);
      const client = new RuntimeClient();
      expect(client.isAvailable()).toBe(true);
    });

    it('calls existsSync with the discovered socket path', () => {
      const sockPath = '/run/my-socket.sock';
      process.env['GOODVIBES_RUNTIME_SOCKET'] = sockPath;
      mockedExistsSync.mockReturnValue(true);
      const client = new RuntimeClient();
      client.isAvailable();
      expect(mockedExistsSync).toHaveBeenCalledWith(sockPath);
    });

    it('is a synchronous check — does not create a connection', () => {
      process.env['GOODVIBES_RUNTIME_SOCKET'] = '/run/goodvibes.sock';
      mockedExistsSync.mockReturnValue(true);
      const client = new RuntimeClient();
      client.isAvailable();
      expect(mockedCreateConnection).not.toHaveBeenCalled();
    });
  });

  // ─── sendHookEvent() ───────────────────────────────────────────────────

  describe('sendHookEvent()', () => {
    it('returns null immediately when not available (no socket)', async () => {
      mockedExistsSync.mockReturnValue(false);
      const client = new RuntimeClient();
      const result = await client.sendHookEvent('session:started', { foo: 'bar' });
      expect(result).toBeNull();
      expect(mockedCreateConnection).not.toHaveBeenCalled();
    });

    it('returns null when socket is discovered but file does not exist (isAvailable false)', async () => {
      process.env['GOODVIBES_RUNTIME_SOCKET'] = '/run/goodvibes.sock';
      // existsSync returns false for the isAvailable check
      mockedExistsSync.mockReturnValue(false);
      const client = new RuntimeClient();
      const result = await client.sendHookEvent('session:started', {});
      expect(result).toBeNull();
    });

    it('sends a hook_event message over the socket when available', async () => {
      process.env['GOODVIBES_RUNTIME_SOCKET'] = '/run/goodvibes.sock';
      mockedExistsSync.mockReturnValue(true);

      const { socket, emit } = makeFakeSocket();
      mockedCreateConnection.mockReturnValue(socket as unknown as net.Socket);

      const responsePayload = { kind: 'ack' as const };
      const ipcResponse = { id: 'test-id', status: 'ok' as const, data: responsePayload };

      const client = new RuntimeClient();
      const resultPromise = client.sendHookEvent('session:started', { session_id: 'abc' });

      // Trigger socket connect → will call socket.write()
      emit('connect');
      // Simulate server response
      emit('data', Buffer.from(JSON.stringify(ipcResponse) + '\n'));

      const result = await resultPromise;
      expect(result).toEqual(responsePayload);
    });

    it('sends message with correct type and hook_name fields', async () => {
      process.env['GOODVIBES_RUNTIME_SOCKET'] = '/run/goodvibes.sock';
      mockedExistsSync.mockReturnValue(true);

      const { socket, emit } = makeFakeSocket();
      mockedCreateConnection.mockReturnValue(socket as unknown as net.Socket);

      const ipcResponse = { id: 'x', status: 'ok' as const, data: { kind: 'ack' as const } };

      const client = new RuntimeClient();
      const resultPromise = client.sendHookEvent('pre:tool:use', { tool_name: 'Bash' });

      emit('connect');
      emit('data', Buffer.from(JSON.stringify(ipcResponse) + '\n'));

      await resultPromise;

      expect(socket.write).toHaveBeenCalledOnce();
      const written = socket.write.mock.calls[0][0] as string;
      const parsed = JSON.parse(written) as Record<string, unknown>;
      expect(parsed['type']).toBe('hook_event');
      expect(parsed['hook_name']).toBe('pre:tool:use');
      expect(parsed['hook_input']).toEqual({ tool_name: 'Bash' });
      expect(typeof parsed['id']).toBe('string');
      expect(typeof parsed['timestamp']).toBe('string');
    });

    it('returns null when engine responds with status error', async () => {
      process.env['GOODVIBES_RUNTIME_SOCKET'] = '/run/goodvibes.sock';
      mockedExistsSync.mockReturnValue(true);

      const { socket, emit } = makeFakeSocket();
      mockedCreateConnection.mockReturnValue(socket as unknown as net.Socket);

      const ipcResponse = { id: 'x', status: 'error' as const, error: 'internal error' };

      const client = new RuntimeClient();
      const resultPromise = client.sendHookEvent('session:started', {});

      emit('connect');
      emit('data', Buffer.from(JSON.stringify(ipcResponse) + '\n'));

      const result = await resultPromise;
      expect(result).toBeNull();
    });

    it('returns null when engine responds with ok but no data', async () => {
      process.env['GOODVIBES_RUNTIME_SOCKET'] = '/run/goodvibes.sock';
      mockedExistsSync.mockReturnValue(true);

      const { socket, emit } = makeFakeSocket();
      mockedCreateConnection.mockReturnValue(socket as unknown as net.Socket);

      const ipcResponse = { id: 'x', status: 'ok' as const };

      const client = new RuntimeClient();
      const resultPromise = client.sendHookEvent('session:started', {});

      emit('connect');
      emit('data', Buffer.from(JSON.stringify(ipcResponse) + '\n'));

      const result = await resultPromise;
      expect(result).toBeNull();
    });

    it('swallows socket errors — returns null without throwing', async () => {
      process.env['GOODVIBES_RUNTIME_SOCKET'] = '/run/goodvibes.sock';
      mockedExistsSync.mockReturnValue(true);

      const { socket, emit } = makeFakeSocket();
      mockedCreateConnection.mockReturnValue(socket as unknown as net.Socket);

      const client = new RuntimeClient();
      const resultPromise = client.sendHookEvent('session:started', {});

      // Simulate a socket error with correct .code property (source checks err.code === 'ECONNREFUSED')
      emit('error', Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' }));

      const result = await resultPromise;
      expect(result).toBeNull();
    });

    it('swallows timeout — returns null after timeout fires', async () => {
      vi.useFakeTimers();
      try {
        process.env['GOODVIBES_RUNTIME_SOCKET'] = '/run/goodvibes.sock';
        mockedExistsSync.mockReturnValue(true);

        const { socket } = makeFakeSocket();
        mockedCreateConnection.mockReturnValue(socket as unknown as net.Socket);

        const client = new RuntimeClient();
        const resultPromise = client.sendHookEvent('session:started', {});

        // Advance time past HOOK_EVENT_TIMEOUT_MS (500ms)
        vi.advanceTimersByTime(600);

        const result = await resultPromise;
        expect(result).toBeNull();
        expect(socket.destroy).toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // ─── query() ───────────────────────────────────────────────────────────

  describe('query()', () => {
    it('returns null immediately when not available', async () => {
      mockedExistsSync.mockReturnValue(false);
      const client = new RuntimeClient();
      const result = await client.query({ kind: 'get_system_message' });
      expect(result).toBeNull();
      expect(mockedCreateConnection).not.toHaveBeenCalled();
    });

    it('sends a query message with correct type and query fields', async () => {
      process.env['GOODVIBES_RUNTIME_SOCKET'] = '/run/goodvibes.sock';
      mockedExistsSync.mockReturnValue(true);

      const { socket, emit } = makeFakeSocket();
      mockedCreateConnection.mockReturnValue(socket as unknown as net.Socket);

      const responseData = { kind: 'system_message' as const, message: 'hello', directives: [] };
      const ipcResponse = { id: 'x', status: 'ok' as const, data: responseData };

      const client = new RuntimeClient();
      const resultPromise = client.query({ kind: 'get_system_message' });

      emit('connect');
      emit('data', Buffer.from(JSON.stringify(ipcResponse) + '\n'));

      const result = await resultPromise;
      expect(result).toEqual(responseData);

      const written = socket.write.mock.calls[0][0] as string;
      const parsed = JSON.parse(written) as Record<string, unknown>;
      expect(parsed['type']).toBe('query');
      expect(parsed['query']).toEqual({ kind: 'get_system_message' });
    });

    it('returns null when engine responds with error status', async () => {
      process.env['GOODVIBES_RUNTIME_SOCKET'] = '/run/goodvibes.sock';
      mockedExistsSync.mockReturnValue(true);

      const { socket, emit } = makeFakeSocket();
      mockedCreateConnection.mockReturnValue(socket as unknown as net.Socket);

      const ipcResponse = { id: 'x', status: 'error' as const, error: 'not found' };

      const client = new RuntimeClient();
      const resultPromise = client.query({ kind: 'get_directives' });

      emit('connect');
      emit('data', Buffer.from(JSON.stringify(ipcResponse) + '\n'));

      const result = await resultPromise;
      expect(result).toBeNull();
    });

    it('returns null when ok but data is undefined', async () => {
      process.env['GOODVIBES_RUNTIME_SOCKET'] = '/run/goodvibes.sock';
      mockedExistsSync.mockReturnValue(true);

      const { socket, emit } = makeFakeSocket();
      mockedCreateConnection.mockReturnValue(socket as unknown as net.Socket);

      const ipcResponse = { id: 'x', status: 'ok' as const };

      const client = new RuntimeClient();
      const resultPromise = client.query({ kind: 'get_context_injection' });

      emit('connect');
      emit('data', Buffer.from(JSON.stringify(ipcResponse) + '\n'));

      const result = await resultPromise;
      expect(result).toBeNull();
    });

    it('swallows socket errors — returns null without throwing', async () => {
      process.env['GOODVIBES_RUNTIME_SOCKET'] = '/run/goodvibes.sock';
      mockedExistsSync.mockReturnValue(true);

      const { socket, emit } = makeFakeSocket();
      mockedCreateConnection.mockReturnValue(socket as unknown as net.Socket);

      const client = new RuntimeClient();
      const resultPromise = client.query({ kind: 'get_directives' });

      emit('error', new Error('connection refused'));

      const result = await resultPromise;
      expect(result).toBeNull();
    });

    it('swallows timeout — returns null after QUERY_TIMEOUT_MS', async () => {
      vi.useFakeTimers();
      try {
        process.env['GOODVIBES_RUNTIME_SOCKET'] = '/run/goodvibes.sock';
        mockedExistsSync.mockReturnValue(true);

        const { socket } = makeFakeSocket();
        mockedCreateConnection.mockReturnValue(socket as unknown as net.Socket);

        const client = new RuntimeClient();
        const resultPromise = client.query({ kind: 'get_workflow_state', workflow_id: 'wf-1' });

        vi.advanceTimersByTime(600);

        const result = await resultPromise;
        expect(result).toBeNull();
        expect(socket.destroy).toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('supports all query kinds (get_agent_status)', async () => {
      process.env['GOODVIBES_RUNTIME_SOCKET'] = '/run/goodvibes.sock';
      mockedExistsSync.mockReturnValue(true);

      const { socket, emit } = makeFakeSocket();
      mockedCreateConnection.mockReturnValue(socket as unknown as net.Socket);

      const responseData = { kind: 'agent_status' as const, agent: { id: 'a1', state: 'running' } };
      const ipcResponse = { id: 'x', status: 'ok' as const, data: responseData };

      const client = new RuntimeClient();
      const resultPromise = client.query({ kind: 'get_agent_status', agent_id: 'a1' });

      emit('connect');
      emit('data', Buffer.from(JSON.stringify(ipcResponse) + '\n'));

      const result = await resultPromise;
      expect(result).toEqual(responseData);
    });

    it('supports should_block_tool query kind', async () => {
      process.env['GOODVIBES_RUNTIME_SOCKET'] = '/run/goodvibes.sock';
      mockedExistsSync.mockReturnValue(true);

      const { socket, emit } = makeFakeSocket();
      mockedCreateConnection.mockReturnValue(socket as unknown as net.Socket);

      const responseData = { kind: 'tool_decision' as const, allow: false, reason: 'blocked' };
      const ipcResponse = { id: 'x', status: 'ok' as const, data: responseData };

      const client = new RuntimeClient();
      const resultPromise = client.query({
        kind: 'should_block_tool',
        tool_name: 'Bash',
        tool_input: { command: 'rm -rf /' },
      });

      emit('connect');
      emit('data', Buffer.from(JSON.stringify(ipcResponse) + '\n'));

      const result = await resultPromise;
      expect(result).toEqual(responseData);
    });
  });

  // ─── sendMessage internals ─────────────────────────────────────────────

  describe('sendMessage internals (via sendHookEvent)', () => {
    it('writes newline-terminated JSON to the socket on connect', async () => {
      process.env['GOODVIBES_RUNTIME_SOCKET'] = '/run/goodvibes.sock';
      mockedExistsSync.mockReturnValue(true);

      const { socket, emit } = makeFakeSocket();
      mockedCreateConnection.mockReturnValue(socket as unknown as net.Socket);

      const ipcResponse = { id: 'x', status: 'ok' as const, data: { kind: 'ack' as const } };

      const client = new RuntimeClient();
      const resultPromise = client.sendHookEvent('hook', {});

      emit('connect');
      emit('data', Buffer.from(JSON.stringify(ipcResponse) + '\n'));

      await resultPromise;

      expect(socket.write).toHaveBeenCalledOnce();
      const written = socket.write.mock.calls[0][0] as string;
      expect(written.endsWith('\n')).toBe(true);
      // Must be valid JSON (before the newline)
      expect(() => JSON.parse(written.trimEnd())).not.toThrow();
    });

    it('calls createConnection with the discovered socket path', async () => {
      const sockPath = '/run/goodvibes.sock';
      process.env['GOODVIBES_RUNTIME_SOCKET'] = sockPath;
      mockedExistsSync.mockReturnValue(true);

      const { socket, emit } = makeFakeSocket();
      mockedCreateConnection.mockReturnValue(socket as unknown as net.Socket);

      const ipcResponse = { id: 'x', status: 'ok' as const, data: { kind: 'ack' as const } };

      const client = new RuntimeClient();
      const resultPromise = client.sendHookEvent('hook', {});

      emit('connect');
      emit('data', Buffer.from(JSON.stringify(ipcResponse) + '\n'));

      await resultPromise;

      expect(mockedCreateConnection).toHaveBeenCalledWith({ path: sockPath });
    });

    it('handles chunked data — waits until newline before resolving', async () => {
      process.env['GOODVIBES_RUNTIME_SOCKET'] = '/run/goodvibes.sock';
      mockedExistsSync.mockReturnValue(true);

      const { socket, emit } = makeFakeSocket();
      mockedCreateConnection.mockReturnValue(socket as unknown as net.Socket);

      const ipcResponse = { id: 'x', status: 'ok' as const, data: { kind: 'ack' as const } };
      const fullMessage = JSON.stringify(ipcResponse) + '\n';
      const half1 = fullMessage.slice(0, 10);
      const half2 = fullMessage.slice(10);

      const client = new RuntimeClient();
      const resultPromise = client.sendHookEvent('hook', {});

      emit('connect');
      // Send data in two chunks
      emit('data', Buffer.from(half1));
      // Promise should NOT resolve yet (no newline)
      emit('data', Buffer.from(half2));

      const result = await resultPromise;
      expect(result).toEqual({ kind: 'ack' });
    });

    it('returns null when JSON parse fails on malformed response', async () => {
      process.env['GOODVIBES_RUNTIME_SOCKET'] = '/run/goodvibes.sock';
      mockedExistsSync.mockReturnValue(true);

      const { socket, emit } = makeFakeSocket();
      mockedCreateConnection.mockReturnValue(socket as unknown as net.Socket);

      const client = new RuntimeClient();
      const resultPromise = client.sendHookEvent('hook', {});

      emit('connect');
      // Malformed JSON
      emit('data', Buffer.from('{not valid json}\n'));

      const result = await resultPromise;
      expect(result).toBeNull();
    });

    it('resolves null when socket close event fires before data', async () => {
      process.env['GOODVIBES_RUNTIME_SOCKET'] = '/run/goodvibes.sock';
      mockedExistsSync.mockReturnValue(true);

      const { socket, emit } = makeFakeSocket();
      mockedCreateConnection.mockReturnValue(socket as unknown as net.Socket);

      const client = new RuntimeClient();
      const resultPromise = client.sendHookEvent('hook', {});

      // Socket closes without sending data
      emit('close');

      const result = await resultPromise;
      expect(result).toBeNull();
    });

    it('destroys socket after reading the first complete response', async () => {
      process.env['GOODVIBES_RUNTIME_SOCKET'] = '/run/goodvibes.sock';
      mockedExistsSync.mockReturnValue(true);

      const { socket, emit } = makeFakeSocket();
      mockedCreateConnection.mockReturnValue(socket as unknown as net.Socket);

      const ipcResponse = { id: 'x', status: 'ok' as const, data: { kind: 'ack' as const } };

      const client = new RuntimeClient();
      const resultPromise = client.sendHookEvent('hook', {});

      emit('connect');
      emit('data', Buffer.from(JSON.stringify(ipcResponse) + '\n'));

      await resultPromise;
      expect(socket.destroy).toHaveBeenCalled();
    });

    it('double-resolution guard: second done() call is a no-op', async () => {
      process.env['GOODVIBES_RUNTIME_SOCKET'] = '/run/goodvibes.sock';
      mockedExistsSync.mockReturnValue(true);

      const { socket, emit } = makeFakeSocket();
      mockedCreateConnection.mockReturnValue(socket as unknown as net.Socket);

      const ipcResponse = { id: 'x', status: 'ok' as const, data: { kind: 'ack' as const } };

      const client = new RuntimeClient();
      const resultPromise = client.sendHookEvent('hook', {});

      emit('connect');
      emit('data', Buffer.from(JSON.stringify(ipcResponse) + '\n'));

      const result1 = await resultPromise;

      // Trigger close after data was already processed (should be no-op)
      emit('close');

      // Should still be the original result
      expect(result1).toEqual({ kind: 'ack' });
    });

    it('calls unlinkSync (tryCleanStaleSocket) when ECONNREFUSED error fires', async () => {
      process.env['GOODVIBES_RUNTIME_SOCKET'] = '/run/goodvibes.sock';
      mockedExistsSync.mockReturnValue(true);

      const { socket, emit } = makeFakeSocket();
      mockedCreateConnection.mockReturnValue(socket as unknown as net.Socket);

      const client = new RuntimeClient();
      const resultPromise = client.sendHookEvent('session:started', {});

      // Emit ECONNREFUSED error with proper .code property
      emit('error', Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' }));

      const result = await resultPromise;
      expect(result).toBeNull();
      // tryCleanStaleSocket should call unlinkSync on the socket file
      expect(mockedUnlinkSync).toHaveBeenCalled();
    });

    it('calls unlinkSync (tryCleanStaleSocket) when ENOENT error fires', async () => {
      process.env['GOODVIBES_RUNTIME_SOCKET'] = '/run/goodvibes.sock';
      mockedExistsSync.mockReturnValue(true);

      const { socket, emit } = makeFakeSocket();
      mockedCreateConnection.mockReturnValue(socket as unknown as net.Socket);

      const client = new RuntimeClient();
      const resultPromise = client.sendHookEvent('session:started', {});

      // Emit ENOENT error — socket was deleted between isAvailable() and connect attempt
      emit('error', Object.assign(new Error('no such file or directory'), { code: 'ENOENT' }));

      const result = await resultPromise;
      expect(result).toBeNull();
      // tryCleanStaleSocket should call unlinkSync on the (already-gone) socket file
      expect(mockedUnlinkSync).toHaveBeenCalled();
    });

    it('does NOT call unlinkSync on non-ECONNREFUSED/non-ENOENT errors', async () => {
      process.env['GOODVIBES_RUNTIME_SOCKET'] = '/run/goodvibes.sock';
      mockedExistsSync.mockReturnValue(true);

      const { socket, emit } = makeFakeSocket();
      mockedCreateConnection.mockReturnValue(socket as unknown as net.Socket);

      const client = new RuntimeClient();
      const resultPromise = client.sendHookEvent('session:started', {});

      emit('error', Object.assign(new Error('connection reset'), { code: 'ECONNRESET' }));

      const result = await resultPromise;
      expect(result).toBeNull();
      expect(mockedUnlinkSync).not.toHaveBeenCalled();
    });

    it('double-resolution guard: error after data is a no-op', async () => {
      process.env['GOODVIBES_RUNTIME_SOCKET'] = '/run/goodvibes.sock';
      mockedExistsSync.mockReturnValue(true);

      const { socket, emit } = makeFakeSocket();
      mockedCreateConnection.mockReturnValue(socket as unknown as net.Socket);

      const ipcResponse = { id: 'x', status: 'ok' as const, data: { kind: 'ack' as const } };

      const client = new RuntimeClient();
      const resultPromise = client.sendHookEvent('hook', {});

      emit('connect');
      emit('data', Buffer.from(JSON.stringify(ipcResponse) + '\n'));
      // Fire error after data (should be ignored)
      emit('error', new Error('post-data error'));

      const result = await resultPromise;
      expect(result).toEqual({ kind: 'ack' });
    });
  });

  // ─── generateId (indirect) ─────────────────────────────────────────────

  describe('generateId (indirect, via sendHookEvent)', () => {
    it('generates a string id on each message', async () => {
      process.env['GOODVIBES_RUNTIME_SOCKET'] = '/run/goodvibes.sock';
      mockedExistsSync.mockReturnValue(true);

      const { socket, emit } = makeFakeSocket();
      mockedCreateConnection.mockReturnValue(socket as unknown as net.Socket);

      const ipcResponse = { id: 'x', status: 'ok' as const, data: { kind: 'ack' as const } };

      const client = new RuntimeClient();

      // First call
      const p1 = client.sendHookEvent('hook', {});
      emit('connect');
      emit('data', Buffer.from(JSON.stringify(ipcResponse) + '\n'));
      await p1;

      // Grab the id from written JSON
      const written1 = socket.write.mock.calls[0][0] as string;
      const id1 = (JSON.parse(written1) as Record<string, unknown>)['id'] as string;
      expect(typeof id1).toBe('string');
      expect(id1.length).toBeGreaterThan(0);
    });

    it('generates unique ids across calls', async () => {
      process.env['GOODVIBES_RUNTIME_SOCKET'] = '/run/goodvibes.sock';
      mockedExistsSync.mockReturnValue(true);

      const { socket: socket1, emit: emit1 } = makeFakeSocket();
      const { socket: socket2, emit: emit2 } = makeFakeSocket();
      mockedCreateConnection
        .mockReturnValueOnce(socket1 as unknown as net.Socket)
        .mockReturnValueOnce(socket2 as unknown as net.Socket);

      const ipcResponse = { id: 'x', status: 'ok' as const, data: { kind: 'ack' as const } };

      const client = new RuntimeClient();

      const p1 = client.sendHookEvent('hook1', {});
      emit1('connect');
      emit1('data', Buffer.from(JSON.stringify(ipcResponse) + '\n'));
      await p1;

      const p2 = client.sendHookEvent('hook2', {});
      emit2('connect');
      emit2('data', Buffer.from(JSON.stringify(ipcResponse) + '\n'));
      await p2;

      const written1 = socket1.write.mock.calls[0][0] as string;
      const written2 = socket2.write.mock.calls[0][0] as string;
      const id1 = (JSON.parse(written1) as Record<string, unknown>)['id'];
      const id2 = (JSON.parse(written2) as Record<string, unknown>)['id'];

      // IDs should be different (probabilistic — but realistic)
      expect(id1).not.toBe(id2);
    });
  });
});
