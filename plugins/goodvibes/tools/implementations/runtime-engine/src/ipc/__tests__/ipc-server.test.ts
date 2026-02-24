/**
 * Unit / integration tests for IPCServer.
 *
 * Uses real Unix domain sockets in a tmp directory so that the full
 * listen → connect → send → respond → close cycle is exercised without
 * mocking net internals.
 *
 * Idle-timeout behaviour is validated with vi.useFakeTimers() to avoid
 * waiting 5 real seconds in CI.
 */

import * as net from 'net';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IPCServer } from '../ipc-server.js';
import type { IPCMessage, IPCResponse } from '../protocol.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Create a unique socket path inside the OS temp directory. */
function tmpSocketPath(suffix = ''): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-ipc-test-'));
  return path.join(dir, `runtime${suffix}.sock`);
}

/**
 * Connect a raw TCP client to a Unix socket, send a raw string, and collect
 * all data received until the socket closes. Resolves with the accumulated
 * string.
 */
function sendRaw(socketPath: string, payload: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(socketPath);
    let received = '';

    client.setEncoding('utf-8');
    client.on('data', (chunk) => { received += chunk; });
    client.on('end', () => resolve(received));
    client.on('error', reject);

    client.on('connect', () => {
      client.write(payload);
    });
  });
}

/**
 * Send a well-formed IPC message and return the parsed IPCResponse.
 */
async function sendMessage(socketPath: string, msg: IPCMessage): Promise<IPCResponse> {
  const raw = await sendRaw(socketPath, JSON.stringify(msg) + '\n');
  return JSON.parse(raw.trim()) as IPCResponse;
}

/** Minimal valid heartbeat message for convenience. */
function heartbeat(id = 'hb-1'): IPCMessage {
  return { type: 'heartbeat', id };
}

/** Minimal valid hook_event message for convenience. */
function hookEvent(id = 'he-1'): IPCMessage {
  return {
    type: 'hook_event',
    id,
    hook_name: 'pre_tool_use',
    hook_input: { tool: 'bash' },
    timestamp: new Date().toISOString(),
  };
}

// ─── Lifecycle: constructor + getSocketPath ───────────────────────────────────

describe('IPCServer — constructor', () => {
  it('stores the socket path and returns it via getSocketPath()', () => {
    const sockPath = '/tmp/test.sock';
    const server = new IPCServer(sockPath);
    expect(server.getSocketPath()).toBe(sockPath);
  });

  it('starts with zero client connections', () => {
    const server = new IPCServer('/tmp/test.sock');
    expect(server.clientCount).toBe(0);
  });
});

// ─── listen() ─────────────────────────────────────────────────────────────────

describe('IPCServer — listen()', () => {
  let server: IPCServer;
  let sockPath: string;

  beforeEach(() => {
    sockPath = tmpSocketPath();
    server = new IPCServer(sockPath);
  });

  afterEach(async () => {
    await server.close();
  });

  it('creates the socket file on the filesystem', async () => {
    await server.listen();
    expect(fs.existsSync(sockPath)).toBe(true);
  });

  it('sets socket file permissions to 0o600', async () => {
    await server.listen();
    const stat = fs.statSync(sockPath);
    // On Linux the stat mode includes file type bits; mask to permission bits only
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('creates the parent directory if it does not exist', async () => {
    const nestedDir = path.join(os.tmpdir(), `gv-nested-${Date.now()}`, 'sub');
    const nestedSock = path.join(nestedDir, 'runtime.sock');
    const nestedServer = new IPCServer(nestedSock);
    await nestedServer.listen();
    expect(fs.existsSync(nestedSock)).toBe(true);
    await nestedServer.close();
  });

  it('removes a stale socket file before binding', async () => {
    // Write a fake stale socket file at the same path
    fs.writeFileSync(sockPath, 'stale');
    expect(fs.existsSync(sockPath)).toBe(true);

    // listen() must remove the stale file and bind successfully
    await expect(server.listen()).resolves.toBeUndefined();
    expect(fs.existsSync(sockPath)).toBe(true); // the real socket now exists
  });

  it('resolves without error on successful bind', async () => {
    await expect(server.listen()).resolves.toBeUndefined();
  });

  it('accepts incoming connections after listen()', async () => {
    server.onMessage(async (msg) => ({
      id: msg.id,
      status: 'ok',
      data: { kind: 'ack' },
    }));
    await server.listen();

    const response = await sendMessage(sockPath, heartbeat());
    expect(response.status).toBe('ok');
  });
});

// ─── close() ─────────────────────────────────────────────────────────────────

describe('IPCServer — close()', () => {
  it('resolves immediately when the server has not been started', async () => {
    const server = new IPCServer(tmpSocketPath());
    await expect(server.close()).resolves.toBeUndefined();
  });

  it('removes the socket file after closing', async () => {
    const sockPath = tmpSocketPath();
    const server = new IPCServer(sockPath);
    await server.listen();
    expect(fs.existsSync(sockPath)).toBe(true);

    await server.close();
    expect(fs.existsSync(sockPath)).toBe(false);
  });

  it('resolves when called a second time (idempotent)', async () => {
    const sockPath = tmpSocketPath();
    const server = new IPCServer(sockPath);
    await server.listen();
    await server.close();
    await expect(server.close()).resolves.toBeUndefined();
  });
});

// ─── clientCount ─────────────────────────────────────────────────────────────

describe('IPCServer — clientCount', () => {
  let server: IPCServer;
  let sockPath: string;

  beforeEach(async () => {
    sockPath = tmpSocketPath();
    server = new IPCServer(sockPath);
    // Handler that pauses briefly before responding so we can observe clientCount
    server.onMessage(async (msg) => {
      await new Promise((r) => setTimeout(r, 20));
      return { id: msg.id, status: 'ok', data: { kind: 'ack' } };
    });
    await server.listen();
  });

  afterEach(async () => {
    await server.close();
  });

  it('increments while a connection is active and decrements after close', async () => {
    // Kick off two concurrent requests
    const p1 = sendMessage(sockPath, heartbeat('hb-a'));
    const p2 = sendMessage(sockPath, heartbeat('hb-b'));

    // Poll until at least one connection is registered (up to 500ms)
    const deadline = Date.now() + 500;
    while (server.clientCount < 1 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(server.clientCount).toBeGreaterThanOrEqual(1);

    await Promise.all([p1, p2]);
    // Poll until all connections are cleaned up (up to 500ms)
    const deadline2 = Date.now() + 500;
    while (server.clientCount > 0 && Date.now() < deadline2) {
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(server.clientCount).toBe(0);
  });
});

// ─── Connection: Buffer accumulation ─────────────────────────────────────────

describe('IPCServer — connection data buffering', () => {
  let server: IPCServer;
  let sockPath: string;

  beforeEach(async () => {
    sockPath = tmpSocketPath();
    server = new IPCServer(sockPath);
    server.onMessage(async (msg) => ({
      id: msg.id,
      status: 'ok',
      data: { kind: 'ack' },
    }));
    await server.listen();
  });

  afterEach(async () => {
    await server.close();
  });

  it('accumulates multi-chunk data and processes the message on newline', async () => {
    // Split a valid message across two writes to simulate chunked delivery
    const msg = heartbeat('hb-chunk');
    const json = JSON.stringify(msg);
    const half1 = json.slice(0, Math.floor(json.length / 2));
    const half2 = json.slice(Math.floor(json.length / 2)) + '\n';

    const response = await new Promise<IPCResponse>((resolve, reject) => {
      const client = net.createConnection(sockPath);
      let received = '';

      client.setEncoding('utf-8');
      client.on('data', (chunk) => { received += chunk; });
      client.on('end', () => {
        try {
          resolve(JSON.parse(received.trim()) as IPCResponse);
        } catch (e) {
          reject(e);
        }
      });
      client.on('error', reject);

      client.on('connect', () => {
        // Write in two separate chunks
        client.write(half1, () => {
          client.write(half2);
        });
      });
    });

    expect(response.status).toBe('ok');
    expect(response.id).toBe('hb-chunk');
  });
});

// ─── Connection: MAX_MESSAGE_SIZE guard ───────────────────────────────────────

describe('IPCServer — MAX_MESSAGE_SIZE guard', () => {
  let server: IPCServer;
  let sockPath: string;

  beforeEach(async () => {
    sockPath = tmpSocketPath();
    server = new IPCServer(sockPath);
    server.onMessage(async (msg) => ({
      id: msg.id,
      status: 'ok',
      data: { kind: 'ack' },
    }));
    await server.listen();
  });

  afterEach(async () => {
    await server.close();
  });

  it('destroys the socket when the message exceeds 1 MB', async () => {
    // Send >1 MB of data without a newline so no message is processed
    const oversizedPayload = 'x'.repeat(1_048_577); // 1 MB + 1 byte

    const result = await new Promise<'destroyed' | 'data'>((resolve) => {
      const client = net.createConnection(sockPath);

      client.on('data', () => resolve('data'));
      client.on('close', () => resolve('destroyed'));
      client.on('error', () => resolve('destroyed'));

      client.on('connect', () => {
        client.write(oversizedPayload);
      });
    });

    // The server should have destroyed the socket — no data received
    expect(result).toBe('destroyed');

    // Verify the server remains operational after rejecting the oversized connection
    const healthResponse = await sendMessage(sockPath, heartbeat('hb-health'));
    expect(healthResponse.status).toBe('ok');
    expect(healthResponse.id).toBe('hb-health');
  });
});

// ─── Connection: idle timeout ─────────────────────────────────────────────────

describe('IPCServer — idle timeout', () => {
  it('destroys idle connections after CONNECTION_TIMEOUT_MS', async () => {
    // Only fake timer functions — leave I/O primitives (Promise, queueMicrotask) real
    // so that net.createConnection can establish before we advance fake time.
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'] });
    const sockPath = tmpSocketPath();
    const server = new IPCServer(sockPath);
    server.onMessage(async (msg) => ({
      id: msg.id,
      status: 'ok',
      data: { kind: 'ack' },
    }));
    await server.listen();

    // Connect but do not send any data — the server should time out
    let clientConnected = false;
    const closedP = new Promise<void>((resolve) => {
      const client = net.createConnection(sockPath);
      client.on('connect', () => { clientConnected = true; });
      client.on('close', () => resolve());
      client.on('error', () => resolve()); // destroyed triggers error then close
    });

    // Wait for the client connection to be established using real I/O
    const connectDeadline = Date.now() + 2000;
    while (!clientConnected && Date.now() < connectDeadline) {
      // Yield to the event loop so the connect event can fire
      await new Promise<void>((r) => setImmediate(r));
    }

    // Advance fake time past the 5-second idle timeout
    await vi.advanceTimersByTimeAsync(5_001);

    await closedP;
    await server.close();
    vi.useRealTimers();
  });
});

// ─── Message handling: invalid JSON ───────────────────────────────────────────

describe('IPCServer — message handling', () => {
  let server: IPCServer;
  let sockPath: string;

  beforeEach(async () => {
    sockPath = tmpSocketPath();
    server = new IPCServer(sockPath);
  });

  afterEach(async () => {
    await server.close();
  });

  it('returns error response for invalid JSON', async () => {
    await server.listen();
    const raw = await sendRaw(sockPath, 'this is not json\n');
    const response = JSON.parse(raw.trim()) as IPCResponse;

    expect(response.status).toBe('error');
    expect(response.id).toBe('unknown');
    expect(response.error).toMatch(/invalid json/i);
  });

  it('returns error response for JSON that fails schema validation', async () => {
    await server.listen();
    // Valid JSON but missing required fields
    const raw = await sendRaw(sockPath, JSON.stringify({ type: 'unknown_type', id: 'x' }) + '\n');
    const response = JSON.parse(raw.trim()) as IPCResponse;

    expect(response.status).toBe('error');
    expect(response.error).toMatch(/invalid message schema/i);
  });

  it('returns error response when no handler is registered', async () => {
    // Do NOT call onMessage — server has no handler
    await server.listen();
    const raw = await sendRaw(sockPath, JSON.stringify(heartbeat('hb-nohandler')) + '\n');
    const response = JSON.parse(raw.trim()) as IPCResponse;

    expect(response.status).toBe('error');
    expect(response.id).toBe('hb-nohandler');
    expect(response.error).toMatch(/no handler registered/i);
  });

  it('invokes the handler with the parsed message', async () => {
    const handler = vi.fn().mockResolvedValue({
      id: 'he-1',
      status: 'ok',
      data: { kind: 'ack' },
    });
    server.onMessage(handler);
    await server.listen();

    await sendMessage(sockPath, hookEvent('he-1'));

    expect(handler).toHaveBeenCalledOnce();
    const calledWith = handler.mock.calls[0][0] as IPCMessage;
    expect(calledWith.type).toBe('hook_event');
    expect(calledWith.id).toBe('he-1');
  });

  it('returns the handler response to the client', async () => {
    server.onMessage(async (msg) => ({
      id: msg.id,
      status: 'ok',
      data: { kind: 'ack' },
    }));
    await server.listen();

    const response = await sendMessage(sockPath, heartbeat('hb-response'));
    expect(response.status).toBe('ok');
    expect(response.id).toBe('hb-response');
    expect(response.data?.kind).toBe('ack');
  });

  it('returns error response when the handler throws', async () => {
    server.onMessage(async (_msg) => {
      throw new Error('handler exploded');
    });
    await server.listen();

    const response = await sendMessage(sockPath, heartbeat('hb-throw'));
    expect(response.status).toBe('error');
    expect(response.id).toBe('hb-throw');
    expect(response.error).toMatch(/handler exploded/i);
  });

  it('validates the schema id from a partially-valid message', async () => {
    await server.listen();
    // Object with valid type but empty id — schema validation should fail
    const bad = JSON.stringify({ type: 'heartbeat', id: '' }) + '\n';
    const raw = await sendRaw(sockPath, bad);
    const response = JSON.parse(raw.trim()) as IPCResponse;

    expect(response.status).toBe('error');
    expect(response.error).toMatch(/invalid message schema/i);
  });
});

// ─── Response format ─────────────────────────────────────────────────────────

describe('IPCServer — response format', () => {
  let server: IPCServer;
  let sockPath: string;

  beforeEach(async () => {
    sockPath = tmpSocketPath();
    server = new IPCServer(sockPath);
    server.onMessage(async (msg) => ({
      id: msg.id,
      status: 'ok',
      data: { kind: 'ack' },
    }));
    await server.listen();
  });

  afterEach(async () => {
    await server.close();
  });

  it('sends the response as JSON terminated with a newline', async () => {
    const raw = await sendRaw(sockPath, JSON.stringify(heartbeat('hb-fmt')) + '\n');
    expect(raw.endsWith('\n')).toBe(true);
    // Everything before the trailing newline must be valid JSON
    const parsed = JSON.parse(raw.trim());
    expect(parsed).toHaveProperty('id', 'hb-fmt');
    expect(parsed).toHaveProperty('status', 'ok');
  });

  it('closes the socket after sending the response (one message per connection)', async () => {
    // sendRaw waits for 'end' — if the server never calls socket.end, this would hang
    const raw = await sendRaw(sockPath, JSON.stringify(heartbeat('hb-close')) + '\n');
    expect(raw).toContain('hb-close');
  });
});

// ─── onMessage handler replacement ───────────────────────────────────────────

describe('IPCServer — onMessage handler replacement', () => {
  it('replaces the handler when onMessage is called a second time', async () => {
    const sockPath = tmpSocketPath();
    const server = new IPCServer(sockPath);

    const handler1 = vi.fn().mockResolvedValue({
      id: 'x',
      status: 'ok',
      data: { kind: 'ack' },
    });
    const handler2 = vi.fn().mockResolvedValue({
      id: 'x',
      status: 'ok',
      data: { kind: 'ack' },
    });

    server.onMessage(handler1);
    server.onMessage(handler2); // replaces handler1
    await server.listen();

    await sendMessage(sockPath, heartbeat('x'));

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalledOnce();
    await server.close();
  });
});
