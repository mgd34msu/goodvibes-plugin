/**
 * Tests for DaemonHookServer — hook IPC endpoint for daemon mode.
 *
 * Strategy: real Unix sockets (integration style, like daemon-integration.test.ts)
 * to verify the full IPC round-trip without mocking the socket layer.
 *
 * Test sections:
 *   1. Server lifecycle
 *   2. Hook client connects and communicates (get_directives empty)
 *   3. hook_event processed through engine pipeline
 *   4. get_directives returns directives after hook_event
 *   5. Multiple sessions get isolated directive queues
 *   6. Pointer file written on start and removed on stop
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as net from 'node:net';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tempSocket(label: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  // Use a subdirectory so IPCServer.listen() can chmod the dir without EPERM on /tmp
  const dir = path.join(os.tmpdir(), `gv-hook-test-${label}-${suffix}`);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'hook.sock');
}

function tempDir(label: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  const dir = path.join(os.tmpdir(), `gv-hook-test-${label}-${suffix}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanPath(p: string): void {
  // p is the socket file; also clean up the socket's parent directory
  try { fs.rmSync(path.dirname(p), { recursive: true, force: true }); } catch { /* ignore */ }
}

function cleanDir(d: string): void {
  try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
}

/** Send a single newline-delimited JSON IPC message to a socket and read one response. */
function sendIPC(
  socketPath: string,
  message: Record<string, unknown>,
  timeoutMs = 2000
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (result: Record<string, unknown> | Error): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (result instanceof Error) {
        reject(result);
      } else {
        resolve(result);
      }
      socket.destroy();
    };

    const timer = setTimeout(() => finish(new Error(`sendIPC timeout after ${timeoutMs}ms`)), timeoutMs);
    const socket = net.createConnection(socketPath);

    socket.once('error', (err) => finish(err));
    socket.once('connect', () => {
      socket.write(JSON.stringify(message) + '\n', 'utf-8');
    });

    let rawData = '';
    socket.on('data', (chunk) => {
      rawData += chunk.toString('utf-8');
      const idx = rawData.indexOf('\n');
      if (idx !== -1) {
        const line = rawData.slice(0, idx);
        try {
          finish(JSON.parse(line) as Record<string, unknown>);
        } catch (e) {
          finish(new Error(`Failed to parse response: ${line}`));
        }
      }
    });
  });
}

// ─── Mock engine factory ─────────────────────────────────────────────────────

import type { RuntimeEngine } from '../../bootstrap.js';

function createMockEngine(opts?: { processImmediate?: (e: unknown) => Promise<void> }) {
  // Minimal DirectiveQueue that lets us enqueue and drain directives for testing
  const directives: Array<Record<string, unknown>> = [];
  const directiveQueue = {
    holdDrain: vi.fn().mockImplementation(() => ({
      holdId: 'hold-1',
      directives: [...directives],
    })),
    releaseHold: vi.fn(),
    reEnqueueHold: vi.fn(),
    sweepStaleHolds: vi.fn(),
    clear: vi.fn(),
    // Test helper: push a directive into the queue
    _push: (d: Record<string, unknown>) => { directives.push(d); },
  };

  const eventProcessor = {
    processImmediate: opts?.processImmediate
      ? vi.fn(opts.processImmediate)
      : vi.fn().mockResolvedValue(undefined),
  };

  const emittedEvents: unknown[] = [];
  const eventBus = {
    emit: vi.fn((e: unknown) => { emittedEvents.push(e); }),
  };

  return {
    getEventBus: vi.fn().mockReturnValue(eventBus),
    getTriggerRegistry: vi.fn().mockReturnValue(null),
    getWorkflowEngine: vi.fn().mockReturnValue(null),
    getAgentCoordinator: vi.fn().mockReturnValue(null),
    getDirectiveQueue: vi.fn().mockReturnValue(directiveQueue),
    getCoreStateStore: vi.fn().mockReturnValue({
      keys: vi.fn().mockReturnValue([]),
      delete: vi.fn(),
    }),
    getHookProcessor: vi.fn().mockReturnValue(null),
    getExecutorMode: vi.fn().mockReturnValue(null),
    getExecutorBudget: vi.fn().mockReturnValue(null),
    getDaemonTickHandler: vi.fn().mockReturnValue(null),
    getEventProcessor: vi.fn().mockReturnValue(eventProcessor),
    // Test helpers
    _directiveQueue: directiveQueue,
    _eventBus: eventBus,
    _emittedEvents: emittedEvents,
    _eventProcessor: eventProcessor,
  };
}

function asEngine(mock: ReturnType<typeof createMockEngine>): RuntimeEngine {
  return mock as unknown as RuntimeEngine;
}

// ─── Import under test ───────────────────────────────────────────────────────

import { DaemonHookServer } from '../daemon-hook-server.js';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Server lifecycle
// ═══════════════════════════════════════════════════════════════════════════════

describe('DaemonHookServer — lifecycle', () => {
  let socketPath: string;
  let stateDir: string;
  let server: DaemonHookServer;

  beforeEach(() => {
    socketPath = tempSocket('lifecycle');
    stateDir = tempDir('lifecycle-state');
  });

  afterEach(async () => {
    try { await server?.stop(); } catch { /* ignore */ }
    cleanPath(socketPath);
    cleanDir(stateDir);
  });

  it('starts and creates a socket file', async () => {
    const engine = createMockEngine();
    server = new DaemonHookServer({ socketPath, stateDir, engine: asEngine(engine) });
    await server.start();
    expect(fs.existsSync(socketPath)).toBe(true);
  });

  it('cleans up the socket file on stop', async () => {
    const engine = createMockEngine();
    server = new DaemonHookServer({ socketPath, stateDir, engine: asEngine(engine) });
    await server.start();
    expect(fs.existsSync(socketPath)).toBe(true);
    await server.stop();
    expect(fs.existsSync(socketPath)).toBe(false);
  });

  it('stop() is idempotent (safe to call multiple times)', async () => {
    const engine = createMockEngine();
    server = new DaemonHookServer({ socketPath, stateDir, engine: asEngine(engine) });
    await server.start();
    await server.stop();
    await expect(server.stop()).resolves.not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. get_directives returns empty when no directives pending
// ═══════════════════════════════════════════════════════════════════════════════

describe('DaemonHookServer — get_directives empty', () => {
  let socketPath: string;
  let stateDir: string;
  let server: DaemonHookServer;

  beforeEach(async () => {
    socketPath = tempSocket('get-dir-empty');
    stateDir = tempDir('get-dir-empty-state');
    const engine = createMockEngine();
    // Override holdDrain to return empty
    engine._directiveQueue.holdDrain.mockReturnValue({ holdId: '', directives: [] });
    server = new DaemonHookServer({ socketPath, stateDir, engine: asEngine(engine) });
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
    cleanPath(socketPath);
    cleanDir(stateDir);
  });

  it('returns empty system_message when no directives queued', async () => {
    const msg = {
      type: 'query',
      id: 'q-1',
      query: { kind: 'get_directives' },
    };
    const resp = await sendIPC(socketPath, msg);
    expect(resp['status']).toBe('ok');
    expect((resp['data'] as Record<string, unknown>)['kind']).toBe('system_message');
    expect((resp['data'] as Record<string, unknown>)['message']).toBe('');
    expect((resp['data'] as Record<string, unknown>)['directives']).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. hook_event processed through engine pipeline
// ═══════════════════════════════════════════════════════════════════════════════

describe('DaemonHookServer — hook_event processing', () => {
  let socketPath: string;
  let stateDir: string;
  let server: DaemonHookServer;
  let engine: ReturnType<typeof createMockEngine>;

  beforeEach(async () => {
    socketPath = tempSocket('hook-event');
    stateDir = tempDir('hook-event-state');
    engine = createMockEngine();
    server = new DaemonHookServer({ socketPath, stateDir, engine: asEngine(engine) });
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
    cleanPath(socketPath);
    cleanDir(stateDir);
  });

  it('emits hook_event onto EventBus and returns ack', async () => {
    const hookInput = { session_id: 'sess-abc', tool_name: 'Bash' };
    const msg = {
      type: 'hook_event',
      id: 'he-1',
      hook_name: 'agent:completed',
      hook_input: hookInput,
      timestamp: new Date().toISOString(),
    };
    const resp = await sendIPC(socketPath, msg);
    expect(resp['status']).toBe('ok');
    expect((resp['data'] as Record<string, unknown>)['kind']).toBe('ack');
    // Verify event was emitted on the EventBus
    expect(engine._eventBus.emit).toHaveBeenCalledTimes(1);
    const emittedEvent = (engine._eventBus.emit as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    expect(emittedEvent['type']).toBe('agent:completed');
  });

  it('calls processImmediate on EventProcessor for synchronous directive enqueuing', async () => {
    const msg = {
      type: 'hook_event',
      id: 'he-2',
      hook_name: 'agent:completed',
      hook_input: { session_id: 'sess-123' },
      timestamp: new Date().toISOString(),
    };
    await sendIPC(socketPath, msg);
    expect(engine._eventProcessor.processImmediate).toHaveBeenCalledTimes(1);
  });

  it('writes session-keyed pointer file on session:started', async () => {
    const sessionId = 'sess-started-test';
    const msg = {
      type: 'hook_event',
      id: 'he-3',
      hook_name: 'session:started',
      hook_input: { session_id: sessionId },
      timestamp: new Date().toISOString(),
    };
    await sendIPC(socketPath, msg);
    // IPCRouter writes runtime-{sessionId}.socket pointer file
    const pointerPath = path.join(stateDir, `runtime-${sessionId}.socket`);
    expect(fs.existsSync(pointerPath)).toBe(true);
    const written = fs.readFileSync(pointerPath, 'utf-8').trim();
    expect(written).toBe(socketPath);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Multiple sessions get isolated directive queues
// ═══════════════════════════════════════════════════════════════════════════════

describe('DaemonHookServer — session isolation', () => {
  let socketPath: string;
  let stateDir: string;
  let server: DaemonHookServer;
  let engine: ReturnType<typeof createMockEngine>;

  beforeEach(async () => {
    socketPath = tempSocket('session-isolation');
    stateDir = tempDir('session-isolation-state');
    engine = createMockEngine();
    server = new DaemonHookServer({ socketPath, stateDir, engine: asEngine(engine) });
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
    cleanPath(socketPath);
    cleanDir(stateDir);
  });

  it('multiple sequential clients each get independent IPC responses', async () => {
    // Send two independent hook_event messages from different connections
    const msg1 = {
      type: 'hook_event',
      id: 'iso-1',
      hook_name: 'agent:completed',
      hook_input: { session_id: 'sess-iso-1' },
      timestamp: new Date().toISOString(),
    };
    const msg2 = {
      type: 'hook_event',
      id: 'iso-2',
      hook_name: 'agent:completed',
      hook_input: { session_id: 'sess-iso-2' },
      timestamp: new Date().toISOString(),
    };

    // Each gets its own connection (one message per connection per protocol)
    const [resp1, resp2] = await Promise.all([
      sendIPC(socketPath, msg1),
      sendIPC(socketPath, msg2),
    ]);

    expect(resp1['status']).toBe('ok');
    expect((resp1['data'] as Record<string, unknown>)['kind']).toBe('ack');
    expect(resp2['status']).toBe('ok');
    expect((resp2['data'] as Record<string, unknown>)['kind']).toBe('ack');
    // Both events were emitted
    expect(engine._eventBus.emit).toHaveBeenCalledTimes(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Pointer file written on start and removed on stop
// ═══════════════════════════════════════════════════════════════════════════════

describe('DaemonHookServer — pointer file management', () => {
  let socketPath: string;
  let stateDir: string;

  beforeEach(() => {
    socketPath = tempSocket('pointer-file');
    stateDir = tempDir('pointer-file-state');
  });

  afterEach(() => {
    cleanPath(socketPath);
    cleanDir(stateDir);
  });

  it('writes PID-keyed pointer file on start', async () => {
    const engine = createMockEngine();
    const server = new DaemonHookServer({ socketPath, stateDir, engine: asEngine(engine) });
    await server.start();
    const pointerFile = path.join(stateDir, `runtime-${process.pid}.socket`);
    expect(fs.existsSync(pointerFile)).toBe(true);
    expect(fs.readFileSync(pointerFile, 'utf-8').trim()).toBe(socketPath);
    await server.stop();
  });

  it('removes PID-keyed pointer file on stop', async () => {
    const engine = createMockEngine();
    const server = new DaemonHookServer({ socketPath, stateDir, engine: asEngine(engine) });
    await server.start();
    const pointerFile = path.join(stateDir, `runtime-${process.pid}.socket`);
    expect(fs.existsSync(pointerFile)).toBe(true);
    await server.stop();
    expect(fs.existsSync(pointerFile)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. DaemonHookServer.socketPath() helper
// ═══════════════════════════════════════════════════════════════════════════════

describe('DaemonHookServer.socketPath() static helper', () => {
  it('returns a path inside socketDir', () => {
    const dir = '/tmp/test-dir';
    const root = '/some/project';
    const result = DaemonHookServer.socketPath(dir, root);
    expect(result.startsWith(dir)).toBe(true);
  });

  it('includes pid in the socket name', () => {
    const result = DaemonHookServer.socketPath('/tmp', '/project');
    expect(result).toContain(String(process.pid));
  });

  it('produces different paths for different project roots', () => {
    const path1 = DaemonHookServer.socketPath('/tmp', '/project-a');
    const path2 = DaemonHookServer.socketPath('/tmp', '/project-b');
    expect(path1).not.toBe(path2);
  });

  it('produces same path for same project root and pid', () => {
    const path1 = DaemonHookServer.socketPath('/tmp', '/project');
    const path2 = DaemonHookServer.socketPath('/tmp', '/project');
    expect(path1).toBe(path2);
  });
});
