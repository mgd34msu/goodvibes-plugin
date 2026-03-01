/**
 * Workflow Subsystem Factory
 *
 * Encapsulates creation and registration of the WorkflowEngine,
 * including built-in definitions and the checkReviewScore guard.
 */

import type { RuntimeConfig } from '../../shared/config.js';
import { createLogger } from '../../shared/logger.js';

import { WorkflowEngine } from './workflow-engine.js';
import {
  WRFC_LOOP_DEFINITION,
  FIX_LOOP_DEFINITION,
  TEST_THEN_FIX_DEFINITION,
  REVIEW_ONLY_DEFINITION,
  loadCustomWorkflows,
} from './definitions/index.js';
import { checkReviewScoreGuard } from './guards.js';

const logger = createLogger('workflow-subsystem');

export interface WorkflowSubsystem {
  workflowEngine: WorkflowEngine;
  shutdown(): void;
}

export async function createWorkflowSubsystem(
  config: RuntimeConfig,
  projectRoot: string,
): Promise<WorkflowSubsystem> {
  const workflowEngine = new WorkflowEngine(config.workflows);

  workflowEngine.registerDefinition(WRFC_LOOP_DEFINITION);
  workflowEngine.registerDefinition(FIX_LOOP_DEFINITION);
  workflowEngine.registerDefinition(TEST_THEN_FIX_DEFINITION);
  workflowEngine.registerDefinition(REVIEW_ONLY_DEFINITION);

  workflowEngine.registerGuard('checkReviewScore', checkReviewScoreGuard);

  // Load and register user-defined custom workflows from goodvibes.json
  try {
    const customDefinitions = await loadCustomWorkflows(projectRoot);
    for (const def of customDefinitions) {
      workflowEngine.registerDefinition(def);
      logger.info('Custom workflow definition registered', { id: def.id, name: def.name });
    }
    logger.debug('Custom workflow definitions loaded', { count: customDefinitions.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('Failed to load custom workflow definitions — continuing without them', {
      err: message,
    });
  }

  logger.debug('Workflow subsystem created');

  return {
    workflowEngine,
    shutdown(): void {
      for (const instance of workflowEngine.getActiveInstances()) {
        workflowEngine.cancel(instance.id, 'subsystem shutdown');
      }
      logger.debug('Workflow subsystem shut down');
    },
  };
}
