/**
 * extensions/ipc/setup.ts — L2 IPC subsystem factory.
 *
 * Creates and wires the IPC server and router with L2 extension deps.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { createLogger } from '../../shared/logger.js';
import { toErrorMessage } from '../../shared/utils.js';
import { IPCServer } from '../../shared/ipc/ipc-server.js';
import { IPCRouter } from './ipc-router.js';
import type { IPCSubsystem } from './teardown.js';
import { ensureDirSync } from '../../core/utils/fs-utils.js';

import type { RuntimeConfig } from '../../shared/config.js';
import type { EventBus } from '../events/event-bus.js';
import type { TriggerRegistry } from '../../core/trigger-registry.js';
import type { WorkflowEngine } from '../workflow/workflow-engine.js';
import type { AgentCoordinator } from '../agents/agent-coordinator.js';
import type { DirectiveQueue } from '../directives/directive-queue.js';
import type { WRFCConfigStore } from '../directives/wrfc-config-store.js';
import type { AgentWorkflowMap } from '../directives/agent-workflow-map.js';
import type { IHookProcessor } from './types.js';
import type { ExecutorModeManager } from '../../core/processing/executor-mode.js';
import type { ExecutorBudgetManager } from '../executor/executor-budget.js';
import type { DaemonTickHandler } from '../executor/daemon-tick-handler.js';

export { IHookProcessor } from './types.js';

const logger = createLogger('ipc-setup');

export interface CreateIPCOptions {
  config: RuntimeConfig;
  projectRoot: string;
  eventBus: EventBus;
  triggerRegistry: TriggerRegistry | null;
  workflowEngine: WorkflowEngine | null;
  agentCoordinator: AgentCoordinator | null;
  directiveQueue: DirectiveQueue | null;
  wrfcConfigStore: WRFCConfigStore | null;
  agentWorkflowMap: AgentWorkflowMap | null;
  hookProcessor: IHookProcessor | null;
  executorMode: ExecutorModeManager | null;
  executorBudget: ExecutorBudgetManager | null;
  daemonTickHandler: DaemonTickHandler | null;
}

/**
 * Create the IPC subsystem: server + router, wired with L2 deps.
 *
 * Returns the subsystem + socket path on success, null on failure.
 */
export async function createIPCSubsystem(
  opts: CreateIPCOptions,
): Promise<{ subsystem: IPCSubsystem; socketPath: string } | null> {
  const { config, projectRoot, directiveQueue, agentWorkflowMap } = opts;
  const stateDir = join(projectRoot, config.persistence.state_dir);
  const socketDir = config.ipc.socket_dir;

  const hash = createHash('sha256').update(projectRoot).digest('hex').slice(0, 8);
  const socketPath = join(socketDir, `goodvibes-runtime-${hash}-${process.pid}.sock`);

  try {
    const ipcServer = new IPCServer(socketPath);

    const ipcRouter = new IPCRouter({
      eventBus: opts.eventBus,
      triggerRegistry: opts.triggerRegistry,
      workflowEngine: opts.workflowEngine,
      agentCoordinator: opts.agentCoordinator,
      directiveQueue,
      wrfcConfigStore: opts.wrfcConfigStore,
      socketPath,
      stateDir,
      agentWorkflowMap,
      hookProcessor: opts.hookProcessor,
      executorMode: opts.executorMode,
      executorBudget: opts.executorBudget,
      daemonTickHandler: opts.daemonTickHandler,
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

    // Inject agent-to-workflow resolver so get_directives queries can scope
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

    logger.info('IPC subsystem created', { socket: socketPath });
    return { subsystem: { ipcServer, ipcRouter, socketPath }, socketPath };
  } catch (err) {
    logger.error('Failed to create IPC subsystem', {
      socket: socketPath,
      err: toErrorMessage(err),
    });
    return null;
  }
}
