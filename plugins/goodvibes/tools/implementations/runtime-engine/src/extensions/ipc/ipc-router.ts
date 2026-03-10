/**
 * IPCRouter — message routing for the runtime engine IPC channel.
 *
 * Encapsulates all IPC message dispatching logic, keeping RuntimeEngine
 * focused on lifecycle orchestration. Handles every message type defined
 * in the IPC protocol: hook_event, query, state_update, heartbeat.
 */

import type { ResponseEnvelope } from '../../shared/ipc/ipc-server.js';
import { HOLD_TTL_MS } from '../directives/directive-queue.js';
import type { EventBus } from '../events/event-bus.js';
import type { EventType, EventSource, EventPayload, RuntimeEvent } from '../../shared/events.js';
import type { TriggerRegistry } from '../../core/trigger-registry.js';
import type { WorkflowEngine } from '../workflow/workflow-engine.js';
import type { AgentCoordinator } from '../agents/agent-coordinator.js';
import type { DirectiveQueue } from '../directives/directive-queue.js';
import type { WRFCConfigStore } from '../directives/wrfc-config-store.js';
import { validateWRFCConfig } from '../directives/wrfc-config-store.js';
import type { AgentWorkflowMap } from '../directives/agent-workflow-map.js';
import type { CoreStateStore } from '../../core/state/state-store.js';
import type { IPCMessage, IPCResponse, Directive, HookEventMessage, QueryMessage, StateUpdateMessage, HeartbeatMessage } from '../../shared/ipc/protocol.js';
import type { IHookProcessor as IHookProcessorInterface } from './types.js';
import type { ExecutorModeManager } from '../../core/processing/executor-mode.js';
import type { ExecutorBudgetManager } from '../executor/executor-budget.js';
import type { DaemonTickHandler } from '../executor/daemon-tick-handler.js';
import type { ToolGateEvaluator } from './tool-gating.js';
import type { ContextInjector } from './context-injector.js';
import { createLogger } from '../../shared/logger.js';
import { toErrorMessage } from '../../shared/utils.js';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export type { IHookProcessor as IHookProcessorInterface } from './types.js';

const logger = createLogger('ipc-router');

/**
 * Dependencies injected into the IPCRouter at construction time.
 *
 * **Required deps** (always present, but some allow null to mean "disabled"):
 * - `eventBus` — the core event bus; always non-null.
 * - `triggerRegistry` — set once triggers are initialised (null when the
 *   trigger subsystem is disabled in config).
 * - `workflowEngine` — set once workflows are initialised (null when disabled).
 * - `agentCoordinator` — set once agent coordination is initialised (null when disabled).
 * - `directiveQueue` — set once directive processing is initialised (null when disabled).
 * - `socketPath` — the socket file path for writing session pointers; null until
 *   the server is bound.
 * - `stateDir` — the `.goodvibes/state/` path; null when state dir is unavailable.
 *
 * **Optional deps** (may be absent in stripped-down environments):
 * - `agentWorkflowMap` — bridges agent-type bindings; absent when WRFC is disabled.
 * - `hookProcessor` — plugin layer bridge; absent when plugins are disabled.
 * - `executorMode` — executor mode manager; absent when executor mode is disabled.
 * - `executorBudget` — executor budget manager; absent when budget tracking is off.
 * - `daemonTickHandler` — daemon tick handler; absent in non-daemon mode.
 *
 * All nullable/absent deps are handled with graceful degradation — routing
 * continues with reduced functionality rather than throwing.
 */
export interface IPCRouterDeps {
  eventBus: EventBus;
  triggerRegistry: TriggerRegistry | null;
  workflowEngine: WorkflowEngine | null;
  agentCoordinator: AgentCoordinator | null;
  directiveQueue: DirectiveQueue | null;
  /** WRFC configuration store — receives validated config from config:loaded events. */
  wrfcConfigStore?: WRFCConfigStore | null;
  /** Absolute path to the IPC socket file. Used to write session-keyed pointer files. */
  socketPath: string | null;
  /** Absolute path to the .goodvibes/state/ directory. */
  stateDir: string | null;
  /** Agent-to-workflow binding map — used by resolve_pending_bind queries. */
  agentWorkflowMap?: AgentWorkflowMap | null;
  /** CoreStateStore — used to clear stale WRFC state on session:started. */
  stateStore?: CoreStateStore | null;
  /**
   * Optional HookProcessor. When provided, hook_event messages are also
   * routed through it, bridging hook events to the plugin layer.
   * Falls back to EventBus-only handling when null.
   */
  hookProcessor?: IHookProcessorInterface | null;
  /** Executor mode manager for get_executor_mode queries. */
  executorMode?: ExecutorModeManager | null;
  /** Executor budget manager for get_executor_budget queries. */
  executorBudget?: ExecutorBudgetManager | null;
  /** Daemon tick handler for process_tick queries. */
  daemonTickHandler?: DaemonTickHandler | null;
  /** Tool gate evaluator for should_block_tool queries. */
  toolGateEvaluator?: ToolGateEvaluator | null;
  /** Context injector for get_context_injection queries. */
  contextInjector?: ContextInjector | null;
  /**
   * Optional callback invoked synchronously (awaited) inside handleHookEvent,
   * BEFORE the IPC ack is returned. When provided, the hook event is processed
   * through the trigger pipeline in-band so that any enqueued WRFC directives
   * are available when the subsequent get_directives query arrives.
   */
  processHookEvent?: (event: RuntimeEvent) => Promise<void>;
  /**
   * Optional callback invoked when the socket file is found missing at session start.
   * When provided, the IPCRouter will verify socket existence in the session:started
   * handler and trigger recreation if the socket has been deleted.
   */
  onSocketLost?: () => void | Promise<void>;
}

/** Return type for {@link IPCRouter.drainDirectiveMessages}. */
type DrainResult = { message: string; directives: Directive[]; holdId: string };

/**
 * Routes IPC messages from hook scripts to the appropriate runtime engine
 * subsystem and returns the corresponding response.
 *
 * This class is a pure extraction of the routing logic that previously lived
 * inside RuntimeEngine.startIPCServer(). No behaviour has changed.
 */
export class IPCRouter {
  private readonly eventBus: EventBus;
  private readonly triggerRegistry: TriggerRegistry | null;
  private readonly workflowEngine: WorkflowEngine | null;
  private readonly agentCoordinator: AgentCoordinator | null;
  private readonly directiveQueue: DirectiveQueue | null;
  private readonly socketPath: string | null;
  private readonly stateDir: string | null;
  private readonly agentWorkflowMap: AgentWorkflowMap | null;
  /** Optional CoreStateStore for clearing stale WRFC state on session:started. */
  private readonly stateStore: CoreStateStore | null;
  /** Optional HookProcessor for bridging hook events to the plugin layer. */
  private readonly hookProcessor: IHookProcessorInterface | null;
  /** Optional ExecutorModeManager for get_executor_mode queries. */
  private readonly executorMode: ExecutorModeManager | null;
  /** Optional ExecutorBudgetManager for get_executor_budget queries. */
  private readonly executorBudget: ExecutorBudgetManager | null;
  /** Optional DaemonTickHandler for process_tick queries. */
  private readonly daemonTickHandler: DaemonTickHandler | null;
  /** Optional ToolGateEvaluator for should_block_tool queries. */
  private readonly toolGateEvaluator: ToolGateEvaluator | null;
  /** Optional ContextInjector for get_context_injection queries. */
  private readonly contextInjector: ContextInjector | null;
  private readonly wrfcConfigStore: WRFCConfigStore | null;
  /** Optional callback for synchronous in-band hook event processing. */
  private readonly processHookEvent: ((event: RuntimeEvent) => Promise<void>) | null;
  /** Optional callback invoked when the socket file is missing at session:started. */
  private onSocketLostCallback: (() => void | Promise<void>) | null;

  /** Session IDs that have been registered via session:started events. */
  private readonly registeredSessions: Set<string> = new Set();

  /**
   * Optional resolver that maps an agent_id to its bound workflow_id.
   * Injected after construction via {@link setAgentWorkflowResolver}.
   */
  private agentWorkflowResolver?: (agentId: string) => string | null;

  constructor(deps: IPCRouterDeps) {
    this.eventBus = deps.eventBus;
    this.triggerRegistry = deps.triggerRegistry;
    this.workflowEngine = deps.workflowEngine;
    this.agentCoordinator = deps.agentCoordinator;
    this.directiveQueue = deps.directiveQueue;
    this.socketPath = deps.socketPath;
    this.stateDir = deps.stateDir;
    this.agentWorkflowMap = deps.agentWorkflowMap ?? null;
    this.stateStore = deps.stateStore ?? null;
    this.hookProcessor = deps.hookProcessor ?? null;
    this.executorMode = deps.executorMode ?? null;
    this.executorBudget = deps.executorBudget ?? null;
    this.daemonTickHandler = deps.daemonTickHandler ?? null;
    this.toolGateEvaluator = deps.toolGateEvaluator ?? null;
    this.contextInjector = deps.contextInjector ?? null;
    this.wrfcConfigStore = deps.wrfcConfigStore ?? null;
    this.processHookEvent = deps.processHookEvent ?? null;
    this.onSocketLostCallback = deps.onSocketLost ?? null;
  }

  /**
   * Inject a resolver that maps agent_id → workflow_id.
   *
   * When set, `get_directives` queries that carry an `agent_id` will resolve
   * the corresponding workflow_id and use it to drain only that workflow's
   * directives, preventing cross-workflow directive delivery in parallel runs.
   *
   * @param resolver - Function returning the bound workflow_id or null.
   */
  setAgentWorkflowResolver(resolver: (agentId: string) => string | null): void {
    this.agentWorkflowResolver = resolver;
  }

  /**
   * Inject (or replace) the onSocketLost callback after construction.
   * Called from setup.ts after the SocketWatcher is started.
   */
  setOnSocketLost(callback: () => void | Promise<void>): void {
    this.onSocketLostCallback = callback;
  }

  /**
   * Remove all session-keyed pointer files written by this router.
   * Called during shutdown to prevent stale session pointers.
   */
  removeSessionPointers(): void {
    if (!this.stateDir) return;
    for (const sessionId of this.registeredSessions) {
      const pointerFile = join(this.stateDir, `runtime-${sessionId}.socket`);
      try {
        unlinkSync(pointerFile);
        logger.debug('Session pointer file removed', { sessionId });
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          logger.warn('Could not remove session pointer file', {
            sessionId,
            err: toErrorMessage(err),
          });
        }
      }
    }
    this.registeredSessions.clear();
  }

  /**
   * Drains directives from the queue and composes a system message string.
   *
   * Used by get_directives query handler via buildDirectivesResponse.
   * Returns both the joined message string and the raw directive array.
   *
   * @param workflowId - Optional workflow ID for per-workflow isolation.
   *   When provided, only directives with a matching workflow_id are drained.
   *   When omitted, all directives for the target are drained (backward compat).
   * @param sessionId - Optional session ID for cross-session isolation.
   *   When provided, only directives with a matching session_id (or no session_id)
   *   are drained. Directives scoped to a different session remain in the queue.
   *   When omitted, all directives are eligible regardless of session_id.
   */
  private drainDirectiveMessages(workflowId?: string, sessionId?: string): DrainResult {
    const result = this.directiveQueue?.holdDrain('subagent_stop', workflowId, sessionId)
      ?? { holdId: '', directives: [] };
    const message = result.directives
      .filter((d) => d.type === 'inject_system_message')
      .sort((a, b) => b.priority - a.priority)
      .map((d) => d.content)
      .join('\n\n');
    return { message, directives: result.directives, holdId: result.holdId };
  }

  /**
   * Build the IPC response for get_directives queries.
   * This helper centralises the drain + response-envelope construction logic.
   *
   * @param msgId - The IPC message ID to correlate the response.
   * @param agentId - Optional agent ID from the query. When provided and a
   *   resolver is registered, it is used to scope the drain to that agent's
   *   workflow, preventing cross-workflow directive delivery.
   * @param sessionId - Optional session ID from the query. When provided, only
   *   directives scoped to this session (or with no session_id) are returned.
   *   This prevents the daemon session from stealing orchestrator directives.
   */
  private buildDirectivesResponse(msgId: string, agentId?: string, sessionId?: string): ResponseEnvelope {
    let workflowId: string | undefined;
    if (agentId && this.agentWorkflowResolver) {
      const resolved = this.agentWorkflowResolver(agentId);
      if (typeof resolved === 'string' && resolved.length > 0) {
        workflowId = resolved;
      } else {
        // Agent not in any workflow — return empty, don't drain other workflows' directives
        return {
          response: {
            id: msgId,
            status: 'ok',
            data: { kind: 'system_message', message: '', directives: [] },
          },
        };
      }
    }
    const { message, directives, holdId } = this.drainDirectiveMessages(workflowId, sessionId);
    return {
      response: {
        id: msgId,
        status: 'ok',
        data: { kind: 'system_message', message, directives },
      },
      // Convert empty holdId (from empty drain) to undefined so writeResponse skips callback
      holdId: holdId || undefined,
    };
  }

  /**
   * Handle hook_event messages: emit on EventBus, evaluate triggers, write
   * session pointers, store WRFC config, and optionally route through HookProcessor.
   */
  private async handleHookEvent(msg: HookEventMessage): Promise<IPCResponse | ResponseEnvelope> {
    // Emit as the bare event type (e.g. 'agent:completed') on the EventBus.
    // The source.kind === 'internal' + hook_name field already provides traceability of hook origin.
    // Using the bare event type is required so that:
    //   1. EventProcessor trigger evaluation (e.g. 'agent:completed') can match.
    //   2. Trigger conditions in wrfc-plugin (e.g. type: 'agent:completed') can match.
    // Previously this was prefixed with 'hook:' which broke both matching paths.
    const emittedEvent: RuntimeEvent = {
      id: msg.id,
      timestamp: new Date(msg.timestamp).getTime(),
      type: msg.hook_name as EventType,
      source: { kind: 'internal', hook_name: msg.hook_name } as EventSource,
      payload: {
        type: msg.hook_name as EventType,
        data: msg.hook_input,
      } as EventPayload,
      metadata: {
        session_id: (msg.hook_input as Record<string, unknown>)?.session_id as string ?? '',
        sequence: 0,
        version: 1,
      },
      priority: 0,
    };
    this.eventBus.emit(emittedEvent);
    // Process hook event through the trigger pipeline synchronously BEFORE
    // returning the ack. This ensures WRFC directives are enqueued before
    // any subsequent get_directives query from the UPS hook.
    if (this.processHookEvent) {
      try {
        await this.processHookEvent(emittedEvent);
      } catch (err) {
        logger.warn('processHookEvent callback failed', { error: toErrorMessage(err) });
      }
    }
    // NOTE: We intentionally do NOT call triggerRegistry.evaluate() directly here.
    // WRFC triggers have actions: [] so direct evaluation does nothing useful.
    // The actual handler execution path is: EventBus → EventProcessor → TriggerRegistry.
    // Direct evaluate would increment fires_count, risking double-fire when the
    // EventProcessor evaluates the same event via the EventBus subscription.
    // Reset trigger fire counts on new session so budgets are per-session
    if (msg.hook_name === 'session:started' && this.triggerRegistry) {
      this.triggerRegistry.resetAllFireCounts();
    }
    // Handle all session:started logic in a single block
    if (msg.hook_name === 'session:started') {
      const sessionId = (msg.hook_input as Record<string, unknown>)?.session_id;
      // Clear stale WRFC state from the arriving session
      if (this.stateStore && typeof sessionId === 'string' && sessionId.length > 0) {
        const sessionKeys = this.stateStore.keys(`wrfc.sessions.${sessionId}`);
        for (const key of sessionKeys) {
          this.stateStore.delete(key);
        }
        if (sessionKeys.length > 0) {
          logger.info('Session cleanup: cleared stale WRFC state for session', {
            session_id: sessionId,
            keys_deleted: sessionKeys.length,
          });
        }
        // Also clear wrfc.sessions.default.* as a migration/safety measure for
        // state written before Fix 1 (when session_id was hardcoded to '' and
        // eventSessionId() fell back to 'default').
        const defaultKeys = this.stateStore.keys('wrfc.sessions.default');
        for (const key of defaultKeys) {
          this.stateStore.delete(key);
        }
        if (defaultKeys.length > 0) {
          logger.info('Session cleanup: cleared stale WRFC state from default namespace', {
            keys_deleted: defaultKeys.length,
          });
        }
      }
      // Clear stale pending binds from the arriving session
      if (this.agentWorkflowMap && typeof sessionId === 'string' && sessionId.length > 0) {
        this.agentWorkflowMap.clearForSession(sessionId);
      }
      // Clear directive queue to prevent stale directives from leaking across sessions.
      this.directiveQueue?.clear();
      // Write session-keyed pointer file when socketPath and stateDir are configured
      if (this.socketPath && this.stateDir && typeof sessionId === 'string' && sessionId.length > 0) {
        try {
          const pointerFile = join(this.stateDir, `runtime-${sessionId}.socket`);
          writeFileSync(pointerFile, this.socketPath, 'utf-8');
          this.registeredSessions.add(sessionId);
          logger.info('Session pointer file written', { sessionId, pointer: pointerFile });
        } catch (err) {
          logger.warn('Failed to write session pointer file', {
            sessionId,
            err: toErrorMessage(err),
          });
        }
      }
      // Time-based state cleanup: scans sockets/active (bounded by PID-namespaced filenames,
      // so the scan set is small). Runs once per session:started, not continuously.
      if (this.stateDir) {
        try {
          const { performStateCleanup } = await import('./state-cleanup.js');
          const result = performStateCleanup({
            stateDir: this.stateDir,
            archiveAfterHours: 24,
            deleteAfterHours: 168,
            livePids: new Set([process.pid]),
            liveSessions: new Set(this.registeredSessions),
            activeSocketDir: join(this.stateDir, 'sockets', 'active'),
          });
          if (result.archived > 0 || result.deleted > 0 || result.socketsRemoved > 0) {
            logger.info('State cleanup', {
              archived: result.archived,
              deleted: result.deleted,
              socketsRemoved: result.socketsRemoved,
            });
          }
          if (result.errors.length > 0) {
            logger.debug('State cleanup non-fatal errors', { errors: result.errors });
          }
        } catch (err) {
          logger.warn('State cleanup failed', { error: toErrorMessage(err) });
        }
      }
    }
    // Phase 4: Verify own socket still exists on each new session start.
    // This catches sockets deleted while the runtime was idle between sessions.
    if (msg.hook_name === 'session:started' && this.socketPath && this.onSocketLostCallback) {
      if (!existsSync(this.socketPath)) {
        logger.warn('Socket file missing at session start, triggering recreation', {
          socket: this.socketPath,
        });
        // Call on next tick to avoid blocking the hook ack
        const cb = this.onSocketLostCallback;
        setImmediate(() => cb());
      }
    }

    // Store WRFC config when config:loaded event arrives
    // goodvibes.json nests wrfc at runtime.wrfc, so navigate the full path
    if (msg.hook_name === 'config:loaded' && this.directiveQueue) {
      const input = msg.hook_input as Record<string, unknown>;
      const runtimeObj = input?.runtime as Record<string, unknown> | undefined;
      const wrfcConfig = runtimeObj?.wrfc ?? input?.wrfc; // support both nested and top-level
      if (wrfcConfig && typeof wrfcConfig === 'object' && !Array.isArray(wrfcConfig)) {
        const validated = validateWRFCConfig(wrfcConfig as Record<string, unknown>);
        if (Object.keys(validated).length > 0) {
          this.wrfcConfigStore?.set(validated);
          // Also propagate to CoreStateStore so WRFC handlers pick up the values
          if (this.stateStore) {
            if (typeof validated.min_review_score === 'number') {
              this.stateStore.set('wrfc.config.min_review_score', validated.min_review_score);
            }
            if (typeof validated.max_fix_attempts === 'number') {
              this.stateStore.set('wrfc.config.max_fix_attempts', validated.max_fix_attempts);
            }
            if (typeof validated.auto_commit === 'boolean') {
              this.stateStore.set('wrfc.config.auto_commit', validated.auto_commit);
            }
            if (Array.isArray(validated.require_review_types)) {
              this.stateStore.set('wrfc.config.require_review_types', validated.require_review_types);
            }
          }
          logger.debug('WRFC config stored from config:loaded event', { validated });
        }
      }
    }

    // Optionally route through HookProcessor
    if (this.hookProcessor) {
      try {
        const hookInput = (typeof msg.hook_input === 'object' && msg.hook_input !== null)
          ? msg.hook_input as Record<string, unknown>
          : {};
        await this.hookProcessor.process(msg.hook_name, hookInput);
      } catch (err) {
        logger.warn('IPC hook_event: HookProcessor error', {
          hookName: msg.hook_name,
          error: toErrorMessage(err),
        });
      }
    }

    return { id: msg.id, status: 'ok', data: { kind: 'ack' } };
  }

  /**
   * Handle query messages: dispatch to the appropriate query-kind handler
   * and return the typed response.
   */
  private async handleQuery(msg: QueryMessage): Promise<IPCResponse | ResponseEnvelope> {
    const q = msg.query;
    if (q.kind === 'get_directives') {
      // Extract session_id for cross-session isolation (daemon vs orchestrator).
      // When present, drain only returns directives matching this session.
      const querySessionId = typeof (q as { session_id?: string }).session_id === 'string'
        && (q as { session_id?: string }).session_id!.length > 0
        ? (q as { session_id?: string }).session_id
        : undefined;
      return this.buildDirectivesResponse(msg.id, q.agent_id, querySessionId);
    }
    if (q.kind === 'get_system_message') {
      // Return empty — get_system_message is for subagent context injection only.
      // Draining here would steal directives meant for the orchestrator's UPS hook.
      // Only explicit get_directives queries should consume the directive queue.
      return {
        response: {
          id: msg.id,
          status: 'ok',
          data: { kind: 'system_message', message: '', directives: [] },
        },
      };
    }
    if (q.kind === 'get_workflow_state') {
      const instance = this.workflowEngine?.get(q.workflow_id);
      return {
        id: msg.id,
        status: 'ok',
        data: { kind: 'workflow_state', instance: (instance ?? {}) as Record<string, unknown> },
      };
    }
    if (q.kind === 'get_agent_status') {
      const agentId = q.agent_id;
      const agent = agentId ? (this.agentCoordinator?.getAgent(agentId) ?? null) : null;
      return {
        id: msg.id,
        status: 'ok',
        data: { kind: 'agent_status', agent: (agent ?? {}) as Record<string, unknown> },
      };
    }
    if (q.kind === 'should_block_tool') {
      const toolName = (q as { tool_name?: string }).tool_name ?? '';
      const result = this.toolGateEvaluator?.evaluate(toolName) ?? { allow: true };
      return {
        id: msg.id,
        status: 'ok',
        data: { kind: 'tool_decision', allow: result.allow, reason: result.reason },
      };
    }
    if (q.kind === 'get_context_injection') {
      const result = this.contextInjector?.getContext() ?? { context: '', priority: 0 };
      return {
        id: msg.id,
        status: 'ok',
        data: { kind: 'context_injection', context: result.context, priority: result.priority },
      };
    }
    if (q.kind === 'resolve_pending_bind') {
      const agentType = q.agent_type;
      if (!agentType) {
        return { id: msg.id, status: 'ok', data: { kind: 'pending_bind', workflow_id: null } };
      }
      const sessionId = typeof q.session_id === 'string' && q.session_id.length > 0
        ? q.session_id
        : undefined;
      const workflowId = this.agentWorkflowMap?.resolvePendingBind(agentType, sessionId) ?? null;
      return { id: msg.id, status: 'ok',
        data: { kind: 'pending_bind', workflow_id: workflowId } };
    }
    if (q.kind === 'consume_pending_bind') {
      const workflowId = q.workflow_id;
      if (!workflowId) {
        return { id: msg.id, status: 'ok', data: { kind: 'pending_bind_consumed', removed: 0 } };
      }
      const removed = this.agentWorkflowMap?.consumePendingBindsForWorkflow(workflowId) ?? 0;
      return { id: msg.id, status: 'ok', data: { kind: 'pending_bind_consumed', removed } };
    }
    if (q.kind === 'get_executor_mode') {
      const mode = this.executorMode?.getMode() ?? 'engaged';
      return { id: msg.id, status: 'ok', data: { kind: 'executor_mode', mode } };
    }
    if (q.kind === 'get_executor_budget') {
      const spending = this.executorBudget?.getSpending() ?? null;
      const canProcess = this.executorBudget?.canProcess() ?? true;
      return {
        id: msg.id,
        status: 'ok',
        data: { kind: 'executor_budget', spending: spending as Record<string, unknown> | null, can_process: canProcess },
      };
    }
    if (q.kind === 'process_tick') {
      const result = await this.daemonTickHandler?.handleTick();
      return {
        id: msg.id,
        status: 'ok',
        // TickResult serialized to JSON for IPC transport — type erased intentionally
        data: { kind: 'tick_result', result: result as Record<string, unknown> | undefined },
      };
    }
    // Default: log and ack unknown queries
    logger.warn('Unhandled query kind', { kind: (q as { kind: string }).kind });
    return { id: msg.id, status: 'ok', data: { kind: 'ack' } };
  }

  /**
   * Handle state_update messages.
   *
   * State updates are not yet implemented — returns an explicit error response
   * rather than silently acknowledging the message and discarding the updates.
   */
  private handleStateUpdate(msg: StateUpdateMessage): IPCResponse {
    logger.debug('IPC state_update received (not implemented)', { id: msg.id });
    return { id: msg.id, status: 'error', error: 'state_update not yet implemented' };
  }

  /**
   * Handle heartbeat messages: return a generic acknowledgement.
   */
  private handleHeartbeat(msg: HeartbeatMessage): IPCResponse {
    return { id: msg.id, status: 'ok', data: { kind: 'ack' } };
  }

  /**
   * Route an incoming IPC message to the appropriate handler and return a
   * response. This method is bound and passed directly to IPCServer.onMessage().
   *
   * @param msg - The validated IPC message received from a hook script.
   * @returns A promise resolving to the IPCResponse to send back.
   */
  async route(msg: IPCMessage): Promise<IPCResponse | ResponseEnvelope> {
    logger.debug('IPC message received', { id: msg.id, type: msg.type });
    // Sweep stale holds on every IPC request — O(n) on held map which is typically
    // 0-2 entries. Belt-and-suspenders with watchdog sweep for periods of no IPC traffic.
    this.directiveQueue?.sweepStaleHolds(HOLD_TTL_MS);

    switch (msg.type) {
      case 'hook_event':   return this.handleHookEvent(msg);
      case 'query':        return this.handleQuery(msg);
      case 'state_update': return this.handleStateUpdate(msg);
      case 'heartbeat':    return this.handleHeartbeat(msg);
      default: {
        // Exhaustiveness guard — msg.id is still accessible via the raw object
        const anyMsg = msg as { id?: string };
        return { id: anyMsg.id ?? '', status: 'error', error: `Unknown message type` };
      }
    }
  }
}
