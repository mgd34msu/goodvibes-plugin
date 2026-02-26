/**
 * SubagentStart Handler
 *
 * Registers the spawning agent and resolves any pending WRFC workflow bindings
 * by injecting additionalContext into the agent's system prompt.
 */

import type { HookEvent } from '../../../extensions/events/hook-event.js';
import type { ClaudeHookResponse } from '../hook-processor.js';
import type { AgentWorkflowMap } from '../../../directives/agent-workflow-map.js';
import { createLogger } from '../../../shared/logger.js';

const logger = createLogger('handler:subagent-start');

export interface SubagentStartDeps {
  agentWorkflowMap: AgentWorkflowMap | null;
}

/**
 * Creates a SubagentStart handler.
 *
 * Resolves pending bind queue entries: when an orchestrator pre-registered a
 * workflow binding for an agent type, the binding is injected as additionalContext
 * so the spawned agent knows which workflow it belongs to.
 */
export function createSubagentStartHandler(
  deps: SubagentStartDeps,
): (event: HookEvent, input: Record<string, unknown>) => Promise<ClaudeHookResponse | null> {
  return async function handleSubagentStart(
    _event: HookEvent,
    input: Record<string, unknown>,
  ): Promise<ClaudeHookResponse | null> {
    const agentId = typeof input['agent_id'] === 'string' ? input['agent_id'] : null;
    const agentType = typeof input['agent_type'] === 'string' ? input['agent_type'] : null;

    logger.debug('SubagentStart', { agentId, agentType });

    if (!agentType || !deps.agentWorkflowMap) {
      return null;
    }

    // Resolve pending workflow binding for this agent type
    const workflowId = deps.agentWorkflowMap.resolvePendingBind(agentType);
    if (!workflowId) {
      return null;
    }

    // Record the agent-to-workflow mapping so subagent-stop can look it up
    if (agentId) {
      deps.agentWorkflowMap.bind(agentId, workflowId);
    }

    logger.info('Resolved pending bind', { agentType, workflowId, agentId });

    // Inject the binding as additional context so the agent is aware
    const context = JSON.stringify({ action: 'workflow_bind', workflow_id: workflowId });
    return {
      additionalContext: `<gv>${context}</gv>`,
    };
  };
}
