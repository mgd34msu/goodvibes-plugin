/**
 * Runtime Engine -- Public Entry Point
 *
 * Re-exports shared modules and persistence layer for consumption by the
 * MCP server and other engine subsystems.
 */

export * from './shared/config.js';
export * from './shared/constants.js';
export * from './shared/logger.js';
export * from './shared/utils.js';
export * from './shared/types.js';
export * from './extensions/persistence/types.js';
export * from './extensions/persistence/state-store.js';
export { EventQueue, QueuePriority } from './extensions/events/event-queue.js';
export type { QueueEntry, DeadLetterEntry, QueueStats, QueueHandler, EventQueueConfig } from './extensions/events/event-queue.js';
export { EventLog } from './extensions/events/event-log.js';
export type { EventLogStats } from './extensions/events/event-log.js';
export * from './extensions/events/types.js';
export { EventBus } from './extensions/events/event-bus.js';
export { ConditionEvaluator } from './extensions/triggers/condition-evaluator.js';
export { TriggerActionExecutor } from './extensions/triggers/trigger-action-executor.js';
export { TriggerRegistry } from './extensions/triggers/trigger-registry.js';
export { getBuiltinTriggers } from './extensions/triggers/builtins.js';
export type {
  TriggerDefinition,
  TriggerCondition,
  EventCondition,
  CompositeCondition,
  ThresholdCondition,
  PatternCondition,
  TriggerAction,
  EmitEventAction,
  SpawnAgentAction,
  InvokeHandlerAction,
  WorkflowAction,
  CompositeAction,
  TriggerResult,
  TriggerActionHandler,
} from './extensions/triggers/types.js';
export * from './extensions/workflow/index.js';
export * from './shared/ipc/protocol.js';
export { IPCServer } from './shared/ipc/ipc-server.js';
export type { MessageHandler } from './shared/ipc/ipc-server.js';
export { RuntimeClient } from './shared/ipc/client.js';
export { FileFallback } from './core/state/file-fallback.js';
export { IPCRouter } from './shared/ipc/ipc-router.js';
export type { IPCRouterDeps } from './shared/ipc/ipc-router.js';
export { AgentCoordinator } from './extensions/agents/agent-coordinator.js';
export { BudgetTracker } from './extensions/agents/budget-tracker.js';
export type {
  CoordinatedAgent,
  AgentBudgetSnapshot,
  WRFCChain,
  WRFCPhase,
  WRFCPhaseName,
  ExecutionPlan,
  ExecutionPhaseInfo,
  ExecutionPlanAgent,
  BudgetSummary,
  BudgetThreshold,
  CoordinatorStats,
  CoordinatedSpawnOptions,
} from './extensions/agents/types.js';
