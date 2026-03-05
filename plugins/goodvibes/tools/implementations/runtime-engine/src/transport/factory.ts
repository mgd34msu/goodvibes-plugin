/**
 * TransportFactory — selects LocalTransport or RemoteTransport based on executor mode.
 * Falls back to LocalTransport when daemon socket cannot be reached (hybrid mode).
 */

import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { DAEMON_SOCKET_POINTER, DAEMON_PID_FILE } from './daemon-constants.js';
import type { RuntimeTransport } from './types.js';
import type { RuntimeEngine } from '../bootstrap.js';
import { LocalTransport } from './local-transport.js';
import { RemoteTransport } from './remote-transport.js';

export interface TransportFactoryOptions {
  /**
   * Executor mode — controls transport selection:
   *   'engaged'  → always local (in-process)
   *   'daemon'   → always remote (socket RPC), error if unreachable
   *   'hybrid'   → prefer remote, fall back to local if daemon unavailable
   */
  mode: 'engaged' | 'daemon' | 'hybrid';

  /** Required when mode is 'daemon' or 'hybrid'. */
  socketPath?: string;

  /** Milliseconds to wait for daemon connection (default: 5000). */
  connectTimeoutMs?: number;

  /** RuntimeEngine instance, required for local transport. */
  engine?: RuntimeEngine;

  /** Project root for daemon socket file discovery (used when socketPath not provided). */
  projectRoot?: string;

  /** Session ID to pass to RemoteTransport (optional; random ID generated if omitted). */
  sessionId?: string;

  /** Reconnection options forwarded to RemoteTransport. */
  reconnect?: {
    enabled?: boolean;
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
  };

  /** Called when reconnection attempt starts. */
  onReconnecting?: (attempt: number) => void;

  /** Called when reconnection succeeds. */
  onReconnected?: () => void;

  /** Called when transport gives up (maxAttempts exceeded). */
  onDead?: (error: Error) => void;
}

/**
 * Discover daemon socket path from the pointer file written by daemon.ts.
 * Returns undefined if no pointer file exists.
 */
export function discoverDaemonSocket(projectRoot: string): string | undefined {
  const goodvibesDir = join(projectRoot, '.goodvibes');
  const pointerPath = join(goodvibesDir, DAEMON_SOCKET_POINTER);
  if (!existsSync(pointerPath)) return undefined;

  try {
    const content = readFileSync(pointerPath, 'utf-8').trim();
    if (!content) return undefined;

    // Verify the daemon PID is alive
    const pidPath = join(goodvibesDir, DAEMON_PID_FILE);
    if (existsSync(pidPath)) {
      const pidStr = readFileSync(pidPath, 'utf-8').trim();
      const pid = parseInt(pidStr, 10);
      if (Number.isFinite(pid)) {
        try {
          process.kill(pid, 0);
        } catch {
          // PID is dead — clean up orphaned files
          try { unlinkSync(pointerPath); } catch { /* ignore */ }
          try { unlinkSync(pidPath); } catch { /* ignore */ }
          return undefined;
        }
      }
    }

    return content;
  } catch {
    return undefined;
  }
}

/**
 * Create a RuntimeTransport based on the factory options.
 * For 'hybrid' mode: attempts RemoteTransport first, falls back to LocalTransport.
 */
export async function createTransport(options: TransportFactoryOptions): Promise<RuntimeTransport> {
  const { mode, connectTimeoutMs, sessionId, reconnect, onReconnecting, onReconnected, onDead } = options;

  if (mode === 'engaged') {
    if (!options.engine) {
      throw new Error("TransportFactory: 'engine' is required for mode 'engaged'");
    }
    return new LocalTransport(options.engine);
  }

  if (mode !== 'daemon' && mode !== 'hybrid') {
    throw new Error(`TransportFactory: unknown mode '${mode}'`);
  }

  // Resolve socket path — explicit > env var > pointer file
  let socketPath = options.socketPath;
  if (!socketPath) {
    socketPath = process.env.GOODVIBES_DAEMON_SOCKET;
  }
  if (!socketPath) {
    const projectRoot = options.projectRoot ?? process.cwd();
    socketPath = discoverDaemonSocket(projectRoot);
  }

  // Note: TransportFactoryOptions uses camelCase (baseDelayMs, maxDelayMs) which maps 1:1
  // to RemoteTransportOptions. Config consumers (e.g. MCP handlers) may use snake_case —
  // conversion to camelCase must happen at the config-to-options bridge before this point.
  const reconnectOpts = reconnect
    ? {
        enabled: reconnect.enabled ?? true,
        maxAttempts: reconnect.maxAttempts ?? 10,
        baseDelayMs: reconnect.baseDelayMs ?? 100,
        maxDelayMs: reconnect.maxDelayMs ?? 10_000,
      }
    : undefined;

  if (mode === 'daemon') {
    if (!socketPath) {
      throw new Error(
        "TransportFactory: 'socketPath' is required for mode 'daemon' (or provide 'projectRoot' with a daemon.socket pointer file)"
      );
    }
    const transport = new RemoteTransport({
      daemonSocketPath: socketPath,
      timeoutMs: connectTimeoutMs,
      sessionId,
      reconnect: reconnectOpts,
      onReconnecting,
      onReconnected,
      onDead,
    });
    await transport.connect();
    return transport;
  }

  // hybrid: try remote first, fall back to local
  if (socketPath) {
    try {
      const transport = new RemoteTransport({
        daemonSocketPath: socketPath,
        timeoutMs: connectTimeoutMs,
        sessionId,
        reconnect: reconnectOpts,
        onReconnecting,
        onReconnected,
        onDead,
      });
      await transport.connect();
      return transport;
    } catch {
      // daemon unavailable — fall through to local
    }
  }

  if (!options.engine) {
    throw new Error(
      "TransportFactory: daemon socket unavailable and 'engine' not provided for local fallback (mode: hybrid)"
    );
  }
  return new LocalTransport(options.engine);
}
