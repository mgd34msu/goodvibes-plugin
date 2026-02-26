/**
 * IPCRouter — message routing for the runtime engine IPC channel.
 *
 * Encapsulates all IPC message dispatching logic, keeping ProcessManager
 * focused on lifecycle orchestration. Handles every message type defined
 * in the IPC protocol: hook_event, query, state_update, heartbeat.
 */

import type { EventBus } from '../events/event-bus.js';
import type { EventType, EventSource, EventPayload, RuntimeEvent } from '../events/types.js';
import type { TriggerRegistry } from '../triggers/trigger-registry.js';
import type { WorkflowEngine } from '../workflow/workflow-engine.js';
import type { AgentCoordinator } from '../agents/agent-coordinator.js';
import type { DirectiveQueue } from '../directives/directive-queue.js';
import type { AgentWorkflowMap } from '../directives/agent-workflow-map.js';
import type { IPCMessage, IPCResponse } from './protocol.js';
import type { HookProcessor } from '../plugins/hooks/hook-processor.js';
import { createLogger } from '../shared/logger.js';
import { toErrorMessage } from '../shared/utils.js';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const logger = createLogger('ipc-router');

/**
 * Dependencies injected into the IPCRouter at construction time.
 * All fields are optional to mirror the nullable state of ProcessManager's
 * subsystems — routing degrades gracefully when a subsystem is disabled.
 */
export interface IPCRouterDeps {
  eventBus: EventBus;
  triggerRegistry: TriggerRegistry | null;
  workflowEngine: WorkflowEngine | null;
  agentCoordinator: AgentCoordinator | null;
  directiveQueue: DirectiveQueue | null;
  /** Absolute path to the IPC socket file. Used to write session-keyed pointer files. */
  socketPath: string | null;
  /** Absolute path to the .goodvibes/state/ directory. */
  stateDir: string | null;
  /** Agent-to-workflow binding map — used by resolve_pending_bind queries. */
  agentWorkflowMap?: AgentWorkflowMap | null;
  /**
   * Optional v3 HookProcessor. When provided, hook_event messages are also
   * routed through it, bridging the v2 EventBus path with the v3 plugin layer.
   * Falls back to EventBus-only handling when null.
   */
  hookProcessor?: HookProcessor | null;
}

/**
 * Routes IPC messages from hook scripts to the appropriate runtime engine
 * subsystem and returns the corresponding response.
 *
 * This class is a pure extraction of the routing logic that previously lived
 * inside ProcessManager.startIPCServer(). No behaviour has changed.
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
  /** Optional v3 HookProcessor for bridging hook events to the plugin layer. */
  private readonly hookProcessor: HookProcessor | null;

  /** Session IDs that have been registered via session:started events. */
  private readonly registeredSessions: Set<string> = new Set();

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
   */
  private drainDirectiveMessages(): { message: string; directives: ReturnType<NonNullable<DirectiveQueue>['drain']> } {
    const directives = this.directiveQueue?.drain('subagent_stop') ?? [];
    const message = directives
      .filter((d) => d.type === 'inject_system_message')
      .sort((a, b) => b.priority - a.priority)
      .map((d) => d.content)
      .join('\n\n');
    return { message, directives };
  }

  /**
   * Route an incoming IPC message to the appropriate handler and return a
   * response. This method is bound and passed directly to IPCServer.onMessage().
   *
   * @param msg - The validated IPC message received from a hook script.
   * @returns A promise resolving to the IPCResponse to send back.
   */
  async route(msg: IPCMessage): Promise<IPCResponse> {
    logger.debug('IPC message received', { id: msg.id, type: msg.type });

    if (msg.type === 'hook_event') {
      // Emit as a hook:* event on the EventBus
      const emittedEvent: RuntimeEvent = {
        id: msg.id,
        timestamp: msg.timestamp,
        type: `hook:${msg.hook_name}` as EventType,
        source: { kind: 'hook', hook_name: msg.hook_name } as EventSource,
        payload: {
          type: `hook:${msg.hook_name}` as EventType,
          data: msg.hook_input,
        } as EventPayload,
        metadata: {
          sequence: 0,
          version: 1,
        },
      };
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

          if (Object.keys(validated).length > 0) {
            this.directiveQueue.setWRFCConfig(validated);
            logger.debug('WRFC config stored from config:loaded event', { validated });
          }
        }
      }

      // Optionally route through v3 HookProcessor (bridge v2→v3)
      if (this.hookProcessor) {
        try {
          const hookInput = (typeof msg.hook_input === 'object' && msg.hook_input !== null)
            ? msg.hook_input as Record<string, unknown>
            : {};
          await this.hookProcessor.process(msg.hook_name, hookInput);
        } catch (err) {
          logger.warn('IPC hook_event: v3 HookProcessor error', {
            hookName: msg.hook_name,
            error: toErrorMessage(err),
          });
        }
      }

      return { id: msg.id, status: 'ok', data: { kind: 'ack' } };
    }

    if (msg.type === 'query') {
      const q = msg.query;
      if (q.kind === 'get_directives') {
        const { message, directives } = this.drainDirectiveMessages();
        return {
          id: msg.id,
          status: 'ok',
          data: { kind: 'system_message', message, directives },
        };
      }
      if (q.kind === 'get_system_message') {
        const { message, directives } = this.drainDirectiveMessages();
        return {
          id: msg.id,
          status: 'ok',
          data: { kind: 'system_message', message, directives },
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
      if (q.kind === 'should_block_tool') {
        return {
          id: msg.id,
          status: 'ok',
          data: { kind: 'tool_decision', allow: true },
        };
      }
      if (q.kind === 'resolve_pending_bind') {
        const agentType = typeof q.agent_type === 'string' ? q.agent_type : '';
        if (!agentType) {
          return { id: msg.id, status: 'ok', data: { kind: 'pending_bind', workflow_id: null } };
        }
        const workflowId = this.agentWorkflowMap?.resolvePendingBind(agentType) ?? null;
        return { id: msg.id, status: 'ok', data: { kind: 'pending_bind', workflow_id: workflowId } };
      }
      // Default: log and ack unknown queries
      logger.warn('Unhandled query kind', { kind: q.kind });
      return { id: msg.id, status: 'ok', data: { kind: 'ack' } };
    }

    if (msg.type === 'heartbeat') {
      return { id: msg.id, status: 'ok', data: { kind: 'ack' } };
    }

    if (msg.type === 'state_update') {
      return { id: msg.id, status: 'ok', data: { kind: 'ack' } };
    }

    return { id: msg.id, status: 'ok', data: { kind: 'ack' } };
  }
}
