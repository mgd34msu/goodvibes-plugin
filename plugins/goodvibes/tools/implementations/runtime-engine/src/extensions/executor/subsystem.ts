/**
 * extensions/executor/subsystem.ts — L2 Executor subsystem factory.
 *
 * Creates ExecutorModeManager (L1), ExecutorBudgetManager (L2),
 * and DaemonTickHandler (L2).
 */

import { createLogger } from '../../shared/logger.js';
import { generateEventId, timestamp, toErrorMessage } from '../../shared/utils.js';
import { ExecutorModeManager } from '../../core/processing/executor-mode.js';
import { ExecutorBudgetManager } from './executor-budget.js';
import { DaemonTickHandler } from './daemon-tick-handler.js';
import type { EventBus } from '../events/event-bus.js';
import type { RuntimeConfig } from '../../shared/config.js';

const logger = createLogger('executor-subsystem');

/** Bundle of L2 executor components. */
export interface ExecutorSubsystem {
  executorMode: ExecutorModeManager;
  executorBudget: ExecutorBudgetManager;
  daemonTickHandler: DaemonTickHandler;
}

/**
 * Create the executor subsystem.
 *
 * Returns null on failure (logged and swallowed for backward compat).
 */
export function createExecutorSubsystem(
  config: RuntimeConfig,
  eventBus: EventBus,
): ExecutorSubsystem | null {
  try {
    const executorMode = new ExecutorModeManager(config.executor, eventBus);
    const mode = executorMode.getMode();

    const executorBudget = new ExecutorBudgetManager(config.executor.budget, eventBus);

    const daemonTickHandler = new DaemonTickHandler({
      executorMode,
      budgetManager: executorBudget,
      eventBus,
      config: config.executor,
    });

    eventBus.emit({
      id: generateEventId(),
      timestamp: timestamp(),
      type: 'executor:mode_set',
      source: { kind: 'system' },
      payload: {
        type: 'executor:mode_set',
        data: {
          mode,
          previous_mode: mode,
          detection_method: executorMode.getDetectionMethod(),
        },
      },
    });

    logger.info('Executor subsystem created', {
      mode,
      detection_method: executorMode.getDetectionMethod(),
    });

    return { executorMode, executorBudget, daemonTickHandler };
  } catch (err) {
    logger.warn('Executor subsystem creation failed — continuing without executor', {
      err: toErrorMessage(err),
    });
    return null;
  }
}
