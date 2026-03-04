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
import { createLogger } from '../../shared/logger.js';
import { toErrorMessage } from '../../shared/utils.js';
import { writeFileSync, unlinkSync } from 'node:fs';
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
  /**
   * Optional callback invoked synchronously (awaited) inside handleHookEvent,
   * BEFORE the IPC ack is returned. When provided, the hook event is processed
   * through the trigger pipeline in-band so that any enqueued WRFC directives
   * are available when the subsequent get_directives query arrives.
   */
  processHookEvent?: (event: RuntimeEvent) => Promise<void>;
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
  private readonly wrfcConfigStore: WRFCConfigStore | null;
  /** Optional callback for synchronous in-band hook event processing. */
  private readonly processHookEvent: ((event: RuntimeEvent) => Promise<void>) | null;

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
    this.wrfcConfigStore = deps.wrfcConfigStore ?? null;
    this.processHookEvent = deps.processHookEvent ?? null;
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
   */
  private drainDirectiveMessages(workflowId?: string): DrainResult {
    const result = this.directiveQueue?.holdDrain('subagent_stop', workflowId)
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
   */
  private buildDirectivesResponse(msgId: string, agentId?: string): ResponseEnvelope {
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
    const { message, directives, holdId } = this.drainDirectiveMessages(workflowId);
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
        session_id: '',
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
    // Clear stale WRFC state from the arriving session
    if (msg.hook_name === 'session:started') {
      const sessionId = (msg.hook_input as Record<string, unknown>)?.session_id;
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
      }
      // Clear stale pending binds from the arriving session
      if (this.agentWorkflowMap && typeof sessionId === 'string' && sessionId.length > 0) {
        this.agentWorkflowMap.clearForSession(sessionId);
      }
    }
    // Write session-keyed pointer file when session:started arrives
    if (msg.hook_name === 'session:started' && this.socketPath && this.stateDir) {
      const sessionId = (msg.hook_input as Record<string, unknown>)?.session_id;
      if (typeof sessionId === 'string' && sessionId.length > 0) {
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
    }
    // Store WRFC config when config:loaded event arrives
    if (msg.hook_name === 'config:loaded' && this.directiveQueue) {
      const wrfcConfig = (msg.hook_input as Record<string, unknown>)?.wrfc;
      if (wrfcConfig && typeof wrfcConfig === 'object' && !Array.isArray(wrfcConfig)) {
        const validated = validateWRFCConfig(wrfcConfig as Record<string, unknown>);
        if (Object.keys(validated).length > 0) {
          this.wrfcConfigStore?.set(validated);
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
      return this.buildDirectivesResponse(msg.id, q.agent_id);
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
      return {
        id: msg.id,
        status: 'ok',
        data: { kind: 'tool_decision', allow: true },
      };
    }
    if (q.kind === 'get_context_injection') {
      // Not yet wired — return an explicit empty context rather than silently acking
      return {
        id: msg.id,
        status: 'ok',
        data: { kind: 'context_injection', context: '', priority: 0 },
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
