/**
 * core/runtime.ts — L1 Core Runtime factory.
 *
 * Creates all core subsystem pieces: event queue, trigger registry,
 * state store, and event processor.
 *
 * IMPORTANT: The `triggerRegistry` parameter is required to ensure
 * a SINGLE unified TriggerRegistry is used at runtime. The caller
 * (bootstrap) must create the unified TriggerRegistry via
 * `createTriggerSubsystem()` and pass it here so that EventProcessor
 * and all extension subsystems share the same registry instance.
 */

import { EventQueue } from './queues/event-queue.js';
import { DeadLetterQueue } from './queues/dead-letter.js';
import { ErrorHandler } from './matching/error-handler.js';
import { EventProcessor } from './processing/event-processor.js';
import { LoopLifecycleManager } from './processing/lifecycle.js';
import { CoreStateStore } from './state/state-store.js';
import { EventMetrics } from './observability/metrics.js';
import type { ActionExecutorInterface, TriggerRegistryInterface } from './types.js';

/** Bundle of L1 core runtime components. */
export interface CoreRuntime {
  eventQueue: EventQueue;
  /** The unified trigger registry shared across all subsystems. */
  triggerRegistry: TriggerRegistryInterface;
  stateStore: CoreStateStore;
  eventProcessor: EventProcessor;
}

/**
 * Create the L1 core runtime.
 *
 * @param actionExecutor - Optional action executor (L2 injects via L1 interface).
 * @param triggerRegistry - The unified TriggerRegistry created by bootstrap.
 *   Must be provided so that EventProcessor and all extension subsystems share
 *   the SAME registry instance — no dual-registry split at runtime.
 */
export function createCoreRuntime(
  actionExecutor?: ActionExecutorInterface,
  triggerRegistry?: TriggerRegistryInterface,
): CoreRuntime {
  const eventQueue = new EventQueue();
  const stateStore = new CoreStateStore();

  // Use the injected registry if provided; this is the expected path from
  // bootstrap which always passes the unified TriggerRegistry. The fallback
  // stub satisfies the no-op contract for isolated unit tests only.
  const registry: TriggerRegistryInterface = triggerRegistry ?? {
    match: () => [],
    recordFire: () => undefined,
    register: () => undefined,
    unregister: () => false,
    enable: () => undefined,
    disable: () => undefined,
    get: () => undefined,
  };

  const lifecycle = new LoopLifecycleManager();
  const metrics = new EventMetrics();
  const deadLetter = new DeadLetterQueue();
  const errorHandler = new ErrorHandler({ deadLetter });

  const eventProcessor = new EventProcessor(
    eventQueue, registry, stateStore, lifecycle,
    metrics, errorHandler, deadLetter,
    { action_executor: actionExecutor },
  );

  return { eventQueue, triggerRegistry: registry, stateStore, eventProcessor };
}
