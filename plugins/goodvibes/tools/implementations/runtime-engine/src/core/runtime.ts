/**
 * core/runtime.ts — L1 Core Runtime factory.
 *
 * Creates all core subsystem pieces: event queue, trigger registry,
 * state store, and event processor.
 */

import { EventQueue } from './queues/event-queue.js';
import { DeadLetterQueue } from './queues/dead-letter.js';
import { TriggerRegistry } from './matching/trigger-registry.js';
import { ErrorHandler } from './matching/error-handler.js';
import { EventProcessor } from './processing/event-processor.js';
import { LoopLifecycleManager } from './processing/lifecycle.js';
import { CoreStateStore } from './state/state-store.js';
import { EventMetrics } from './observability/metrics.js';
import type { ActionExecutorInterface } from './types.js';

/** Bundle of L1 core runtime components. */
export interface CoreRuntime {
  eventQueue: EventQueue;
  triggerRegistry: TriggerRegistry;
  stateStore: CoreStateStore;
  eventProcessor: EventProcessor;
}

/**
 * Create the L1 core runtime.
 *
 * @param actionExecutor - Optional action executor (L2 injects via L1 interface).
 */
export function createCoreRuntime(actionExecutor?: ActionExecutorInterface): CoreRuntime {
  const eventQueue = new EventQueue();
  const triggerRegistry = new TriggerRegistry();
  const stateStore = new CoreStateStore();

  const lifecycle = new LoopLifecycleManager();
  const metrics = new EventMetrics();
  const deadLetter = new DeadLetterQueue();
  const errorHandler = new ErrorHandler({ deadLetter });

  const eventProcessor = new EventProcessor(
    eventQueue, triggerRegistry, stateStore, lifecycle,
    metrics, errorHandler, deadLetter,
    { action_executor: actionExecutor },
  );

  return { eventQueue, triggerRegistry, stateStore, eventProcessor };
}
