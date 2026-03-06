/**
 * Action Executor — Extensions Layer
 *
 * Translates Action objects from handler results into DirectiveQueue
 * enqueues, bridging the plugin pipeline to the directive delivery system.
 *
 * The primary action type handled is 'send_message', which is produced by the
 * WRFC plugin's directive-builder. The action payload contains the directive
 * content and metadata; this executor maps it to a Directive and enqueues it
 * to the DirectiveQueue for delivery via the IPC layer.
 */
import { createLogger } from '../../shared/logger.js';
import type { Action, ActionExecutorInterface } from '../../core/types.js';
import type { DirectiveQueue } from '../directives/directive-queue.js';
import type { Directive } from '../../shared/ipc/protocol.js';
import type { AgentWorkflowMap } from '../directives/agent-workflow-map.js';

/** Parameters shape for the 'send_message' action type. */
export interface SendMessageParams {
  content: string;
  priority?: number;
  target?: string;
  /** Agent type for pending bind registration (set by buildSpawnAction). */
  agent_type?: string;
}

const logger = createLogger('action-executor');

export class ActionExecutor implements ActionExecutorInterface {
  constructor(
    private readonly directiveQueue: DirectiveQueue,
    private readonly agentWorkflowMap?: AgentWorkflowMap | null,
  ) {}

  async execute(action: Action, context: Record<string, unknown>): Promise<void> {
    switch (action.type) {
      case 'send_message': {
        // Action shape from directive-builder.ts:
        // { type: 'send_message', params: { content: string, priority: number, target: string } }
        const params = action.params as unknown as SendMessageParams;

        const content = params.content;
        const target = typeof params.target === 'string' ? params.target : 'subagent_stop';
        const priority = typeof params.priority === 'number' ? params.priority : 20;

        if (typeof content !== 'string' || content.length === 0) {
          logger.error('ActionExecutor: send_message action missing content', {
            action_type: action.type,
            params_keys: Object.keys(action.params || {}),
            context,
          });
          return;
        }

        const workflowId =
          typeof context['workflow_id'] === 'string' ? context['workflow_id'] : undefined;
        const sessionId =
          typeof context['session_id'] === 'string' && context['session_id'].length > 0
            ? context['session_id']
            : 'default';

        const directive: Directive = {
          type: 'inject_system_message',
          content,
          priority,
          source: 'wrfc',
          ...(workflowId !== undefined && { workflow_id: workflowId }),
          // Tag with session_id (non-'default') so drain can scope delivery
          // to only the session that originated this directive, preventing the
          // daemon session from stealing orchestrator-bound directives.
          ...(sessionId !== 'default' && { session_id: sessionId }),
        };

        try {
          this.directiveQueue.enqueue(target, directive);
          logger.info('ActionExecutor: directive enqueued successfully', {
            target,
            priority,
            workflow_id: workflowId,
            content_length: content.length,
          });

          // Register pending binds so SubagentStart can resolve this spawn
          // to the correct workflow via PRIORITY 2 (pending bind queue).
          // Must happen AFTER enqueue so directive exists when agent starts.
          if (this.agentWorkflowMap && params.agent_type && workflowId) {
            const agentType = params.agent_type;
            this.agentWorkflowMap.addPendingBind(agentType, workflowId, sessionId);
            // Also register goodvibes: prefixed variant for normalized matching
            if (!agentType.startsWith('goodvibes:')) {
              this.agentWorkflowMap.addPendingBind(`goodvibes:${agentType}`, workflowId, sessionId);
            }
            logger.info('ActionExecutor: pending binds registered for spawn', {
              agent_type: agentType,
              workflow_id: workflowId,
            });
          }
        } catch (err) {
          logger.error('ActionExecutor: failed to enqueue directive', {
            target,
            priority,
            workflow_id: workflowId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        break;
      }

      default: {
        logger.warn('ActionExecutor: unhandled action type', {
          type: action.type,
          context,
        });
        break;
      }
    }
  }
}
