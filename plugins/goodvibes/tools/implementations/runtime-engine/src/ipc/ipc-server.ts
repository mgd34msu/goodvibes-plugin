/**
 * IPC Server
 *
 * Unix domain socket server that accepts connections from hook scripts and
 * other short-lived processes. Each connection sends a single newline-
 * delimited JSON message, receives a single JSON response, and closes.
 *
 * Design decisions:
 * - One message per connection (request/response, then close) keeps the
 *   protocol simple and avoids half-open socket edge cases.
 * - Stale socket files from a previous crash are removed on startup so the
 *   server can always bind cleanly.
 * - Idle connections are closed after 5 seconds to prevent resource leaks.
 * - All errors are logged and swallowed; the server never throws from within
 *   connection handlers.
 */

import * as net from 'net';
import { mkdirSync, existsSync, unlinkSync, chmodSync } from 'fs';
import { dirname } from 'path';

import type { IPCMessage, IPCResponse } from './protocol.js';
import { createLogger } from '../shared/logger.js';
import { toErrorMessage } from '../shared/utils.js';

const logger = createLogger('ipc-server');

/** Milliseconds before an idle connection is forcibly closed. */
const CONNECTION_TIMEOUT_MS = 5_000;

/**
 * Callback invoked for every well-formed IPC message received.
 * Must return a {@link IPCResponse} (or a Promise resolving to one).
 */
export type MessageHandler = (msg: IPCMessage) => Promise<IPCResponse>;

/**
 * Unix domain socket server for hook ↔ runtime engine communication.
 *
 * @example
 * ```ts
 * const server = new IPCServer('/tmp/goodvibes/session-abc.sock');
 * server.onMessage(async (msg) => {
 *   return { id: msg.id, status: 'ok', data: { kind: 'ack' } };
 * });
 * await server.listen();
 * // ... later ...
 * await server.close();
 * ```
 */
export class IPCServer {
  /** The underlying Node.js TCP/socket server. */
  private server: net.Server | null = null;

  /** Absolute path to the Unix domain socket file. */
  private readonly socketPath: string;

  /** Application-level handler for decoded IPC messages. */
  private handler: MessageHandler | null = null;

  /** Set of all currently open client sockets (for clean shutdown). */
  private readonly connections: Set<net.Socket> = new Set();

  /**
   * @param socketPath - Absolute path for the Unix domain socket file.
   *   The parent directory is created automatically if it does not exist.
   */
  constructor(socketPath: string) {
    this.socketPath = socketPath;
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Register the message handler.
   *
   * Must be called before {@link listen}. Only one handler is supported;
   * subsequent calls replace the previous one.
   *
   * @param handler - Async function that receives a decoded {@link IPCMessage}
   *   and returns an {@link IPCResponse}.
   */
  onMessage(handler: MessageHandler): void {
    this.handler = handler;
  }

  /**
   * Start listening for incoming connections on the configured socket path.
   *
   * Steps:
   * 1. Create the socket directory if it does not exist.
   * 2. Remove any stale socket file left by a previous process.
   * 3. Bind and start listening.
   *
   * @throws If the server cannot bind to the socket path.
   */
  async listen(): Promise<void> {
    // 1. Ensure parent directory exists with restricted permissions
    const dir = dirname(this.socketPath);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);

    // 2. Remove stale socket file if present
    if (existsSync(this.socketPath)) {
      try {
        unlinkSync(this.socketPath);
        logger.debug('Removed stale socket file', { path: this.socketPath });
      } catch (err) {
        logger.warn('Could not remove stale socket file', {
          path: this.socketPath,
          err: toErrorMessage(err),
        });
      }
    }

    // 3. Create and start the server
    this.server = net.createServer((socket) => this.handleConnection(socket));

    this.server.on('error', (err) => {
      logger.error('IPC server error', { err: err.message });
    });

    return new Promise<void>((resolve, reject) => {
      this.server!.listen(this.socketPath, () => {
        // Restrict socket file to owner-only access
        chmodSync(this.socketPath, 0o600);
        logger.info('IPC server listening', { path: this.socketPath });
        resolve();
      });
      this.server!.once('error', reject);
    });
  }

  /**
   * Stop accepting new connections and close all existing ones.
   *
   * Destroys all tracked sockets immediately, then waits for the server
   * to finish closing before resolving.
   */
  async close(): Promise<void> {
    logger.info('Closing IPC server', {
      path: this.socketPath,
      connections: this.connections.size,
    });

    // Destroy all open client connections
    for (const socket of this.connections) {
      socket.destroy();
    }
    this.connections.clear();

    // Close the server and remove the socket file
    return new Promise<void>((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => {
        this.removeSocketFile();
        logger.info('IPC server closed');
        resolve();
      });
      this.server = null;
    });
  }

  /**
   * The number of currently open client connections.
   */
  get clientCount(): number {
    return this.connections.size;
  }

  /**
   * The absolute path of the Unix domain socket file.
   */
  getSocketPath(): string {
    return this.socketPath;
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * Handle a new incoming client connection.
   *
   * Reads a complete newline-delimited JSON message, dispatches it to the
   * handler, writes the JSON response, then closes the socket.
   *
   * @param socket - The accepted client socket.
   */
  private handleConnection(socket: net.Socket): void {
    this.connections.add(socket);
    logger.debug('IPC client connected', { connections: this.connections.size });

    // Idle connection timeout — declared before event handlers so all closures
    // capture the same binding. Assigned immediately below.
    let idleTimer: ReturnType<typeof setTimeout>;

    socket.once('close', () => {
      clearTimeout(idleTimer);
      this.connections.delete(socket);
      logger.debug('IPC client disconnected', { connections: this.connections.size });
    });

    socket.on('error', (err) => {
      clearTimeout(idleTimer);
      logger.warn('IPC socket error', { err: err.message });
      this.connections.delete(socket);
      socket.destroy();
    });

    // Start the idle timeout. idleTimer binding is shared with all event handlers above.
    idleTimer = setTimeout(() => {
      logger.warn('IPC connection timed out — closing', { timeout_ms: CONNECTION_TIMEOUT_MS });
      socket.destroy();
    }, CONNECTION_TIMEOUT_MS);

    let rawData = '';

    socket.on('data', (chunk) => {
      rawData += chunk.toString('utf-8');

      const newlineIdx = rawData.indexOf('\n');
      if (newlineIdx === -1) return; // Message not yet complete

      // Message complete — cancel idle timer and stop collecting data
      clearTimeout(idleTimer);
      socket.pause();

      const line = rawData.slice(0, newlineIdx);
      this.processMessage(socket, line);
    });
  }

  /**
   * Parse and dispatch a raw JSON line, then write the response.
   *
   * @param socket - The client socket to write the response to.
   * @param line   - Raw JSON string (without the trailing newline).
   */
  private processMessage(socket: net.Socket, line: string): void {
    let message: IPCMessage;
    try {
      message = JSON.parse(line) as IPCMessage;
    } catch (err) {
      logger.warn('Failed to parse IPC message', {
        err: toErrorMessage(err),
      });
      const errorResponse: IPCResponse = {
        id: 'unknown',
        status: 'error',
        error: 'Invalid JSON',
      };
      this.writeResponse(socket, errorResponse);
      return;
    }

    if (!this.handler) {
      logger.warn('No IPC message handler registered', { msg_type: message.type });
      const noHandlerResponse: IPCResponse = {
        id: message.id,
        status: 'error',
        error: 'No handler registered',
      };
      this.writeResponse(socket, noHandlerResponse);
      return;
    }

    logger.debug('Dispatching IPC message', { id: message.id, type: message.type });

    this.handler(message)
      .then((response) => {
        this.writeResponse(socket, response);
      })
      .catch((err) => {
        logger.error('IPC handler threw an error', {
          id: message.id,
          err: toErrorMessage(err),
        });
        const errResponse: IPCResponse = {
          id: message.id,
          status: 'error',
          error: toErrorMessage(err),
        };
        this.writeResponse(socket, errResponse);
      });
  }

  /**
   * Serialise and write an {@link IPCResponse} to the client socket, then
   * close the socket half (FIN).
   *
   * @param socket   - The client socket.
   * @param response - The response to send.
   */
  private writeResponse(socket: net.Socket, response: IPCResponse): void {
    const payload = JSON.stringify(response) + '\n';
    try {
      socket.end(payload, 'utf-8');
    } catch (err) {
      logger.warn('Failed to write IPC response', {
        id: response.id,
        err: toErrorMessage(err),
      });
      socket.destroy();
    }
  }

  /**
   * Remove the socket file from the filesystem, ignoring errors.
   */
  private removeSocketFile(): void {
    try {
      if (existsSync(this.socketPath)) {
        unlinkSync(this.socketPath);
        logger.debug('Socket file removed', { path: this.socketPath });
      }
    } catch (err) {
      logger.warn('Could not remove socket file', {
        path: this.socketPath,
        err: toErrorMessage(err),
      });
    }
  }
}
