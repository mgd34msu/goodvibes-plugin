/**
 * DaemonHookServer — hook IPC endpoint for daemon mode.
 *
 * When the runtime engine runs as a standalone daemon process, hook scripts
 * cannot reach the engine's IPC socket because no local RuntimeEngine runs
 * inside the MCP server process. This class solves that by hosting a
 * dedicated Unix socket within the daemon itself that speaks the same
 * line-delimited JSON protocol as IPCServer/IPCRouter.
 *
 * Discovery: on startup, DaemonHookServer writes a PID-keyed pointer file to
 * `.goodvibes/state/runtime-{pid}.socket` so `RuntimeClient.discoverSocket()`
 * (strategy 3 / PID scan) can find it. When hooks send a `session:started`
 * hook_event, IPCRouter writes an additional session-keyed pointer file
 * (`runtime-{sessionId}.socket`), enabling strategy 2 exact-match discovery.
 *
 * Protocol: identical to the local IPCServer — newline-delimited JSON,
 * one message per connection, one response, then close. Hooks need zero changes.
 */

import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import type { RuntimeEngine } from '../bootstrap.js';
import { IPCServer } from '../shared/ipc/ipc-server.js';
import { IPCRouter } from '../extensions/ipc/ipc-router.js';
import { createLogger } from '../shared/logger.js';
import { toErrorMessage } from '../shared/utils.js';
import { ensureDirSync } from '../core/utils/fs-utils.js';
import { cleanStalePointerFiles } from '../extensions/ipc/setup.js';

const logger = createLogger('daemon-hook-server');

export interface DaemonHookServerOptions {
  /** The daemon's hosted RuntimeEngine. */
  engine: RuntimeEngine;
  /** Absolute path to the Unix socket file for this hook server. */
  socketPath: string;
  /** Absolute path to the `.goodvibes/state/` directory for pointer file writes. */
  stateDir: string;
}

/**
 * Hosts a hook IPC endpoint inside the daemon process.
 *
 * Wraps IPCServer + IPCRouter to provide hook scripts with the same
 * IPC interface they use when a local engine is running.
 */
export class DaemonHookServer {
  private readonly engine: RuntimeEngine;
  private readonly socketPath: string;
  private readonly stateDir: string;
  private ipcServer: IPCServer | null = null;
  private ipcRouter: IPCRouter | null = null;

  constructor(options: DaemonHookServerOptions) {
    this.engine = options.engine;
    this.socketPath = options.socketPath;
    this.stateDir = options.stateDir;
  }

  /**
   * Start the hook IPC server and write the PID-keyed pointer file.
   */
  async start(): Promise<void> {
    const socketDir = dirname(this.socketPath);
    mkdirSync(socketDir, { recursive: true, mode: 0o700 });

    // Clean up stale pointer files from a previous unclean daemon exit so
    // RuntimeClient.discoverSocket() does not find dead entries.
    cleanStalePointerFiles(this.stateDir, logger);

    const engine = this.engine;
    const directiveQueue = engine.getDirectiveQueue();

    // Build IPCRouter with the same wiring pattern as createIPCSubsystem,
    // but using getters from the running RuntimeEngine.
    const ipcRouter = new IPCRouter({
      eventBus: engine.getEventBus(),
      triggerRegistry: engine.getTriggerRegistry(),
      workflowEngine: engine.getWorkflowEngine(),
      agentCoordinator: engine.getAgentCoordinator(),
      directiveQueue,
      socketPath: this.socketPath,
      stateDir: this.stateDir,
      stateStore: engine.getCoreStateStore(),
      hookProcessor: engine.getHookProcessor(),
      executorMode: engine.getExecutorMode(),
      executorBudget: engine.getExecutorBudget(),
      daemonTickHandler: engine.getDaemonTickHandler(),
      // processHookEvent: run the event processor synchronously in-band so
      // WRFC directives are enqueued before the UPS hook queries get_directives.
      // Note: agentWorkflowMap and wrfcConfigStore are intentionally omitted.
      // Workflow-scoped directive draining and WRFC config queries are not yet
      // supported in daemon mode. Wire these when full daemon-mode WRFC is tested.
      processHookEvent: async (event) => {
        const processor = engine.getEventProcessor();
        if (processor) {
          try {
            await processor.processImmediate(event);
          } catch (err) {
            logger.warn('processHookEvent failed', { error: toErrorMessage(err) });
          }
        }
      },
    });

    const ipcServer = new IPCServer(this.socketPath);
    ipcServer.onMessage(ipcRouter.route.bind(ipcRouter));

    // Wire hold-and-release for directive delivery reliability.
    if (directiveQueue) {
      const dq = directiveQueue;
      ipcServer.setWriteResultCallback((holdId, success) => {
        if (success) {
          dq.releaseHold(holdId);
        } else {
          dq.reEnqueueHold(holdId);
        }
      });
    }

    ensureDirSync(this.stateDir);
    await ipcServer.listen();

    this.ipcServer = ipcServer;
    this.ipcRouter = ipcRouter;

    // Write PID-keyed pointer file so hooks can discover this socket
    // via RuntimeClient.discoverSocket() strategy 3 (PID scan).
    const pointerFile = join(this.stateDir, `runtime-${process.pid}.socket`);
    try {
      writeFileSync(pointerFile, this.socketPath, 'utf-8');
      logger.info('Daemon hook server started', {
        socket: this.socketPath,
        pointer: pointerFile,
      });
    } catch (err) {
      logger.warn('Failed to write hook server pointer file', { err: toErrorMessage(err) });
    }
  }

  /**
   * Stop the hook IPC server and clean up pointer files.
   */
  async stop(): Promise<void> {
    // Remove session pointer files written during the session.
    this.ipcRouter?.removeSessionPointers();

    // Remove the PID-keyed pointer file.
    const pointerFile = join(this.stateDir, `runtime-${process.pid}.socket`);
    try {
      unlinkSync(pointerFile);
    } catch {
      // Best-effort — ENOENT is expected after a clean run
    }

    if (this.ipcServer) {
      try {
        await this.ipcServer.close();
      } catch (err) {
        logger.warn('Hook IPC server close error', { err: toErrorMessage(err) });
      }
      this.ipcServer = null;
    }
    this.ipcRouter = null;

    logger.info('Daemon hook server stopped');
  }

  /**
   * Generate a deterministic hook socket path for a given project root.
   *
   * The path includes a sha256 hash of the project root (same as
   * createIPCSubsystem) so multiple projects on the same host don't clash.
   *
   * @param socketDir - Directory to place the socket file.
   * @param projectRoot - Project root path (used for the hash segment).
   * @returns Absolute path for the hook socket.
   */
  static socketPath(socketDir: string, projectRoot: string): string {
    const hash = createHash('sha256').update(projectRoot).digest('hex').slice(0, 8);
    return join(socketDir, `goodvibes-hook-${hash}-${process.pid}.sock`);
  }
}
