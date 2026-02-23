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
export * from './types.js';
export * from './persistence/types.js';
export * from './persistence/state-store.js';
export { EventQueue, QueuePriority } from './events/event-queue.js';
export type { QueueEntry, DeadLetterEntry, QueueStats, QueueHandler, EventQueueConfig } from './events/event-queue.js';
export { EventLog } from './events/event-log.js';
export type { EventLogStats } from './events/event-log.js';
export * from './events/types.js';
export { EventBus } from './events/event-bus.js';
export { ConditionEvaluator } from './triggers/condition-evaluator.js';
export { ActionExecutor } from './triggers/action-executor.js';
export { TriggerRegistry } from './triggers/trigger-registry.js';
export { getBuiltinTriggers } from './triggers/builtins.js';
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
} from './triggers/types.js';
export * from './workflow/index.js';
export * from './ipc/protocol.js';
export { IPCServer } from './ipc/ipc-server.js';
export type { MessageHandler } from './ipc/ipc-server.js';
export { RuntimeClient } from './ipc/client.js';
export { FileFallback } from './ipc/file-fallback.js';
export { IPCRouter } from './ipc/ipc-router.js';
export type { IPCRouterDeps } from './ipc/ipc-router.js';
export { AgentCoordinator } from './agents/agent-coordinator.js';
export { BudgetTracker } from './agents/budget-tracker.js';
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
} from './agents/types.js';
