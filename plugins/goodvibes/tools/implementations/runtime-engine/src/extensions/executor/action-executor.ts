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

/** Parameters shape for the 'send_message' action type. */
export interface SendMessageParams {
  content: string;
  priority?: number;
  target?: string;
}

const logger = createLogger('action-executor');

export class ActionExecutor implements ActionExecutorInterface {
  constructor(private readonly directiveQueue: DirectiveQueue) {}

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

        const directive: Directive = {
          type: 'inject_system_message',
          content,
          priority,
          source: 'wrfc',
          ...(workflowId !== undefined && { workflow_id: workflowId }),
        };

        try {
          this.directiveQueue.enqueue(target, directive);
          logger.info('ActionExecutor: directive enqueued successfully', {
            target,
            priority,
            workflow_id: workflowId,
            content_length: content.length,
          });
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
