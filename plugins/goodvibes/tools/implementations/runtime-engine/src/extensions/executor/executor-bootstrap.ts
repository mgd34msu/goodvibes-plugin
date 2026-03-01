/**
 * executor-bootstrap.ts — Executor subsystem initialization.
 *
 * Responsibilities:
 * - Initializing ExecutorModeManager (mode detection)
 * - Initializing ExecutorBudgetManager (budget enforcement)
 * - Initializing DaemonTickHandler
 * - Emitting executor:mode_set event on startup
 */

import { createLogger } from './shared/logger.js';
import { generateEventId, timestamp, toErrorMessage } from './shared/utils.js';
import { ExecutorModeManager } from './core/processing/executor-mode.js';
import { ExecutorBudgetManager } from './extensions/executor/executor-budget.js';
import { DaemonTickHandler } from './extensions/executor/daemon-tick-handler.js';
import type { EventBus } from './extensions/events/event-bus.js';
import type { RuntimeConfig } from './shared/config.js';

const logger = createLogger('executor-bootstrap');

export interface ExecutorSubsystem {
  executorMode: ExecutorModeManager;
  executorBudget: ExecutorBudgetManager;
  daemonTickHandler: DaemonTickHandler;
}

export interface ExecutorBootstrapDeps {
  config: RuntimeConfig;
  eventBus: EventBus;
}

/**
 * Initialize the executor subsystem.
 *
 * Returns the initialized subsystem on success, or null on failure.
 * Failure is logged and swallowed to preserve backward compatibility.
 */
export function initializeExecutor(deps: ExecutorBootstrapDeps): ExecutorSubsystem | null {
  const { config, eventBus } = deps;
  try {
    const executorMode = new ExecutorModeManager(config.executor, eventBus);
    const mode = executorMode.getMode();

    const executorBudget = new ExecutorBudgetManager(
      config.executor.budget,
      eventBus,
    );

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

    logger.info('Executor subsystem initialised', {
      mode,
      detection_method: executorMode.getDetectionMethod(),
    });

    return { executorMode, executorBudget, daemonTickHandler };
  } catch (err) {
    logger.warn('Executor subsystem initialisation failed — continuing without executor', {
      err: toErrorMessage(err),
    });
    return null;
  }
}
