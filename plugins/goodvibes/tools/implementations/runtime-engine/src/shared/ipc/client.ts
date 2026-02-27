/**
 * RuntimeClient
 *
 * Thin IPC client used by hook scripts to communicate with the runtime engine
 * over a Unix domain socket. Designed for minimal latency and graceful
 * degradation: if the runtime engine is not reachable, all methods return
 * null rather than throwing, so hooks continue to work without the engine.
 *
 * Connection protocol:
 * - One connection per request (no persistent connection)
 * - Write one newline-delimited JSON message
 * - Read one newline-delimited JSON response
 * - Close the connection
 *
 * Discovery order for the socket path:
 * 1. GOODVIBES_RUNTIME_SOCKET environment variable
 * 2. .goodvibes/state/runtime.socket file in the current working directory
 * 3. Well-known tmpdir path ({tmpdir}/goodvibes-runtime/runtime.sock)
 */

import * as net from 'node:net';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import type { IPCMessage, IPCResponse, IPCQuery, IPCResponseData } from './protocol.js';
import { generateId, timestamp, toErrorMessage } from '../utils.js';
import { createLogger } from '../logger.js';

const logger = createLogger('ipc-client');

/** Default timeout in ms for sendHookEvent (hooks must be fast). */
const DEFAULT_HOOK_EVENT_TIMEOUT_MS = 500;

/** Default timeout in ms for query calls. */
const DEFAULT_QUERY_TIMEOUT_MS = 200;

/**
 * Optional configuration for {@link RuntimeClient}.
 *
 * All fields have sensible defaults and are safe to omit.
 */
export interface RuntimeClientConfig {
  /**
   * Timeout in ms for {@link RuntimeClient.sendHookEvent} calls.
   * Hooks run synchronously in Claude Code; keep this low.
   * @default 500
   */
  hookEventTimeoutMs?: number;
  /**
   * Timeout in ms for {@link RuntimeClient.query} calls.
   * @default 200
   */
  queryTimeoutMs?: number;
}

/**
 * Thin IPC client for hook scripts.
 *
 * Automatically discovers the runtime engine socket on construction. All
 * public methods return `null` when the engine is unreachable, so callers
 * can simply ignore the return value in the common case.
 *
 * @example
 * ```ts
 * const client = new RuntimeClient();
 * if (client.isAvailable()) {
 *   const result = await client.sendHookEvent('pre_tool_use', hookInput);
 *   // result is IPCResponseData | null
 * }
 * ```
 */
export class RuntimeClient {
  /**
   * Cached socket path discovered on first connection attempt.
   * Cleared on ECONNREFUSED so the next call re-discovers the path
   * (handles the case where the daemon restarts at a new socket location).
   */
  private cachedSocketPath: string | null = null;

  /** Resolved hook-event timeout (ms). */
  private readonly hookEventTimeoutMs: number;

  /** Resolved query timeout (ms). */
  private readonly queryTimeoutMs: number;

  constructor(config: RuntimeClientConfig = {}) {
    this.hookEventTimeoutMs = config.hookEventTimeoutMs ?? DEFAULT_HOOK_EVENT_TIMEOUT_MS;
    this.queryTimeoutMs = config.queryTimeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS;
    // Eagerly discover so isAvailable() can answer synchronously before any send().
    this.cachedSocketPath = this.discoverSocket();
    if (this.cachedSocketPath) {
      logger.debug('Discovered runtime socket', { path: this.cachedSocketPath });
    } else {
      logger.debug('Runtime engine socket not found — operating without IPC');
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Returns true if the runtime engine socket path was discovered and the
   * socket file exists on disk.
   *
   * This is a fast synchronous check — it does not attempt a connection.
   */
  isAvailable(): boolean {
    return this.cachedSocketPath !== null && existsSync(this.cachedSocketPath);
  }

  /**
   * Notify the runtime engine of a hook event and receive optional directives.
   *
   * Times out after 500 ms. Returns null if the engine is unreachable or the
   * call fails for any reason.
   *
   * @param hookName  - Hook name as reported by Claude Code (e.g. 'pre_tool_use').
   * @param hookInput - The full hook input payload from Claude Code.
   * @returns The response data from the engine, or null.
   */
  async sendHookEvent(
    hookName: string,
    hookInput: Record<string, unknown>
  ): Promise<IPCResponseData | null> {
    const socketPath = this.resolveSocket();
    if (!socketPath) return null;

    const message: IPCMessage = {
      type: 'hook_event',
      id: generateId(),
      hook_name: hookName,
      hook_input: hookInput,
      timestamp: timestamp(),
    };

    const response = await this.send(socketPath, message, this.hookEventTimeoutMs);
    if (!response || response.status === 'error') {
      if (response?.error) {
        logger.warn('Hook event rejected by runtime engine', {
          hook: hookName,
          error: response.error,
        });
      }
      return null;
    }
    return response.data ?? null;
  }

  /**
   * Query the runtime engine for state or a decision.
   *
   * Times out after 200 ms. Returns null if the engine is unreachable or the
   * call fails for any reason.
   *
   * @param query - The query to execute (discriminated by `kind`).
   * @returns The response data from the engine, or null.
   */
  async query(query: IPCQuery): Promise<IPCResponseData | null> {
    const socketPath = this.resolveSocket();
    if (!socketPath) return null;

    const message: IPCMessage = {
      type: 'query',
      id: generateId(),
      query,
    };

    const response = await this.send(socketPath, message, this.queryTimeoutMs);
    if (!response || response.status === 'error') {
      if (response?.error) {
        logger.warn('Query rejected by runtime engine', {
          kind: query.kind,
          error: response.error,
        });
      }
      return null;
    }
    return response.data ?? null;
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * Resolves the socket path for the next connection attempt.
   *
   * Returns the cached path if available, otherwise re-discovers. Returns
   * null if no socket path can be found (engine not running).
   */
  private resolveSocket(): string | null {
    if (this.cachedSocketPath) return this.cachedSocketPath;
    this.cachedSocketPath = this.discoverSocket();
    if (this.cachedSocketPath) {
      logger.debug('Re-discovered runtime socket', { path: this.cachedSocketPath });
    }
    return this.cachedSocketPath;
  }

  /**
   * Send a single IPC message to the runtime engine and return its response.
   *
   * Opens a new Unix domain socket connection, writes the JSON message
   * (newline-terminated), reads the JSON response (newline-terminated), then
   * closes the connection. Returns null on timeout or any socket error.
   *
   * On ECONNREFUSED the cached socket path is cleared so the next call will
   * re-discover the socket (handles daemon restarts at a new socket location).
   *
   * @param socketPath - Resolved socket path to connect to.
   * @param message    - The IPC message to send.
   * @param timeoutMs  - Maximum ms to wait for a response before giving up.
   * @returns Parsed {@link IPCResponse}, or null on failure.
   */
  private async send(socketPath: string, message: IPCMessage, timeoutMs: number): Promise<IPCResponse | null> {
    return new Promise<IPCResponse | null>((resolve) => {
      let resolved = false;

      const done = (result: IPCResponse | null): void => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        resolve(result);
      };

      const timer = setTimeout(() => {
        logger.debug('IPC send timed out', { id: message.id, timeout_ms: timeoutMs });
        socket.destroy();
        done(null);
      }, timeoutMs);

      const socket = net.createConnection({ path: socketPath });

      socket.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ECONNREFUSED') {
          logger.debug('IPC connection refused — clearing socket cache for re-discovery', {
            id: message.id,
            path: socketPath,
          });
          this.cachedSocketPath = null;
        } else {
          logger.debug('IPC socket error', {
            id: message.id,
            err: err.message,
          });
        }
        done(null);
      });

      socket.once('connect', () => {
        const payload = JSON.stringify(message) + '\n';
        socket.write(payload, 'utf-8');
      });

      let rawData = '';
      socket.on('data', (chunk) => {
        rawData += chunk.toString('utf-8');

        const newlineIdx = rawData.indexOf('\n');
        if (newlineIdx === -1) return; // Response not yet complete

        const line = rawData.slice(0, newlineIdx);
        socket.destroy();

        try {
          const response = JSON.parse(line) as IPCResponse;
          done(response);
        } catch (err) {
          logger.warn('Failed to parse IPC response', {
            id: message.id,
            err: toErrorMessage(err),
          });
          done(null);
        }
      });

      socket.once('close', () => {
        done(null);
      });
    });
  }

  /**
   * Discover the runtime engine socket path.
   *
   * Resolution order:
   * 1. `GOODVIBES_RUNTIME_SOCKET` environment variable.
   * 2. Per-PID pointer files `runtime-{pid}.socket` in `.goodvibes/state/` (supports
   *    multiple concurrent sessions for the same project).
   * 3. Legacy `runtime.socket` pointer file for backward compatibility.
   * 4. Well-known tmpdir path: `{os.tmpdir()}/goodvibes-runtime/runtime.sock`.
   *
   * @returns Absolute socket path, or null if none is discoverable.
   */
  private discoverSocket(): string | null {
    // 1. Environment variable (set by runtime engine at startup)
    const envPath = process.env['GOODVIBES_RUNTIME_SOCKET'];
    if (envPath) {
      return envPath;
    }

    const stateDir = join(process.cwd(), '.goodvibes', 'state');

    // 2. Scan for per-PID pointer files written by concurrent runtime engine sessions
    if (existsSync(stateDir)) {
      try {
        const entries = readdirSync(stateDir);
        for (const entry of entries) {
          if (/^runtime-\d+\.socket$/.test(entry)) {
            try {
              const socketPath = readFileSync(join(stateDir, entry), 'utf-8').trim();
              if (socketPath && existsSync(socketPath)) return socketPath;
            } catch {
              // Ignore — try next entry
            }
          }
        }
      } catch {
        // Ignore — fall through to next strategy
      }
    }

    // 3. Legacy pointer file (backward compatibility)
    const legacyPointerFile = join(stateDir, 'runtime.socket');
    if (existsSync(legacyPointerFile)) {
      try {
        const socketPath = readFileSync(legacyPointerFile, 'utf-8').trim();
        if (socketPath) return socketPath;
      } catch {
        // Ignore — fall through to next strategy
      }
    }

    // 4. Well-known tmpdir path (fallback for same-machine sessions)
    const defaultPath = join(tmpdir(), 'goodvibes-runtime', 'runtime.sock');
    if (existsSync(defaultPath)) {
      return defaultPath;
    }

    return null;
  }
}
