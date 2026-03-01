/**
 * IPCRouter — message routing for the runtime engine IPC channel.
 *
 * Encapsulates all IPC message dispatching logic, keeping RuntimeEngine
 * focused on lifecycle orchestration. Handles every message type defined
 * in the IPC protocol: hook_event, query, state_update, heartbeat.
 *
 * NOTE: This module has a known layer violation — it resides in shared/ (L0)
 * but imports types from extensions/ (L2) and plugins/ (L3). This is because
 * the IPC router needs to dispatch to extension and plugin subsystems.
 * Moving to extensions/ipc/ is planned but deferred to avoid import churn.
 */

import type { ResponseEnvelope } from './ipc-server.js';
import { HOLD_TTL_MS } from '../../extensions/directives/directive-queue.js';
import type { EventBus } from '../../extensions/events/event-bus.js';
import type { EventType, EventSource, EventPayload, RuntimeEvent } from '../../extensions/events/types.js';
import type { TriggerRegistry } from '../../extensions/triggers/trigger-registry.js';
import type { WorkflowEngine } from '../../extensions/workflow/workflow-engine.js';
import type { AgentCoordinator } from '../../extensions/agents/agent-coordinator.js';
import type { DirectiveQueue } from '../../extensions/directives/directive-queue.js';
import type { WRFCConfigStore } from '../../extensions/directives/wrfc-config-store.js';
import type { AgentWorkflowMap } from '../../extensions/directives/agent-workflow-map.js';
import type { IPCMessage, IPCResponse, Directive } from './protocol.js';
import type { HookProcessor } from '../../plugins/hooks/hook-processor.js';
import type { ExecutorModeManager } from '../../core/processing/executor-mode.js';
import type { ExecutorBudgetManager } from '../../extensions/executor/executor-budget.js';
import type { DaemonTickHandler } from '../../extensions/executor/daemon-tick-handler.js';
import { createLogger } from '../logger.js';
import { toErrorMessage } from '../utils.js';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const logger = createLogger('ipc-router');

/**
 * Build a RuntimeEvent for a hook_event IPC message.
 *
 * Centralises the type assertions required to construct a hook event from raw
 * IPC data into a single helper. The `as EventType`/`as EventSource`/`as
 * EventPayload` casts are unavoidable because hook names are dynamic strings
 * that are not statically enumerable in the EventType union; they are isolated
 * here so call sites carry no casts.
 *
 * @param hookName    - The hook name from the IPC message (e.g. 'pre_tool_use').
 * @param hookInput   - The raw hook input payload from Claude Code.
 * @param sessionId   - Optional session ID to embed in event metadata.
 * @returns A fully-formed RuntimeEvent ready for EventBus emission.
 */
function buildHookEvent(
  hookName: string,
  hookInput: Record<string, unknown>,
  options: { id?: string; timestamp?: string; sessionId?: string } = {},
): RuntimeEvent {
  const type = `hook:${hookName}` as EventType;
  return {
    id: options.id ?? `hook-${hookName}-${Date.now()}`,
    timestamp: options.timestamp ?? new Date().toISOString(),
    type,
    source: { kind: 'hook', hook_name: hookName } as EventSource,
    payload: { type, data: hookInput } as EventPayload,
    metadata: {
      session_id: options.sessionId ?? '',
      sequence: 0,
      version: 1,
    },
  };
}

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
  /**
   * Optional HookProcessor. When provided, hook_event messages are also
   * routed through it, bridging hook events to the plugin layer.
   * Falls back to EventBus-only handling when null.
   */
  hookProcessor?: HookProcessor | null;
  /** Executor mode manager for get_executor_mode queries. */
  executorMode?: ExecutorModeManager | null;
  /** Executor budget manager for get_executor_budget queries. */
  executorBudget?: ExecutorBudgetManager | null;
  /** Daemon tick handler for process_tick queries. */
  daemonTickHandler?: DaemonTickHandler | null;
}

/** Return type for {@link IPCRouter.drainDirectiveMessages}. */
type DrainResult = { message: string; directives: Directive[]; holdId: string };

/**
 * Extracts a non-empty string field from an object by key.
 * Returns an empty string if the field is absent, not a string, or empty.
 * @returns The string value, or `''` (falsy sentinel) when absent or invalid.
 */
function getStringField(obj: Record<string, unknown>, key: string): string {
  const value = obj[key];
  return typeof value === 'string' ? value : '';
}

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
  /** Optional HookProcessor for bridging hook events to the plugin layer. */
  private readonly hookProcessor: HookProcessor | null;
  /** Optional ExecutorModeManager for get_executor_mode queries. */
  private readonly executorMode: ExecutorModeManager | null;
  /** Optional ExecutorBudgetManager for get_executor_budget queries. */
  private readonly executorBudget: ExecutorBudgetManager | null;
  /** Optional DaemonTickHandler for process_tick queries. */
  private readonly daemonTickHandler: DaemonTickHandler | null;
  private readonly wrfcConfigStore: WRFCConfigStore | null;

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
    this.hookProcessor = deps.hookProcessor ?? null;
    this.executorMode = deps.executorMode ?? null;
    this.executorBudget = deps.executorBudget ?? null;
    this.daemonTickHandler = deps.daemonTickHandler ?? null;
    this.wrfcConfigStore = deps.wrfcConfigStore ?? null;
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
   * Shared by get_directives and get_system_message query handlers.
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
   * Build the IPC response for directive-query kinds (get_directives,
   * get_system_message). Both query kinds are semantically equivalent
   * and return the same payload; this helper centralises that logic.
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
    // Extract id before type-narrowing guards reduce msg to 'never'
    const msgId = msg.id;

    if (msg.type === 'hook_event') {
      // Emit as a hook:* event on the EventBus
      const emittedEvent = buildHookEvent(msg.hook_name, msg.hook_input, { id: msg.id, timestamp: msg.timestamp });
      this.eventBus.emit(emittedEvent);
      // Await trigger evaluation so directives are enqueued before the hook's follow-up query
      if (this.triggerRegistry) {
        try {
          await this.triggerRegistry.evaluate(emittedEvent);
        } catch (err) {
          logger.warn('IPC hook_event: trigger evaluation error', {
            error: toErrorMessage(err),
          });
        }
      }
      // Reset trigger fire counts on new session so budgets are per-session
      if (msg.hook_name === 'session:started' && this.triggerRegistry) {
        this.triggerRegistry.resetAllFireCounts();
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
          const validated: Record<string, unknown> = {};
          const raw = wrfcConfig as Record<string, unknown>;

          if (typeof raw.min_review_score === 'number' && raw.min_review_score >= 0 && raw.min_review_score <= 10) {
            validated.min_review_score = raw.min_review_score;
          } else if (raw.min_review_score !== undefined) {
            logger.warn('Invalid min_review_score rejected', { value: raw.min_review_score, expected: 'number 0-10' });
          }
          if (typeof raw.max_fix_attempts === 'number' && Number.isInteger(raw.max_fix_attempts) && raw.max_fix_attempts > 0) {
            validated.max_fix_attempts = raw.max_fix_attempts;
          } else if (raw.max_fix_attempts !== undefined) {
            logger.warn('Invalid max_fix_attempts rejected', { value: raw.max_fix_attempts, expected: 'positive integer' });
          }
          if (typeof raw.auto_commit === 'boolean') {
            validated.auto_commit = raw.auto_commit;
          } else if (raw.auto_commit !== undefined) {
            logger.warn('Invalid auto_commit rejected', { value: raw.auto_commit, expected: 'boolean' });
          }
          if (Array.isArray(raw.require_review_types) && (raw.require_review_types as unknown[]).every((t: unknown) => typeof t === 'string' && (t as string).length > 0)) {
            validated.require_review_types = raw.require_review_types;
          } else if (raw.require_review_types !== undefined) {
            logger.warn('Invalid require_review_types rejected', { value: raw.require_review_types, expected: 'string[]' });
          }

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

    if (msg.type === 'query') {
      const q = msg.query;
      if (q.kind === 'get_directives' || q.kind === 'get_system_message') {
        const agentId = q.kind === 'get_directives' ? q.agent_id : undefined;
        return this.buildDirectivesResponse(msg.id, agentId);
      }
      if (q.kind === 'get_workflow_state') {
        const instance = this.workflowEngine?.get(q.workflow_id);
        return {
          id: msg.id,
          status: 'ok',
          data: { kind: 'workflow_state', instance: (instance ?? {}) as Record<string, unknown> },
        };
      }
      if (q.kind === 'should_block_tool') {
        return {
          id: msg.id,
          status: 'ok',
          data: { kind: 'tool_decision', allow: true },
        };
      }
      if (q.kind === 'resolve_pending_bind') {
        const agentType = getStringField(q, 'agent_type');
        if (!agentType) {
          return { id: msg.id, status: 'ok', data: { kind: 'pending_bind', workflow_id: null } };
        }
        const workflowId = this.agentWorkflowMap?.resolvePendingBind(agentType) ?? null;
        return { id: msg.id, status: 'ok', data: { kind: 'pending_bind', workflow_id: workflowId } };
      }
      if (q.kind === 'consume_pending_bind') {
        const workflowId = getStringField(q, 'workflow_id');
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
      logger.warn('Unhandled query kind', { kind: q.kind });
      return { id: msg.id, status: 'ok', data: { kind: 'ack' } };
    }

    if (msg.type === 'heartbeat') {
      return { id: msg.id, status: 'ok', data: { kind: 'ack' } };
    }

    if (msg.type === 'state_update') {
      logger.debug('IPC state_update received', { id: msg.id });
      return { id: msg.id, status: 'ok', data: { kind: 'ack' } };
    }

    return { id: msgId, status: 'ok', data: { kind: 'ack' } };
  }
}
