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
export { registerWRFCHandlers, AUTO_COMPLETE_AGENT_TYPES } from './wrfc-handlers.js';
export { AgentWorkflowMap } from './agent-workflow-map.js';
export { parseGvTag, parseAllGvTags, extractReviewScore, extractFiles, extractTestResults } from './gv-tag-parser.js';
export type { GvTagData, GvParseResult } from './gv-tag-parser.js';
