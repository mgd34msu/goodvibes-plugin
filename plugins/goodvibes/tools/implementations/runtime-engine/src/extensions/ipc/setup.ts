/**
 * extensions/ipc/setup.ts — L2 IPC subsystem factory.
 *
 * Creates and wires the IPC server and router with L2 extension deps.
 */

import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { createLogger } from '../../shared/logger.js';
import type { Logger } from '../../shared/logger.js';
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
import { ToolGateEvaluator } from './tool-gating.js';
import { ContextInjector } from './context-injector.js';
import { SocketWatcher } from './socket-watcher.js';
import { isPidAlive } from './process-utils.js';

export { IHookProcessor } from './types.js';

const logger = createLogger('ipc-setup');

/**
 * Clean up stale socket pointer files left behind by unclean runtime exits.
 *
 * Reads all `runtime-{pid}.socket` pointer files in stateDir. For each one
 * whose PID is no longer alive, deletes both the referenced socket file and
 * the pointer file itself.
 */
export function cleanStalePointerFiles(stateDir: string, log: Logger): void {
  try {
    let entries: string[];
    try {
      entries = readdirSync(stateDir);
    } catch (err: unknown) {
      // State dir doesn't exist yet — nothing to clean.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    }

    const pointerFiles = entries.filter((f) => /^runtime-\d+\.socket$/.test(f));

    for (const filename of pointerFiles) {
      const match = filename.match(/^runtime-(\d+)\.socket$/);
      if (!match) continue;
      const pid = parseInt(match[1], 10);

      if (isPidAlive(pid)) continue;

      const pointerPath = join(stateDir, filename);

      // Read the socket file path from the pointer file content.
      let socketFilePath: string | undefined;
      try {
        socketFilePath = readFileSync(pointerPath, 'utf-8').trim();
      } catch {
        // Pointer file unreadable — skip socket deletion, still try to remove pointer.
      }

      // Delete the actual socket file.
      let socketCleaned = false;
      if (socketFilePath) {
        try {
          unlinkSync(socketFilePath);
          socketCleaned = true;
        } catch (err: unknown) {
          if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
            log.warn('Could not remove stale socket file', {
              path: socketFilePath,
              err: toErrorMessage(err),
            });
          }
        }
      }

      // Delete the pointer file itself.
      try {
        unlinkSync(pointerPath);
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          log.warn('Could not remove stale socket pointer file', {
            path: pointerPath,
            err: toErrorMessage(err),
          });
        }
      }

      log.info('Cleaned stale socket pointer', { pid, pointer: pointerPath, socketCleaned });
    }
  } catch (err: unknown) {
    log.warn('Stale pointer cleanup failed', { err: toErrorMessage(err) });
  }
}

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
  /** CoreStateStore — used to clear stale WRFC state on session:started. */
  stateStore?: import('../../core/state/state-store.js').CoreStateStore | null;
  hookProcessor: IHookProcessor | null;
  executorMode: ExecutorModeManager | null;
  executorBudget: ExecutorBudgetManager | null;
  daemonTickHandler: DaemonTickHandler | null;
  /** Optional callback for synchronous in-band hook event processing — see IPCRouterDeps. */
  processHookEvent?: (event: import('../../shared/events.js').RuntimeEvent) => Promise<void>;
  /**
   * Optional callback invoked when the IPC socket file is unexpectedly deleted.
   * When provided, a SocketWatcher is started after the socket is bound.
   * The callback is responsible for recreating the IPC subsystem.
   */
  onSocketLost?: () => void | Promise<void>;
}

/** Re-export for external consumers. */
export { ToolGateEvaluator } from './tool-gating.js';
export type { ToolGatingConfig, ToolBlockRule } from '../../shared/config.js';
export { ContextInjector } from './context-injector.js';
export type { ContextInjectionConfig, ContextSource } from '../../shared/config.js';

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
  const socketName = `gv-${hash}-${process.pid}.sock`;

  // Unix domain sockets have a hard path length limit of 107 chars (108 with null
  // terminator in sun_path). Project-local paths like
  // ${projectRoot}/.goodvibes/state/sockets/active/goodvibes-runtime-{hash}-{pid}.sock
  // easily exceed this limit. So the socket is created in socketDir (a short tmpfs
  // path like /run/user/{uid}/goodvibes/) and pointer files in the project's
  // .goodvibes/state/ dir point hooks to the actual socket location.
  ensureDirSync(socketDir);
  const socketPath = join(socketDir, socketName);
  // Keep the active socket dir for bookkeeping (stale socket cleanup, etc.)
  const activeSocketDir = join(stateDir, 'sockets', 'active');
  ensureDirSync(activeSocketDir);

  try {
    const ipcServer = new IPCServer(socketPath);

    // Build tool gate evaluator from config (disabled by default)
    const toolGatingConfig = opts.config.tool_gating ?? {
      enabled: false,
      force_allow_all: false,
      rules: [],
    };
    const toolGateEvaluator = new ToolGateEvaluator(toolGatingConfig, {
      budgetManager: opts.executorBudget ?? undefined,
      workflowEngine: opts.workflowEngine ?? undefined,
    });

    // Build context injector from config (disabled by default)
    const contextInjectionConfig = opts.config.context_injection ?? {
      enabled: false,
      include: [],
    };
    const contextInjector = new ContextInjector(contextInjectionConfig, {
      workflowEngine: opts.workflowEngine ?? undefined,
      agentCoordinator: opts.agentCoordinator ?? undefined,
      budgetManager: opts.executorBudget ?? undefined,
    });

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
      stateStore: opts.stateStore ?? null,
      hookProcessor: opts.hookProcessor,
      executorMode: opts.executorMode,
      executorBudget: opts.executorBudget,
      daemonTickHandler: opts.daemonTickHandler,
      toolGateEvaluator,
      contextInjector,
      processHookEvent: opts.processHookEvent,
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

    // Clean stale pointer files from state dir
    cleanStalePointerFiles(stateDir, logger);
    await ipcServer.listen();

    // Write pointer file in project state dir so hooks can discover the socket.
    // The socket lives in socketDir (short tmpfs path); the pointer bridges
    // project-local hook discovery to the actual socket location.
    const pointerFile = join(stateDir, `runtime-${process.pid}.socket`);
    writeFileSync(pointerFile, socketPath, 'utf-8');

    // Start socket watcher if a recreation callback was provided
    let socketWatcher: SocketWatcher | undefined;
    if (opts.onSocketLost) {
      socketWatcher = new SocketWatcher(socketPath, opts.onSocketLost);
      socketWatcher.start();
    }

    // Also pass onSocketLost to the IPC router for session:started verification
    if (opts.onSocketLost) {
      ipcRouter.setOnSocketLost(opts.onSocketLost);
    }

    logger.info('IPC subsystem created', { socket: socketPath, pointer: pointerFile });
    return {
      subsystem: { ipcServer, ipcRouter, socketPath, socketWatcher, symlinkPath: undefined },
      socketPath,
    };
  } catch (err) {
    logger.error('Failed to create IPC subsystem', {
      socket: socketPath,
      err: toErrorMessage(err),
    });
    return null;
  }
}
