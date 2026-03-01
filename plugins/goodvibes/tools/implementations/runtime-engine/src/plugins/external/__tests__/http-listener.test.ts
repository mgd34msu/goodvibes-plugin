/**
 * HttpListener Tests
 *
 * Tests start/stop lifecycle, request handling (health check, webhook ingestion,
 * auth, payload size, JSON parsing, header forwarding, bind_mode), and accessors.
 *
 * Uses vitest with node:http for actual local server binding on a random port.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as http from 'node:http';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { HttpListener, DEFAULT_HTTP_LISTENER_CONFIG } from '../http-listener.js';
import type { HttpListenerConfig } from '../http-listener.js';

// ─── Mock node modules ────────────────────────────────────────────────────────

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build an HttpListenerConfig pointing to an ephemeral port so tests
 * don't conflict with each other or with real services.
 */
function makeConfig(overrides: Partial<HttpListenerConfig> = {}): HttpListenerConfig {
  return {
    ...DEFAULT_HTTP_LISTENER_CONFIG,
    port: 0, // OS assigns a free port
    ...overrides,
  };
}

/**
 * Create and start an HttpListener, returning both the listener and the
 * actual bound port (resolved from the underlying server address).
 */
async function startListener(
  overrides: Partial<HttpListenerConfig> = {},
  dropDir = '/tmp/test-drop',
): Promise<{ listener: HttpListener; port: number }> {
  const config = makeConfig(overrides);
  const listener = new HttpListener(dropDir, config);
  await listener.start();
  // After start(), the underlying http.Server has a bound address
  // We can read the actual port via a test-only approach: stop and use
  // server.address(). Since HttpListener doesn't expose server, we
  // track the real port by inspecting the server created.
  // Instead, for port:0 tests we use the config port (which stays 0),
  // so we make an internal request by resolving the address ourselves.
  // The simplest approach: re-expose via casting. Since we can't access
  // private fields, we test with a known port for request-level tests.
  return { listener, port: config.port };
}

/**
 * Make an HTTP request helper. Returns status + JSON body.
 */
function httpRequest(
  port: number,
  method: string,
  urlPath: string,
  options: {
    body?: string;
    headers?: Record<string, string>;
    host?: string;
  } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: options.host ?? '127.0.0.1',
        port,
        method,
        path: urlPath,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as Record<string, unknown>;
            resolve({ status: res.statusCode ?? 0, body });
          } catch {
            reject(new Error('Failed to parse response JSON'));
          }
        });
      },
    );
    req.on('error', reject);
    if (options.body !== undefined) {
      req.write(options.body);
    }
    req.end();
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('HttpListener', () => {
  let listener: HttpListener;

  afterEach(async () => {
    // Ensure server is always stopped to free OS resources
    if (listener && listener.isRunning()) {
      await listener.stop();
    }
    vi.clearAllMocks();
  });

  // ── Accessors ──────────────────────────────────────────────────────────────

  describe('accessors', () => {
    it('getPort() returns configured port', () => {
      const cfg = makeConfig({ port: 3847 });
      listener = new HttpListener('/tmp/drop', cfg);
      expect(listener.getPort()).toBe(3847);
    });

    it('isRunning() returns false before start', () => {
      listener = new HttpListener('/tmp/drop', makeConfig());
      expect(listener.isRunning()).toBe(false);
    });
  });

  // ── DEFAULT_HTTP_LISTENER_CONFIG ───────────────────────────────────────────

  describe('DEFAULT_HTTP_LISTENER_CONFIG', () => {
    it('exports sensible defaults', () => {
      expect(DEFAULT_HTTP_LISTENER_CONFIG.port).toBe(3847);
      expect(DEFAULT_HTTP_LISTENER_CONFIG.bind_mode).toBe('localhost');
      expect(DEFAULT_HTTP_LISTENER_CONFIG.address).toBe('127.0.0.1');
      expect(DEFAULT_HTTP_LISTENER_CONFIG.max_payload_bytes).toBe(1 * 1024 * 1024);
    });
  });

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  describe('lifecycle', () => {
    it('start() creates drop directory and resolves when listening', async () => {
      const mkdirMock = vi.mocked(fs.mkdir);
      listener = new HttpListener('/tmp/my-drop', makeConfig());
      await listener.start();
      expect(mkdirMock).toHaveBeenCalledWith('/tmp/my-drop', { recursive: true });
      expect(listener.isRunning()).toBe(true);
    });

    it('start() rejects when already running', async () => {
      listener = new HttpListener('/tmp/drop', makeConfig());
      await listener.start();
      await expect(listener.start()).rejects.toThrow('HttpListener is already running');
    });

    it('stop() resolves and marks server as not running', async () => {
      listener = new HttpListener('/tmp/drop', makeConfig());
      await listener.start();
      await listener.stop();
      expect(listener.isRunning()).toBe(false);
    });

    it('stop() is a no-op when not running', async () => {
      listener = new HttpListener('/tmp/drop', makeConfig());
      // Should not throw
      await expect(listener.stop()).resolves.toBeUndefined();
    });

    it('isRunning() returns true after start and false after stop', async () => {
      listener = new HttpListener('/tmp/drop', makeConfig());
      expect(listener.isRunning()).toBe(false);
      await listener.start();
      expect(listener.isRunning()).toBe(true);
      await listener.stop();
      expect(listener.isRunning()).toBe(false);
    });
  });

  // ── Request Handling ──────────────────────────────────────────────────────
  // These tests use a real bound server on a random port.
  // We need to read the actual port back from the server.

  describe('request handling', () => {
    let boundPort: number;

    /**
     * Starts a listener and resolves the actual bound port via the server's
     * address(). We temporarily expose it using the underlying http.Server.
     */
    async function startAndGetPort(
      overrides: Partial<HttpListenerConfig> = {},
      dropDir = '/tmp/test-drop',
    ): Promise<number> {
      const cfg = makeConfig(overrides);
      listener = new HttpListener(dropDir, cfg);

      // Patch the server creation to intercept the bound port
      let resolvePort!: (port: number) => void;
      const portPromise = new Promise<number>((r) => { resolvePort = r; });

      const originalCreateServer = http.createServer.bind(http);
      const createServerSpy = vi.spyOn(http, 'createServer').mockImplementationOnce(
        (handler: http.RequestListener) => {
          const srv = originalCreateServer(handler);
          // Listen for the 'listening' event to get the actual port
          srv.once('listening', () => {
            const addr = srv.address();
            if (addr && typeof addr === 'object') {
              resolvePort(addr.port);
            }
          });
          return srv;
        }
      );

      await listener.start();
      createServerSpy.mockRestore();
      boundPort = await portPromise;
      return boundPort;
    }

    afterEach(async () => {
      if (listener && listener.isRunning()) {
        await listener.stop();
      }
    });

    // ── Health Check ────────────────────────────────────────────────────────

    it('GET /health returns 200 with status ok', async () => {
      const port = await startAndGetPort();
      const { status, body } = await httpRequest(port, 'GET', '/health');
      expect(status).toBe(200);
      expect(body).toMatchObject({ status: 'ok', running: true });
    });

    // ── Not Found ──────────────────────────────────────────────────────────

    it('returns 404 for unknown routes', async () => {
      const port = await startAndGetPort();
      const { status, body } = await httpRequest(port, 'GET', '/unknown');
      expect(status).toBe(404);
      expect(body).toMatchObject({ error: 'Not Found' });
    });

    it('returns 404 for GET /webhook/:source (wrong method)', async () => {
      const port = await startAndGetPort();
      const { status } = await httpRequest(port, 'GET', '/webhook/github');
      expect(status).toBe(404);
    });

    // ── Webhook Ingestion ──────────────────────────────────────────────────

    it('POST /webhook/:source returns 202 and writes drop file', async () => {
      const writeFileMock = vi.mocked(fs.writeFile);
      const port = await startAndGetPort({}, '/tmp/drop-test');

      const payload = JSON.stringify({ event: 'push', repo: 'test' });
      const { status, body } = await httpRequest(port, 'POST', '/webhook/github', {
        body: payload,
      });

      expect(status).toBe(202);
      expect(body).toMatchObject({ accepted: true });
      expect(typeof body['id']).toBe('string');

      // Verify a drop file was written to the drop directory
      expect(writeFileMock).toHaveBeenCalledOnce();
      const [writtenPath, writtenContent] = writeFileMock.mock.calls[0] as [string, string, string];
      expect(writtenPath).toMatch(/^\/tmp\/drop-test\//u);
      const parsed = JSON.parse(writtenContent) as Record<string, unknown>;
      expect(parsed['source']).toBe('github');
      expect(parsed['payload']).toMatchObject({ event: 'push' });
      expect(typeof parsed['received_at']).toBe('string');
    });

    it('POST /webhook/:source forwards headers to drop file', async () => {
      const writeFileMock = vi.mocked(fs.writeFile);
      const port = await startAndGetPort();

      await httpRequest(port, 'POST', '/webhook/stripe', {
        body: JSON.stringify({ type: 'payment' }),
        headers: {
          'x-stripe-signature': 'sig123',
          'content-type': 'application/json',
        },
      });

      const [, writtenContent] = writeFileMock.mock.calls[0] as [string, string, string];
      const parsed = JSON.parse(writtenContent) as { headers: Record<string, string> };
      expect(parsed.headers['x-stripe-signature']).toBe('sig123');
    });

    it('POST /webhook/:source returns 400 for invalid JSON body', async () => {
      const port = await startAndGetPort();
      const { status, body } = await httpRequest(port, 'POST', '/webhook/github', {
        body: 'not-json',
      });
      expect(status).toBe(400);
      expect(body).toMatchObject({ error: 'Invalid JSON body' });
    });

    it('POST /webhook/:source returns 413 when body exceeds max_payload_bytes', async () => {
      const port = await startAndGetPort({ max_payload_bytes: 10 });
      const { status, body } = await httpRequest(port, 'POST', '/webhook/github', {
        body: JSON.stringify({ data: 'a'.repeat(100) }),
      });
      expect(status).toBe(413);
      expect(body).toMatchObject({ error: 'Payload Too Large' });
    });

    // ── Auth Token ──────────────────────────────────────────────────────────

    it('returns 401 when auth_token set and Authorization header is missing', async () => {
      const port = await startAndGetPort({ auth_token: 'secret' });
      const { status, body } = await httpRequest(port, 'POST', '/webhook/github', {
        body: JSON.stringify({ event: 'push' }),
      });
      expect(status).toBe(401);
      expect(body).toMatchObject({ error: 'Unauthorized' });
    });

    it('returns 401 when auth_token set and Authorization header is wrong', async () => {
      const port = await startAndGetPort({ auth_token: 'secret' });
      const { status } = await httpRequest(port, 'POST', '/webhook/github', {
        body: JSON.stringify({ event: 'push' }),
        headers: { authorization: 'Bearer wrong' },
      });
      expect(status).toBe(401);
    });

    it('returns 202 when auth_token set and Authorization header matches', async () => {
      const port = await startAndGetPort({ auth_token: 'mysecret' });
      const { status } = await httpRequest(port, 'POST', '/webhook/github', {
        body: JSON.stringify({ event: 'push' }),
        headers: { authorization: 'Bearer mysecret' },
      });
      expect(status).toBe(202);
    });

    it('does not require auth when auth_token is not configured', async () => {
      const port = await startAndGetPort();
      const { status } = await httpRequest(port, 'POST', '/webhook/github', {
        body: JSON.stringify({ event: 'push' }),
      });
      expect(status).toBe(202);
    });

    // ── Webhook Source Pattern ───────────────────────────────────────────────

    it('accepts source names with alphanumeric, underscore, and hyphen characters', async () => {
      const port = await startAndGetPort();
      const { status } = await httpRequest(port, 'POST', '/webhook/my_source-123', {
        body: JSON.stringify({ data: true }),
      });
      expect(status).toBe(202);
    });

    it('rejects webhook paths with spaces or special chars as 404', async () => {
      const port = await startAndGetPort();
      // Source with invalid chars — URL path won't match the regex, falls to 404
      const { status } = await httpRequest(port, 'POST', '/webhook/bad%20source', {
        body: JSON.stringify({}),
      });
      // %20 is decoded by Node, resulting in a space, which doesn't match [a-zA-Z0-9_-]+
      expect(status).toBe(404);
    });
  });

  // ── bind_mode ─────────────────────────────────────────────────────────────

  describe('bind_mode', () => {
    it('uses 127.0.0.1 for localhost bind_mode', async () => {
      // We verify that start() resolves without error for localhost mode (default)
      listener = new HttpListener('/tmp/drop', makeConfig({ bind_mode: 'localhost' }));
      await listener.start();
      expect(listener.isRunning()).toBe(true);
    });

    it('uses custom address for other bind_mode', async () => {
      // We only verify that the config is accepted; binding to 0.0.0.0 may fail in CI
      // so we use '127.0.0.1' as the address when bind_mode is 'other'
      listener = new HttpListener(
        '/tmp/drop',
        makeConfig({ bind_mode: 'other', address: '127.0.0.1' }),
      );
      await listener.start();
      expect(listener.isRunning()).toBe(true);
    });
  });
});
