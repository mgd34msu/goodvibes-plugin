/**
 * Workflow Module — Public API
 *
 * Re-exports all workflow types, the WorkflowEngine class,
 * and the built-in workflow definitions.
 */

export * from './types.js';
export { WorkflowEngine } from './workflow-engine.js';
export type { EventBus as WorkflowEventBus } from './workflow-engine.js';
export { WRFC_LOOP_DEFINITION } from './definitions/wrfc-loop.js';
export { FIX_LOOP_DEFINITION } from './definitions/fix-loop.js';
export { TEST_THEN_FIX_DEFINITION } from './definitions/test-then-fix.js';
export { REVIEW_ONLY_DEFINITION } from './definitions/review-only.js';
export { loadCustomWorkflows, validateWorkflowDefinition, isValidWorkflowDefinition } from './definitions/custom-loader.js';
