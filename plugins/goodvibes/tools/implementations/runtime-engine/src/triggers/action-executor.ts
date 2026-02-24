/**
 * Action Executor
 *
 * Executes trigger actions when their conditions are met. Supports emitting
 * events, invoking named handlers, workflow stubs, and composite (parallel /
 * sequence) action trees. Template values in action payloads are resolved
 * against the triggering event before execution.
 */

import { generateEventId, timestamp, toErrorMessage } from '../shared/utils.js';
import { createLogger } from '../shared/logger.js';
import type { RuntimeEvent, EventType } from '../events/types.js';
import type { EventBus } from '../events/event-bus.js';
import type { DirectiveQueue } from '../directives/directive-queue.js';
import type { WorkflowEngine } from '../workflow/workflow-engine.js';
import { buildSpawnDirectiveMessage } from '../directives/directive-builder.js';
import type {
  TriggerAction,
  TriggerActionHandler,
  EmitEventAction,
  SpawnAgentAction,
  InvokeHandlerAction,
  WorkflowAction,
  CompositeAction,
} from './types.js';

const log = createLogger('action-executor');

/** Path segments that must never be resolved in event templates. */
const DENIED_PATH_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

/** Result of a single action execution. */
interface ActionResult {
  success: boolean;
  error?: string;
}

/**
 * Resolves `$event.*` template references in a string value.
 *
 * Supported references:
 * - `$event.id`              → event.id
 * - `$event.type`            → event.type
 * - `$event.timestamp`       → event.timestamp
 * - `$event.payload.data.*`  → event.payload.data property path
 *
 * @param value - The string potentially containing `$event.*` references.
 * @param event - The triggering event.
 * @returns The resolved string, or the original if no references found.
 */
function resolveStringTemplate(value: string, event: RuntimeEvent): string {
  return value.replace(/\$event\.([\w.]+)/g, (_match, path: string) => {
    const parts = path.split('.');
    // Block prototype chain traversal
    if (parts.some(part => DENIED_PATH_SEGMENTS.has(part))) {
      log.warn('Blocked prototype chain traversal attempt in template', { path, template: value });
      return '';
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let current: unknown = event;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return '';
      }
      current = (current as Record<string, unknown>)[part];
    }
    // FIX-TRACE-C: Returns '' (empty string) for missing/null/object fields.
    // Handlers using ?? fallback chains should use || instead if they need to
    // fall through on empty strings (since ?? only checks null/undefined).
    if (current === undefined || current === null) {
      log.debug('Template reference resolved to null/undefined', { path, template: value });
      return '';
    }
    if (typeof current === 'object') {
      log.debug('Template reference resolved to object (not serializable)', { path, template: value });
      return '';
    }
    return String(current);
  });
}

/**
 * Deep-clones a template object and resolves all `$event.*` string references.
 *
 * Non-string values are copied as-is. Array values are resolved element-by-element.
 * No eval() — explicit property path walking only.
 *
 * @param template - The template object to resolve.
 * @param event - The triggering event used to resolve references.
 * @returns A new object with all string values resolved.
 */
function resolveTemplate(
  template: Record<string, unknown>,
  event: RuntimeEvent,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(template)) {
    result[key] = resolveValue(value, event);
  }
  return result;
}

/** Recursively resolves a single template value. */
function resolveValue(value: unknown, event: RuntimeEvent): unknown {
  if (typeof value === 'string') {
    return resolveStringTemplate(value, event);
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveValue(item, event));
  }
  if (value !== null && typeof value === 'object') {
    return resolveTemplate(value as Record<string, unknown>, event);
  }
  return value;
}

/**
 * Executes trigger actions when conditions are met.
 *
 * All dependencies are injected via the constructor. Register named
 * handlers via `registerHandler` before any triggers that use `invoke_handler`.
 */
export class ActionExecutor {
  /** Named handler registry. */
  private readonly handlers: Map<string, TriggerActionHandler> = new Map();
  /** Event bus for emit_event actions. */
  private readonly eventBus: EventBus | null;
  /** Directive queue for spawn_agent and workflow actions. */
  private readonly directiveQueue: DirectiveQueue | null;
  /** Workflow engine for start_workflow and send_workflow_event actions. */
  private readonly workflowEngine: WorkflowEngine | null;

  /**
   * @param eventBus - The shared EventBus instance, or null if not available.
   * @param directiveQueue - The shared DirectiveQueue instance, or null if not available.
   * @param workflowEngine - The shared WorkflowEngine instance, or null if not available.
   */
  constructor(
    eventBus: EventBus | null = null,
    directiveQueue: DirectiveQueue | null = null,
    workflowEngine: WorkflowEngine | null = null,
  ) {
    this.eventBus = eventBus;
    this.directiveQueue = directiveQueue;
    this.workflowEngine = workflowEngine;
  }

  /**
   * Registers a named action handler.
   *
   * @param name - The handler name used in `InvokeHandlerAction.handler`.
   * @param handler - The async function to invoke.
   */
  registerHandler(name: string, handler: TriggerActionHandler): void {
    this.handlers.set(name, handler);
  }

  /**
   * Executes a trigger action.
   *
   * All errors are caught and returned as `{ success: false, error }` rather
   * than thrown, so a failing action does not propagate to the registry.
   *
   * @param action - The action to execute.
   * @param event - The event that triggered this action.
   * @returns Execution result.
   */
  async execute(action: TriggerAction, event: RuntimeEvent): Promise<ActionResult> {
    try {
      switch (action.type) {
        case 'emit_event':
          return await this.executeEmitEvent(action, event);
        case 'spawn_agent':
          return await this.executeSpawnAgent(action, event);
        case 'invoke_handler':
          return await this.executeInvokeHandler(action, event);
        case 'start_workflow':
        case 'send_workflow_event':
          return await this.executeWorkflowAction(action, event);
        case 'parallel':
          return await this.executeParallel(action, event);
        case 'sequence':
          return await this.executeSequence(action, event);
        default: {
          const exhaustiveCheck: never = action;
          return { success: false, error: `Unknown action type: ${String((exhaustiveCheck as TriggerAction).type)}` };
        }
      }
    } catch (err) {
      const message = toErrorMessage(err);
      log.error('Action execution threw unexpected error', { error: message });
      return { success: false, error: message };
    }
  }

  /**
   * Emits a runtime event via the EventBus with resolved template payload.
   */
  private async executeEmitEvent(action: EmitEventAction, event: RuntimeEvent): Promise<ActionResult> {
    if (!this.eventBus) {
      return { success: false, error: 'EventBus not provided — pass it via the constructor' };
    }

    const resolvedPayload = resolveTemplate(action.payload_template, event);

    this.eventBus.emit({
      id: generateEventId(),
      timestamp: timestamp(),
      type: action.event_type as EventType,
      source: { kind: 'trigger', trigger_id: event.id },
      payload: {
        type: action.event_type,
        data: resolvedPayload,
      } as RuntimeEvent['payload'],
      metadata: {
        causation_id: event.id,
        correlation_id: event.metadata?.correlation_id,
        session_id: event.metadata?.session_id,
        sequence: 0, // Will be overwritten by EventBus
        version: 1,
      },
    });

    log.debug('emit_event action executed', { event_type: action.event_type });
    return { success: true };
  }

  /**
   * Enqueues a spawn-agent directive into the DirectiveQueue so a hook can
   * inject the system message into Claude's context.
   */
  private async executeSpawnAgent(action: SpawnAgentAction, event: RuntimeEvent): Promise<ActionResult> {
    const resolvedTask = resolveStringTemplate(action.task_template, event);

    if (!this.directiveQueue) {
      log.warn('spawn_agent action: directiveQueue not set — logging intent only', {
        agent_type: action.agent_type,
        task: resolvedTask,
        triggered_by: event.id,
      });
      return { success: true };
    }

    const message = buildSpawnDirectiveMessage(
      action.agent_type,
      resolvedTask,
      action.budget,
    );

    this.directiveQueue.enqueue('subagent_stop', {
      type: 'inject_system_message',
      content: message,
      priority: 10,
      source: 'action-executor:spawn_agent',
    });

    log.info('spawn_agent action: directive enqueued', {
      agent_type: action.agent_type,
      task: resolvedTask,
      triggered_by: event.id,
    });
    return { success: true };
  }

  /**
   * Invokes a named handler registered via `registerHandler`.
   */
  private async executeInvokeHandler(action: InvokeHandlerAction, event: RuntimeEvent): Promise<ActionResult> {
    const handler = this.handlers.get(action.handler);
    if (!handler) {
      return { success: false, error: `Handler '${action.handler}' not registered` };
    }

    const resolvedArgs = resolveTemplate(action.args_template, event);
    await handler(resolvedArgs, event);
    log.debug('invoke_handler action executed', { handler: action.handler });
    return { success: true };
  }

  /**
   * Executes a workflow action — starts a workflow or sends an event to active workflows.
   */
  private async executeWorkflowAction(action: WorkflowAction, event: RuntimeEvent): Promise<ActionResult> {
    const resolvedContext = action.context_template
      ? resolveTemplate(action.context_template, event)
      : {};

    if (!this.workflowEngine) {
      log.info('workflow action: workflowEngine not set — logging intent only', {
        action_type: action.type,
        workflow_definition: action.workflow_definition,
        context: resolvedContext,
        triggered_by: event.id,
      });
      return { success: true };
    }

    if (action.type === 'start_workflow') {
      if (!action.workflow_definition) {
        return { success: false, error: 'start_workflow: workflow_definition is required' };
      }
      try {
        const instance = this.workflowEngine.create(
          action.workflow_definition,
          resolvedContext,
        );
        log.info('start_workflow action: workflow created', {
          definition: action.workflow_definition,
          instance_id: instance.id,
          triggered_by: event.id,
        });
      } catch (err) {
        const message = toErrorMessage(err);
        log.error('start_workflow action: failed to create workflow', { error: message });
        return { success: false, error: message };
      }
      return { success: true };
    }

    if (action.type === 'send_workflow_event') {
      const activeWorkflows = this.workflowEngine.listActive();
      let sentCount = 0;
      for (const instance of activeWorkflows) {
        try {
          this.workflowEngine.sendEvent(instance.id, event);
          sentCount++;
        } catch (err) {
          log.warn('send_workflow_event: failed to send to workflow', {
            workflow_id: instance.id,
            error: toErrorMessage(err),
          });
        }
      }
      log.info('send_workflow_event action: sent to active workflows', {
        count: sentCount,
        triggered_by: event.id,
      });
      return { success: true };
    }

    return { success: false, error: `Unknown workflow action type: ${String(action.type)}` };
  }

  /**
   * Executes all actions in parallel via `Promise.all`.
   * Returns success only if all actions succeed.
   */
  private async executeParallel(action: CompositeAction, event: RuntimeEvent): Promise<ActionResult> {
    const results = await Promise.all(
      action.actions.map((a) => this.execute(a, event)),
    );
    const failed = results.filter((r) => !r.success);
    if (failed.length > 0) {
      return {
        success: false,
        error: `${failed.length} of ${results.length} parallel actions failed: ${failed.map((r) => r.error).join('; ')}`,
      };
    }
    return { success: true };
  }

  /**
   * Executes actions sequentially, stopping on the first failure.
   */
  private async executeSequence(action: CompositeAction, event: RuntimeEvent): Promise<ActionResult> {
    for (const subAction of action.actions) {
      const result = await this.execute(subAction, event);
      if (!result.success) {
        return result;
      }
    }
    return { success: true };
  }
}
