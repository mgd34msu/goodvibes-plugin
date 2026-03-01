/**
 * HttpListener — External Events Plugin (Layer 3)
 *
 * Optional lightweight HTTP server for receiving webhooks.
 * Uses Node.js built-in `http` module only — no Express or external deps.
 *
 * Received payloads are written as JSON files to the file drop directory.
 * The FileWatcher picks them up on the next tick, keeping the pipeline unified.
 *
 * Routes:
 *   POST /webhook/:source  — Receive webhook payload for a named source
 *   GET  /health           — Health check
 *
 * Security:
 *   - Binds to 127.0.0.1 by default (localhost only)
 *   - Optional bearer token auth (Authorization: Bearer <token>)
 *   - Enforces max payload size
 */

import * as http from 'node:http';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { createLogger } from '../../shared/logger.js';
import { DEFAULT_HTTP_LISTENER_PORT } from '../../shared/constants.js';
import { ConfigError } from '../../shared/errors.js';
import { safeJsonParse } from '../../shared/utils.js';
import { readStreamBody } from '../../core/state/stream-reader.js';

const logger = createLogger('http-listener');

// ─── Configuration ────────────────────────────────────────────────────────────

export interface HttpListenerConfig {
  /** Port to listen on. Default: 3847 */
  port: number;
  /** Bind strategy: localhost (127.0.0.1), local_network (0.0.0.0), or other (custom address). */
  bind_mode: 'localhost' | 'local_network' | 'other';
  /** Resolved bind address. Set automatically for localhost/local_network; user-provided for 'other'. */
  address: string;
  /** Optional bearer token. If set, all requests must include it. */
  auth_token?: string;
  /** Maximum accepted request body size in bytes. Default: 1MB */
  max_payload_bytes: number;
}

export const DEFAULT_HTTP_LISTENER_CONFIG: HttpListenerConfig = {
  port: DEFAULT_HTTP_LISTENER_PORT,
  bind_mode: 'localhost',
  address: '127.0.0.1',
  max_payload_bytes: 1 * 1024 * 1024, // 1MB
};

// ─── Response Helpers ──────────────────────────────────────────────────────────

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

// ─── HttpListener Class ──────────────────────────────────────────────────────────────

export class HttpListener {
  private server: http.Server | null = null;
  private running = false;

  constructor(
    /** Directory where received webhook files are written (picked up by FileWatcher). */
    private readonly dropDir: string,
    private readonly config: HttpListenerConfig,
  ) {}

  /**
   * Start the HTTP server.
   * Resolves when the server is listening.
   * Rejects if the server is already running or fails to bind.
   */
  async start(): Promise<void> {
    if (this.running) {
      throw new ConfigError('HttpListener is already running');
    }

    // Ensure drop directory exists
    await fs.mkdir(this.dropDir, { recursive: true });

    return new Promise<void>((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res).catch(() => {
          // Catch unhandled errors to prevent server crash
          try {
            sendJson(res, 500, { error: 'Internal server error' });
          } catch (innerErr) {
            logger.debug('Failed to send 500 response after request handler error', { error: innerErr });
          }
        });
      });

      // Pre-listen: reject the start promise on bind/startup error.
      // Post-listen: switch to a persistent error handler for runtime errors.
      this.server.once('error', reject);

      const server = this.server;
      const bindAddress =
        this.config.bind_mode === 'localhost'
          ? '127.0.0.1'
          : this.config.bind_mode === 'local_network'
            ? '0.0.0.0'
            : this.config.address;
      server.listen(this.config.port, bindAddress, () => {
        server.removeListener('error', reject);
        server.on('error', (err) => {
          // Log post-start server errors (e.g. ECONNRESET, keep-alive teardown).
          logger.error('Server error', { error: err });
        });
        this.running = true;
        resolve();
      });
    });
  }

  /**
   * Stop the HTTP server gracefully.
   * Resolves when all connections are closed.
   */
  async stop(): Promise<void> {
    if (!this.running || this.server === null) {
      return;
    }

    const server = this.server;
    return new Promise<void>((resolve, reject) => {
      server.close((err) => {
        this.running = false;
        this.server = null;
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /** Returns true if the server is currently listening. */
  isRunning(): boolean {
    return this.running;
  }

  /** Returns the configured port number. */
  getPort(): number {
    return this.config.port;
  }

  // ─── Request Handler ──────────────────────────────────────────────────────

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const url = req.url ?? '/';
    const method = req.method?.toUpperCase() ?? 'GET';

    // ─── Health Check ───────────────────────────────────────────────────
    if (url === '/health' && method === 'GET') {
      sendJson(res, 200, { status: 'ok', running: this.running });
      return;
    }

    // ─── Webhook Ingestion ──────────────────────────────────────────────
    const webhookMatch = /^\/webhook\/([a-zA-Z0-9_-]+)(?:\/.*)?$/.exec(url);
    if (webhookMatch !== null && method === 'POST') {
      const source = webhookMatch[1];

      // Validate auth token if configured
      if (this.config.auth_token !== undefined) {
        const authHeader = req.headers['authorization'] ?? '';
        const expectedBearer = `Bearer ${this.config.auth_token}`;
        // Hash both values before comparing to avoid leaking token length
        // via the length check that timingSafeEqual would otherwise require.
        const hash = (buf: Buffer): Buffer =>
          crypto.createHash('sha256').update(buf).digest();
        const isValid = crypto.timingSafeEqual(
          hash(Buffer.from(authHeader)),
          hash(Buffer.from(expectedBearer)),
        );
        if (!isValid) {
          sendJson(res, 401, { error: 'Unauthorized' });
          return;
        }
      }

      // Read request body with size enforcement
      const body = await this.readBody(req);
      if (body === null) {
        sendJson(res, 413, { error: 'Payload Too Large' });
        return;
      }

      // Attempt JSON parse
      const parsedPayload = safeJsonParse<unknown>(body, undefined);
      if (parsedPayload === undefined) {
        logger.debug('Failed to parse JSON body');
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }

      // Extract headers relevant to normalization (lowercase keys)
      const forwardedHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') {
          forwardedHeaders[key.toLowerCase()] = value;
        } else if (Array.isArray(value)) {
          forwardedHeaders[key.toLowerCase()] = value.join(', ');
        }
      }

      // Write to drop directory as a structured JSON file
      const fileId = crypto.randomUUID();
      const filename = `${Date.now()}_${source}_${fileId}.json`;
      const filepath = path.join(this.dropDir, filename);

      const dropPayload = {
        source,
        payload: parsedPayload,
        headers: forwardedHeaders,
        received_at: new Date().toISOString(),
      };

      await fs.writeFile(filepath, JSON.stringify(dropPayload, null, 2), 'utf-8');

      sendJson(res, 202, { accepted: true, id: fileId });
      return;
    }

    // ─── Not Found ───────────────────────────────────────────────────────────────
    sendJson(res, 404, { error: 'Not Found' });
  }

  /**
   * Read the full request body up to max_payload_bytes.
   * Returns null if the limit is exceeded.
   */
  private readBody(req: http.IncomingMessage): Promise<string | null> {
    return readStreamBody(req, this.config.max_payload_bytes);
  }
}
