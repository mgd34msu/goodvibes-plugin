/**
 * extensions/ipc/teardown.ts — L2 IPC teardown utilities.
 *
 * Contains teardown functions that depend on IPCRouter (L2) and RuntimeConfig (L0),
 * and therefore belong in L2 rather than L0 shared/ipc/ipc-server.ts.
 */

import { unlinkSync } from 'node:fs';
import { join } from 'node:path';

import { createLogger } from '../../shared/logger.js';
import { toErrorMessage } from '../../shared/utils.js';
import type { IPCServer } from '../../shared/ipc/ipc-server.js';
import type { RuntimeConfig } from '../../shared/config.js';
import type { IPCRouter } from './ipc-router.js';
import type { SocketWatcher } from './socket-watcher.js';

const logger = createLogger('ipc-teardown');

/** Bundle of IPC components (server + router + socket path). */
export interface IPCSubsystem {
  ipcServer: IPCServer;
  ipcRouter: IPCRouter;
  socketPath: string;
  /** Optional watcher that monitors the socket file for unexpected deletion. */
  socketWatcher?: SocketWatcher;
  /** Optional symlink path in tmpdir pointing to the real socket location. */
  symlinkPath?: string;
}

/**
 * Remove the socket pointer file written during IPC setup.
 */
export function removeSocketPointerFile(projectRoot: string, config: RuntimeConfig): void {
  const pointerFile = join(
    projectRoot,
    config.persistence.state_dir,
    `runtime-${process.pid}.socket`,
  );
  try {
    unlinkSync(pointerFile);
    logger.debug('Socket pointer file removed', { path: pointerFile });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn('Could not remove socket pointer file', {
        path: pointerFile,
        err: toErrorMessage(err),
      });
    }
  }
}

/**
 * Gracefully close the IPC server and clean up.
 */
export async function teardownIPC(
  subsystem: IPCSubsystem,
  projectRoot: string,
  config: RuntimeConfig,
): Promise<void> {
  // Stop socket watcher first so it doesn't fire onSocketLost during teardown
  subsystem.socketWatcher?.stop();

  // Remove tmpdir symlink (best-effort; non-fatal)
  if (subsystem.symlinkPath) {
    try {
      unlinkSync(subsystem.symlinkPath);
      logger.debug('Symlink removed', { path: subsystem.symlinkPath });
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn('Could not remove socket symlink', {
          path: subsystem.symlinkPath,
          err: toErrorMessage(err),
        });
      }
    }
  }

  try {
    await subsystem.ipcServer.close();
    removeSocketPointerFile(projectRoot, config);
    subsystem.ipcRouter.removeSessionPointers();
    logger.debug('IPC teardown complete');
  } catch (err) {
    logger.warn('IPC teardown failed', {
      err: toErrorMessage(err),
    });
  }
}
