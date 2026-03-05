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

export { IHookProcessor } from './types.js';

const logger = createLogger('ipc-setup');

/**
 * Check whether a given PID is alive.
 */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    // process.kill(pid, 0) throws when PID doesn't exist — expected behavior
    return false;
  }
}

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
  const socketPath = join(socketDir, `goodvibes-runtime-${hash}-${process.pid}.sock`);

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

    // Clean stale pointer files from state dir (separate from socket dir created below)
    cleanStalePointerFiles(stateDir, logger);
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
