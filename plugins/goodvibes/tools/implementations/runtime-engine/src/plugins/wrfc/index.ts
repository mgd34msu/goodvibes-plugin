/**
 * WRFC Plugin — Layer 3 (Barrel Exports)
 *
 * The WRFC (Write-Review-Fix-Confirm) quality loop plugin.
 * Consumers should import from this module, not from individual files.
 *
 * Quick start:
 *   import { registerWRFCPlugin, getDefaultWRFCConfig } from '../../plugins/wrfc/index.js';
 *   registerWRFCPlugin({ processor, registry, store, config: getDefaultWRFCConfig() });
 */

// Plugin registration (function-based API, backward compat)
export { registerWRFCPlugin, getDefaultWRFCConfig } from './wrfc-plugin.js';
export type { WRFCPluginConfig, PluginContext } from './wrfc-plugin.js';

// Plugin class (RuntimePlugin interface implementation)
export { WRFCPlugin } from './wrfc-plugin.js';

// WRFC types (L3 domain types)
export type {
  WRFCPhaseName,
  WRFCPhase,
  WRFCChain,
  ExecutionPlanAgent,
  ExecutionPhaseInfo,
  ExecutionPlan,
  BudgetSummary,
} from './types.js';

// Workflow and trigger definitions
export { getWRFCWorkflowDefinitions } from './workflows.js';
export { getWRFCTriggerDefinitions } from './triggers.js';

// Event handlers (exported for testing and direct use)
export {
  handleWorkflowCreated,
  handleAgentCompleted,
  handleQualityGate,
  resolveWorkflowId,
  HANDLER_IDS,
  TRIGGER_IDS,
  DEFAULT_MAX_FIX_ATTEMPTS,
} from './handlers.js';
// WRFC agent type constants — re-exported from shared layer
export {
  REVIEWER_AGENT_TYPES,
  ENGINEER_AGENT_TYPES,
  AUTO_COMPLETE_AGENT_TYPES,
  REQUIRE_REVIEW_AGENT_TYPES,
  DEFAULT_MIN_REVIEW_SCORE,
} from '../../shared/wrfc-constants.js';
export type { HandlerIdKey } from './handlers.js';

// Score evaluation
export { evaluateScore, extractScore, parseScoreFromGvTag } from './score-evaluator.js';
export type { ScoreResult } from './score-evaluator.js';

// Directive builders (Action factories)
export {
  buildSpawnAction,
  buildCompleteAction,
  buildEscalateAction,
  buildSpawnDirective,
  buildCompleteDirective,
  buildEscalateDirective,
} from './directive-builder.js';
export type { SpawnDirectiveContext, EscalateParams } from './directive-builder.js';
