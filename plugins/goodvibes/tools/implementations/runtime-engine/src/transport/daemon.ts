/**
 * daemon.ts — standalone daemon entry point.
 * Bootstraps a RuntimeEngine, starts the DaemonServer, writes PID + socket pointer files,
 * and handles graceful shutdown on SIGTERM/SIGINT.
 */

import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { RuntimeEngine } from '../bootstrap.js';
import { loadConfig } from '../shared/config.js';
import { DaemonServer } from './daemon-server.js';
import { DaemonHookServer } from './daemon-hook-server.js';
import { DAEMON_PID_FILE, DAEMON_SOCKET_POINTER, DAEMON_SOCKET_NAME, DAEMON_HOOK_SOCKET_NAME } from './daemon-constants.js';
import { createLogger } from '../shared/logger.js';

const logger = createLogger('daemon');

async function main(): Promise<void> {
  // Resolve project root — prefer GV_PROJECT_ROOT env var, otherwise cwd
  const projectRoot = process.env['GV_PROJECT_ROOT'] ?? process.cwd();
  const goodvibesDir = resolve(projectRoot, '.goodvibes');

  const socketPath = process.env['GV_DAEMON_SOCKET']
    ? resolve(process.env['GV_DAEMON_SOCKET'])
    : resolve(goodvibesDir, DAEMON_SOCKET_NAME);

  const hookSocketPath = process.env['GV_DAEMON_HOOK_SOCKET']
    ? resolve(process.env['GV_DAEMON_HOOK_SOCKET'])
    : resolve(goodvibesDir, DAEMON_HOOK_SOCKET_NAME);

  const stateDir = resolve(goodvibesDir, 'state');

  const pidFilePath = resolve(goodvibesDir, DAEMON_PID_FILE);
  const socketPointerPath = resolve(goodvibesDir, DAEMON_SOCKET_POINTER);

  // Remove stale socket file if present
  if (existsSync(socketPath)) {
    try { unlinkSync(socketPath); } catch { /* ignore */ }
  }

  // Remove stale hook socket file if present (prevents EADDRINUSE after unclean exit)
  if (existsSync(hookSocketPath)) {
    try { unlinkSync(hookSocketPath); } catch { /* ignore */ }
  }

  // Set executor mode to daemon before bootstrap — this ensures the
  // ExecutorModeManager detects daemon mode and the HTTP listener only
  // starts in this process.
  if (!process.env['GOODVIBES_EXECUTOR_MODE']) {
    process.env['GOODVIBES_EXECUTOR_MODE'] = 'daemon';
  }

  // Bootstrap runtime engine
  const config = loadConfig(projectRoot);
  const engine = new RuntimeEngine(config, projectRoot);
  await engine.startup();

  // Start daemon server
  const server = new DaemonServer({ socketPath, engine });
  await server.start();

  // Start daemon hook server (IPC endpoint for hook scripts)
  const hookServer = new DaemonHookServer({ socketPath: hookSocketPath, engine, stateDir });
  await hookServer.start();

  // Write PID and socket pointer files
  try {
    writeFileSync(pidFilePath, String(process.pid), 'utf-8');
    writeFileSync(socketPointerPath, socketPath, 'utf-8');
  } catch (err) {
    logger.warn('Failed to write PID/socket files', { err: String(err) });
  }

  logger.info('Daemon running', { pid: process.pid, socket: socketPath });

  // Graceful shutdown handler
  const shutdown = async (signal: string): Promise<void> => {
    logger.info('Received signal, shutting down', { signal });
    try {
      await hookServer.stop();
      await server.stop();
      await engine.shutdown();
    } catch (err) {
      logger.error('Shutdown error', { err: String(err) });
    } finally {
      // Clean up PID and socket pointer files
      try { unlinkSync(pidFilePath); } catch { /* ignore */ }
      try { unlinkSync(socketPointerPath); } catch { /* ignore */ }
      process.exit(0);
    }
  };

  process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.once('SIGINT', () => { void shutdown('SIGINT'); });
}

main().catch((err) => {
  console.error('[daemon] Fatal startup error:', err);
  process.exit(1);
});
