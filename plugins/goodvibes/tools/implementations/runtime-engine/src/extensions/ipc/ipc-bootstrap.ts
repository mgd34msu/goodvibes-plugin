/**
 * ipc-bootstrap.ts — IPC server setup and teardown.
 *
 * Responsibilities:
 * - Creating and starting the Unix domain socket IPC server
 * - Wiring the IPC router with all runtime dependencies
 * - Writing and removing the socket pointer file
 * - Graceful IPC server shutdown
 */

import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { createLogger } from './shared/logger.js';
import { toErrorMessage } from './shared/utils.js';
import { IPCServer } from './shared/ipc/ipc-server.js';
import { IPCRouter } from './shared/ipc/ipc-router.js';
import { ensureDirSync } from './core/utils/fs-utils.js';

import type { RuntimeConfig } from './shared/config.js';
import type { EventBus } from './extensions/events/event-bus.js';
import type { TriggerRegistry } from './extensions/triggers/trigger-registry.js';
import type { WorkflowEngine } from './extensions/workflow/workflow-engine.js';
import type { AgentCoordinator } from './extensions/agents/agent-coordinator.js';
import type { DirectiveQueue } from './extensions/directives/directive-queue.js';
import type { WRFCConfigStore } from './extensions/directives/wrfc-config-store.js';
import type { AgentWorkflowMap } from './extensions/directives/agent-workflow-map.js';
import type { HookProcessor } from '../plugins/index.js';
import type { ExecutorModeManager } from './core/processing/executor-mode.js';
import type { ExecutorBudgetManager } from './extensions/executor/executor-budget.js';
import type { DaemonTickHandler } from './extensions/executor/daemon-tick-handler.js';

const logger = createLogger('ipc-bootstrap');

export interface IPCBootstrapDeps {
  config: RuntimeConfig;
  projectRoot: string;
  eventBus: EventBus;
  triggerRegistry: TriggerRegistry | null;
  workflowEngine: WorkflowEngine | null;
  agentCoordinator: AgentCoordinator | null;
  directiveQueue: DirectiveQueue | null;
  wrfcConfigStore: WRFCConfigStore | null;
  agentWorkflowMap: AgentWorkflowMap | null;
  hookProcessor: HookProcessor | null;
  executorMode: ExecutorModeManager | null;
  executorBudget: ExecutorBudgetManager | null;
  daemonTickHandler: DaemonTickHandler | null;
}

export interface IPCSubsystem {
  ipcServer: IPCServer;
  ipcRouter: IPCRouter;
  socketPath: string;
}

/**
 * Start the IPC server, bind it to a session-scoped socket path, wire
 * the router, and write the socket pointer file.
 *
 * Returns the initialized subsystem + socket path on success, or null on failure.
 */
export async function startIPCServer(deps: IPCBootstrapDeps): Promise<{ subsystem: IPCSubsystem; socketPath: string } | null> {
  const { config, projectRoot, directiveQueue, agentWorkflowMap } = deps;
  const stateDir = join(projectRoot, config.persistence.state_dir);
  const socketDir = config.ipc.socket_dir;

  const hash = createHash('sha256').update(projectRoot).digest('hex').slice(0, 8);
  const socketPath = join(socketDir, `goodvibes-runtime-${hash}-${process.pid}.sock`);

  try {
    const ipcServer = new IPCServer(socketPath);

    const ipcRouter = new IPCRouter({
      eventBus: deps.eventBus,
      triggerRegistry: deps.triggerRegistry,
      workflowEngine: deps.workflowEngine,
      agentCoordinator: deps.agentCoordinator,
      directiveQueue,
      wrfcConfigStore: deps.wrfcConfigStore,
      socketPath,
      stateDir,
      agentWorkflowMap,
      hookProcessor: deps.hookProcessor,
      executorMode: deps.executorMode,
      executorBudget: deps.executorBudget,
      daemonTickHandler: deps.daemonTickHandler,
    });
    ipcServer.onMessage(ipcRouter.route.bind(ipcRouter));

    // Wire hold-and-release: on successful socket write, release the held
    // directive batch; on failure, re-enqueue for the next query attempt.
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

    // Inject agent→workflow resolver so get_directives queries can scope
    // drains by workflow_id, preventing cross-workflow directive delivery.
    if (agentWorkflowMap) {
      const awm = agentWorkflowMap;
      ipcRouter.setAgentWorkflowResolver((agentId: string) => {
        return awm.lookup(agentId) ?? null;
      });
    }

    mkdirSync(socketDir, { recursive: true, mode: 0o700 });
    await ipcServer.listen();

    ensureDirSync(stateDir);
    const pointerFile = join(stateDir, `runtime-${process.pid}.socket`);
    writeFileSync(pointerFile, socketPath, 'utf-8');

    logger.info('IPC server started', { socket: socketPath });
    return { subsystem: { ipcServer, ipcRouter, socketPath }, socketPath };
  } catch (err) {
    logger.error('Failed to start IPC server', {
      socket: socketPath,
      err: toErrorMessage(err),
    });
    return null;
  }
}

/**
 * Remove the socket pointer file written during startIPCServer.
 */
export function removeSocketPointerFile(projectRoot: string, config: RuntimeConfig): void {
  const pointerFile = join(
    projectRoot,
    config.persistence.state_dir,
    `runtime-${process.pid}.socket`
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
 * Gracefully close the IPC server and clean up routing state.
 */
export async function teardownIPCServer(
  subsystem: IPCSubsystem,
  projectRoot: string,
  config: RuntimeConfig,
): Promise<void> {
  try {
    await subsystem.ipcServer.close();
    removeSocketPointerFile(projectRoot, config);
    subsystem.ipcRouter.removeSessionPointers();
    logger.debug('IPC server closed');
  } catch (err) {
    logger.warn('IPC server close failed', {
      err: toErrorMessage(err),
    });
  }
}
