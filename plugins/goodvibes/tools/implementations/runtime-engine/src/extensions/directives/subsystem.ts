/**
 * DirectiveSubsystem factory — Layer 2 directives extension.
 *
 * Creates the L2 directive primitives (DirectiveQueue, AgentWorkflowMap).
 * Cross-layer wiring — WRFCConfigStore (L3), registerTestFixHandlers,
 * registerReviewOnlyHandlers, and WatchdogCoordinator — are intentionally
 * excluded; they accept cross-layer deps and stay in the composition root.
 */

import { DirectiveQueue } from './directive-queue.js';
import { AgentWorkflowMap } from './agent-workflow-map.js';

/**
 * The directive subsystem: queued directives + agent-to-workflow bindings.
 */
export interface DirectiveSubsystem {
  directiveQueue: DirectiveQueue;
  agentWorkflowMap: AgentWorkflowMap;
}

/**
 * Create the directive subsystem.
 *
 * Instantiates a DirectiveQueue for enqueuing WRFC directives and an
 * AgentWorkflowMap for tracking which workflow each agent belongs to.
 */
export function createDirectiveSubsystem(): DirectiveSubsystem {
  const directiveQueue = new DirectiveQueue();
  const agentWorkflowMap = new AgentWorkflowMap();
  return { directiveQueue, agentWorkflowMap };
}
