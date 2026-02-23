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
import type { IPCMessage, IPCResponse } from './protocol.js';
import { createLogger } from '../shared/logger.js';
import { toErrorMessage } from '../shared/utils.js';

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

  constructor(deps: IPCRouterDeps) {
    this.eventBus = deps.eventBus;
    this.triggerRegistry = deps.triggerRegistry;
    this.workflowEngine = deps.workflowEngine;
    this.agentCoordinator = deps.agentCoordinator;
    this.directiveQueue = deps.directiveQueue;
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
      return { id: msg.id, status: 'ok', data: { kind: 'ack' } };
    }

    if (msg.type === 'query') {
      const q = msg.query;
      if (q.kind === 'get_directives') {
        const directives = this.directiveQueue?.drain('subagent_stop') ?? [];
        const message = directives
          .filter((d) => d.type === 'inject_system_message')
          .sort((a, b) => b.priority - a.priority)
          .map((d) => d.content)
          .join('\n\n');
        return {
          id: msg.id,
          status: 'ok',
          data: { kind: 'system_message', message, directives },
        };
      }
      if (q.kind === 'get_system_message') {
        // Also drain directives for system_message queries
        const directives = this.directiveQueue?.drain('subagent_stop') ?? [];
        const directiveMessage = directives
          .filter((d) => d.type === 'inject_system_message')
          .sort((a, b) => b.priority - a.priority)
          .map((d) => d.content)
          .join('\n\n');
        return {
          id: msg.id,
          status: 'ok',
          data: { kind: 'system_message', message: directiveMessage, directives },
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
      // Default: ack unknown queries
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
