/**
 * TransportFactory — selects LocalTransport or RemoteTransport based on executor mode.
 * Falls back to LocalTransport when daemon socket cannot be reached (hybrid mode).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
}

/**
 * Discover daemon socket path from the pointer file written by daemon.ts.
 * Returns undefined if no pointer file exists.
 */
export function discoverDaemonSocket(projectRoot: string): string | undefined {
  const pointerPath = join(projectRoot, '.goodvibes', 'daemon.socket');
  if (!existsSync(pointerPath)) return undefined;
  try {
    const content = readFileSync(pointerPath, 'utf-8').trim();
    return content || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Create a RuntimeTransport based on the factory options.
 * For 'hybrid' mode: attempts RemoteTransport first, falls back to LocalTransport.
 */
export async function createTransport(options: TransportFactoryOptions): Promise<RuntimeTransport> {
  const { mode, connectTimeoutMs } = options;

  if (mode === 'engaged') {
    if (!options.engine) {
      throw new Error("TransportFactory: 'engine' is required for mode 'engaged'");
    }
    return new LocalTransport(options.engine);
  }

  // Resolve socket path
  let socketPath = options.socketPath;
  if (!socketPath && options.projectRoot) {
    socketPath = discoverDaemonSocket(options.projectRoot);
  }

  if (mode === 'daemon') {
    if (!socketPath) {
      throw new Error(
        "TransportFactory: 'socketPath' is required for mode 'daemon' (or provide 'projectRoot' with a daemon.socket pointer file)"
      );
    }
    const transport = new RemoteTransport({ socketPath, connectTimeoutMs });
    await transport.connect();
    return transport;
  }

  // hybrid: try remote first, fall back to local
  if (socketPath) {
    try {
      const transport = new RemoteTransport({ socketPath, connectTimeoutMs });
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
