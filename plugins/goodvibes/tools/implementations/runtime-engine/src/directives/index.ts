/**
 * Directives module — barrel export.
 *
 * Re-exports the DirectiveQueue class, all directive builder functions,
 * and the WRFC handler registration function.
 */

export { DirectiveQueue } from './directive-queue.js';
export type { SpawnDirectiveContext } from './directive-builder.js';
export {
  buildSpawnDirectiveMessage,
  buildWorkflowCompleteMessage,
  buildEscalationMessage,
} from './directive-builder.js';
export { registerWRFCHandlers } from './wrfc-handlers.js';
export { AUTO_COMPLETE_AGENT_TYPES } from './wrfc-handlers.js';
export { AgentWorkflowMap } from './agent-workflow-map.js';
