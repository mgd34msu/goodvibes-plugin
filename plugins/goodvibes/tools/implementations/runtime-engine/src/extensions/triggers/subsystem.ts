/**
 * Trigger Subsystem Factory
 *
 * Encapsulates creation and registration of the TriggerRegistry
 * with all built-in triggers. Constructs concrete L2 implementations
 * (ConditionEvaluator, TriggerActionExecutor) and injects them into
 * the registry via the L1 interfaces.
 */

import type { RuntimeConfig } from '../../shared/config.js';
import type { EventEmitter } from '../../core/types.js';
import type { DirectiveQueue } from '../directives/directive-queue.js';
import type { WorkflowEngine } from '../workflow/workflow-engine.js';
import { createLogger } from '../../shared/logger.js';

import { TriggerRegistry } from '../../core/trigger-registry.js';
import { ConditionEvaluator } from './condition-evaluator.js';
import { TriggerActionExecutor } from './trigger-action-executor.js';
import type { WorkflowContextProvider } from './types.js';
import { getBuiltinTriggers } from './builtins.js';

const logger = createLogger('triggers-subsystem');

export interface TriggerSubsystem {
  triggerRegistry: TriggerRegistry;
}

export interface TriggerSubsystemDeps {
  eventBus: EventEmitter;
  directiveQueue: DirectiveQueue | null;
  workflowEngine: WorkflowEngine | null;
  contextProvider?: WorkflowContextProvider;
}

export function createTriggerSubsystem(
  config: RuntimeConfig,
  deps: TriggerSubsystemDeps,
): TriggerSubsystem {
  const evaluator = new ConditionEvaluator();
  const executor = new TriggerActionExecutor(
    deps.eventBus,
    deps.directiveQueue,
    deps.workflowEngine,
    config.triggers,
    deps.contextProvider,
  );

  const triggerRegistry = new TriggerRegistry(config.triggers, evaluator, executor);

  for (const trigger of getBuiltinTriggers()) {
    triggerRegistry.register(trigger);
  }

  logger.debug('Trigger subsystem created');

  return { triggerRegistry };
}
