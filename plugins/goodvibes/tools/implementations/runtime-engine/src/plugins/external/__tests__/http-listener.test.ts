/**
 * HttpListener Tests
 *
 * Tests start/stop lifecycle, request handling (health check, webhook ingestion,
 * auth, payload size, JSON parsing, header forwarding), and accessors.
 *
 * Uses vitest with real HTTP server on ephemeral ports (find free port via net).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as net from 'node:net';
import * as http from 'node:http';
import * as fs from 'node:fs/promises';
import { HttpListener, DEFAULT_HTTP_LISTENER_CONFIG } from '../http-listener.js';
import type { HttpListenerConfig } from '../http-listener.js';

// ─── Mock node:fs/promises ────────────────────────────────────────────────────

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

// ─── Port allocation ─────────────────────────────────────────────────────────

/**
 * Find a free ephemeral TCP port by briefly binding to port 0.
 */
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      srv.close(() => {
        if (addr && typeof addr === 'object') {
          resolve(addr.port);
        } else {
          reject(new Error('Failed to get port'));
        }
      });
    });
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<HttpListenerConfig> = {}): HttpListenerConfig {
  return {
    ...DEFAULT_HTTP_LISTENER_CONFIG,
    ...overrides,
  };
}

/**
 * Make an HTTP request. Returns status + JSON body.
 */
function httpRequest(
  port: number,
  method: string,
  urlPath: string,
  options: {
    body?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
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
      listener = new HttpListener('/tmp/drop', makeConfig({ port: 0 }));
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
      const port = await getFreePort();
      listener = new HttpListener('/tmp/my-drop', makeConfig({ port }));
      await listener.start();
      expect(mkdirMock).toHaveBeenCalledWith('/tmp/my-drop', { recursive: true });
      expect(listener.isRunning()).toBe(true);
    });

    it('start() rejects when already running', async () => {
      const port = await getFreePort();
      listener = new HttpListener('/tmp/drop', makeConfig({ port }));
      await listener.start();
      await expect(listener.start()).rejects.toThrow('HttpListener is already running');
    });

    it('stop() resolves and marks server as not running', async () => {
      const port = await getFreePort();
      listener = new HttpListener('/tmp/drop', makeConfig({ port }));
      await listener.start();
      await listener.stop();
      expect(listener.isRunning()).toBe(false);
    });

    it('stop() is a no-op when not running', async () => {
      listener = new HttpListener('/tmp/drop', makeConfig({ port: 0 }));
      await expect(listener.stop()).resolves.toBeUndefined();
    });

    it('isRunning() returns true after start and false after stop', async () => {
      const port = await getFreePort();
      listener = new HttpListener('/tmp/drop', makeConfig({ port }));
      expect(listener.isRunning()).toBe(false);
      await listener.start();
      expect(listener.isRunning()).toBe(true);
      await listener.stop();
      expect(listener.isRunning()).toBe(false);
    });
  });

  // ── Request Handling ──────────────────────────────────────────────────────

  describe('request handling', () => {
    let testPort: number;

    beforeEach(async () => {
      testPort = await getFreePort();
      vi.clearAllMocks();
    });

    afterEach(async () => {
      if (listener && listener.isRunning()) {
        await listener.stop();
      }
    });

    // ── Health Check ────────────────────────────────────────────────────────

    it('GET /health returns 200 with status ok', async () => {
      listener = new HttpListener('/tmp/test-drop', makeConfig({ port: testPort }));
      await listener.start();

      const { status, body } = await httpRequest(testPort, 'GET', '/health');
      expect(status).toBe(200);
      expect(body).toMatchObject({ status: 'ok', running: true });
    });

    // ── Not Found ──────────────────────────────────────────────────────────

    it('returns 404 for unknown routes', async () => {
      listener = new HttpListener('/tmp/test-drop', makeConfig({ port: testPort }));
      await listener.start();

      const { status, body } = await httpRequest(testPort, 'GET', '/unknown');
      expect(status).toBe(404);
      expect(body).toMatchObject({ error: 'Not Found' });
    });

    it('returns 404 for GET /webhook/:source (wrong method, matches pattern but not POST)', async () => {
      listener = new HttpListener('/tmp/test-drop', makeConfig({ port: testPort }));
      await listener.start();

      const { status } = await httpRequest(testPort, 'GET', '/webhook/github');
      expect(status).toBe(404);
    });

    // ── Webhook Ingestion ──────────────────────────────────────────────────

    it('POST /webhook/:source returns 202 and writes drop file', async () => {
      const writeFileMock = vi.mocked(fs.writeFile);
      const dropDir = '/tmp/drop-test';
      listener = new HttpListener(dropDir, makeConfig({ port: testPort }));
      await listener.start();

      const payload = JSON.stringify({ event: 'push', repo: 'test' });
      const { status, body } = await httpRequest(testPort, 'POST', '/webhook/github', {
        body: payload,
      });

      expect(status).toBe(202);
      expect(body).toMatchObject({ accepted: true });
      expect(typeof body['id']).toBe('string');

      expect(writeFileMock).toHaveBeenCalledOnce();
      const [writtenPath, writtenContent] = writeFileMock.mock.calls[0] as [string, string, string];
      expect(writtenPath).toMatch(/^\/tmp\/drop-test\//u);
      const parsed = JSON.parse(writtenContent) as Record<string, unknown>;
      expect(parsed['source']).toBe('github');
      expect(parsed['payload']).toMatchObject({ event: 'push' });
      expect(typeof parsed['received_at']).toBe('string');
    });

    it('POST /webhook/:source forwards string headers to drop file', async () => {
      const writeFileMock = vi.mocked(fs.writeFile);
      listener = new HttpListener('/tmp/test-drop', makeConfig({ port: testPort }));
      await listener.start();

      await httpRequest(testPort, 'POST', '/webhook/stripe', {
        body: JSON.stringify({ type: 'payment' }),
        headers: { 'x-stripe-signature': 'sig123' },
      });

      expect(writeFileMock).toHaveBeenCalledOnce();
      const [, writtenContent] = writeFileMock.mock.calls[0] as [string, string, string];
      const parsed = JSON.parse(writtenContent) as { headers: Record<string, string> };
      expect(parsed.headers['x-stripe-signature']).toBe('sig123');
    });

    it('POST /webhook/:source returns 400 for invalid JSON body', async () => {
      listener = new HttpListener('/tmp/test-drop', makeConfig({ port: testPort }));
      await listener.start();

      const { status, body } = await httpRequest(testPort, 'POST', '/webhook/github', {
        body: 'not-json',
      });
      expect(status).toBe(400);
      expect(body).toMatchObject({ error: 'Invalid JSON body' });
    });

    it('POST /webhook/:source returns 413 when body exceeds max_payload_bytes', async () => {
      listener = new HttpListener(
        '/tmp/test-drop',
        makeConfig({ port: testPort, max_payload_bytes: 10 }),
      );
      await listener.start();

      const { status, body } = await httpRequest(testPort, 'POST', '/webhook/github', {
        body: JSON.stringify({ data: 'a'.repeat(100) }),
      });
      expect(status).toBe(413);
      expect(body).toMatchObject({ error: 'Payload Too Large' });
    });

    // ── Auth Token ──────────────────────────────────────────────────────────

    it('returns 401 when auth_token set and Authorization header is missing', async () => {
      listener = new HttpListener(
        '/tmp/test-drop',
        makeConfig({ port: testPort, auth_token: 'secret' }),
      );
      await listener.start();

      const { status, body } = await httpRequest(testPort, 'POST', '/webhook/github', {
        body: JSON.stringify({ event: 'push' }),
      });
      expect(status).toBe(401);
      expect(body).toMatchObject({ error: 'Unauthorized' });
    });

    it('returns 401 when auth_token set and Authorization header is wrong', async () => {
      listener = new HttpListener(
        '/tmp/test-drop',
        makeConfig({ port: testPort, auth_token: 'secret' }),
      );
      await listener.start();

      const { status } = await httpRequest(testPort, 'POST', '/webhook/github', {
        body: JSON.stringify({ event: 'push' }),
        headers: { authorization: 'Bearer wrong' },
      });
      expect(status).toBe(401);
    });

    it('returns 202 when auth_token set and Authorization header matches', async () => {
      listener = new HttpListener(
        '/tmp/test-drop',
        makeConfig({ port: testPort, auth_token: 'mysecret' }),
      );
      await listener.start();

      const { status } = await httpRequest(testPort, 'POST', '/webhook/github', {
        body: JSON.stringify({ event: 'push' }),
        headers: { authorization: 'Bearer mysecret' },
      });
      expect(status).toBe(202);
    });

    it('does not require auth when auth_token is not configured', async () => {
      listener = new HttpListener('/tmp/test-drop', makeConfig({ port: testPort }));
      await listener.start();

      const { status } = await httpRequest(testPort, 'POST', '/webhook/github', {
        body: JSON.stringify({ event: 'push' }),
      });
      expect(status).toBe(202);
    });

    // ── Webhook source pattern ───────────────────────────────────────────────

    it('accepts source names with alphanumeric, underscore, and hyphen characters', async () => {
      listener = new HttpListener('/tmp/test-drop', makeConfig({ port: testPort }));
      await listener.start();

      const { status } = await httpRequest(testPort, 'POST', '/webhook/my_source-123', {
        body: JSON.stringify({ data: true }),
      });
      expect(status).toBe(202);
    });

    it('includes source name from URL in drop file', async () => {
      const writeFileMock = vi.mocked(fs.writeFile);
      listener = new HttpListener('/tmp/test-drop', makeConfig({ port: testPort }));
      await listener.start();

      await httpRequest(testPort, 'POST', '/webhook/stripe', {
        body: JSON.stringify({ amount: 100 }),
      });

      const [, writtenContent] = writeFileMock.mock.calls[0] as [string, string, string];
      const parsed = JSON.parse(writtenContent) as { source: string };
      expect(parsed.source).toBe('stripe');
    });
  });

  // ── bind_mode ─────────────────────────────────────────────────────────────

  describe('bind_mode', () => {
    it('uses 127.0.0.1 for localhost bind_mode', async () => {
      const port = await getFreePort();
      listener = new HttpListener('/tmp/drop', makeConfig({ bind_mode: 'localhost', port }));
      await listener.start();
      expect(listener.isRunning()).toBe(true);
    });

    it('uses custom address for other bind_mode when address is 127.0.0.1', async () => {
      const port = await getFreePort();
      listener = new HttpListener(
        '/tmp/drop',
        makeConfig({ bind_mode: 'other', address: '127.0.0.1', port }),
      );
      await listener.start();
      expect(listener.isRunning()).toBe(true);
    });
  });
});
