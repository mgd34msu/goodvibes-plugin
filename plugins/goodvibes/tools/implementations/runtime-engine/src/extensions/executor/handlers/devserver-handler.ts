/**
 * Dev Server Handler
 *
 * TriggerActionHandler implementation that restarts a development server
 * process. Kills the existing process on the configured port (if running),
 * re-executes the command, and verifies the port becomes available.
 */

import { spawn } from 'node:child_process';
import { createLogger } from '../../../shared/logger.js';
import { toErrorMessage } from '../../../shared/utils.js';
import type { RuntimeEvent } from '../../../shared/events.js';
import type { TriggerActionHandler } from '../../../core/types.js';

const log = createLogger('handler:devserver');

/** Milliseconds to wait for the port to become reachable after restart. */
const PORT_POLL_TIMEOUT_MS = 30_000;
/** Milliseconds between port availability checks. */
const PORT_POLL_INTERVAL_MS = 500;

/**
 * Polls until a TCP port is accepting connections (or the timeout elapses).
 *
 * @param port     - TCP port number to check.
 * @param timeoutMs - Maximum time to wait in milliseconds.
 * @returns Resolves `true` when the port is open, `false` on timeout.
 */
async function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
  const { createConnection } = await import('node:net');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const open = await new Promise<boolean>(resolve => {
      const socket = createConnection({ port, host: '127.0.0.1' });
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => { socket.destroy(); resolve(false); });
    });
    if (open) return true;
    await new Promise(r => setTimeout(r, PORT_POLL_INTERVAL_MS));
  }
  return false;
}

/**
 * Attempts to kill the process listening on the given port using `fuser -k`.
 * Silently ignores failures (port may already be free).
 *
 * @param port - TCP port to kill.
 */
async function killProcessOnPort(port: number): Promise<void> {
  return new Promise(resolve => {
    const proc = spawn('fuser', ['-k', `${port}/tcp`], { stdio: 'ignore' });
    proc.on('close', () => resolve());
    proc.on('error', () => resolve()); // fuser may not be installed; ignore
  });
}

/**
 * Factory that creates a TriggerActionHandler for restarting a dev server.
 *
 * Expected trigger args:
 * - `command`  (string) — shell command to run the dev server (e.g. `"npm run dev"`).
 * - `port`     (number) — TCP port the server listens on (used for polling).
 *
 * @param projectRoot - Absolute path to the project root directory.
 * @returns A TriggerActionHandler.
 */
export function restartDevServer(projectRoot: string): TriggerActionHandler {
  return async (
    args: Record<string, unknown>,
    _event: RuntimeEvent,
  ): Promise<void> => {
    const command = typeof args['command'] === 'string' ? args['command'] : 'npm run dev';
    const port = typeof args['port'] === 'number' ? args['port'] : 3000;

    log.info('Restarting dev server', { command, port, projectRoot });

    try {
      // Kill any existing process on the port
      log.debug('Killing process on port', { port });
      await killProcessOnPort(port);

      // Small delay to ensure port is released
      await new Promise(r => setTimeout(r, 500));

      // Spawn the new server process
      const [cmd, ...cmdArgs] = command.split(' ');
      const child = spawn(cmd ?? command, cmdArgs, {
        cwd: projectRoot,
        detached: true,
        stdio: 'ignore',
      });
      child.unref();

      log.info('Dev server process spawned', { pid: child.pid, command });

      // Poll until the port is reachable
      const available = await waitForPort(port, PORT_POLL_TIMEOUT_MS);
      if (available) {
        log.info('Dev server restarted successfully', { port });
      } else {
        log.warn('Dev server restart timed out waiting for port', { port, timeoutMs: PORT_POLL_TIMEOUT_MS });
      }
    } catch (err) {
      log.error('Failed to restart dev server', { error: toErrorMessage(err), command, port });
    }
  };
}
