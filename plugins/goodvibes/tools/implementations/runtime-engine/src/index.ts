/**
 * Runtime Engine -- Public Entry Point
 *
 * Re-exports shared modules and persistence layer for consumption by the
 * MCP server and other engine subsystems.
 */

// Config
export type {
  IpcConfig,
  QueueConfig,
  PersistenceConfig,
  WorkflowsConfig,
  TriggersConfig,
  HealthConfig,
  AgentsConfig,
  ExecutorMode,
  DaemonConfig,
  DaemonTransportConfig,
  ExecutorBudgetConfig,
  ExecutorConfig,
  HeartbeatPluginConfig,
  SchedulerPluginConfig,
  TimePluginRuntimeConfig,
  FileWatcherPluginConfig,
  HttpListenerPluginConfig,
  ExternalPluginRuntimeConfig,
  FeaturesConfig,
  RuntimeConfig,
} from './shared/config.js';
export { loadConfig, saveConfig, ensureRuntimeSections, DEFAULT_CONFIG } from './shared/config.js';

// Constants
export { ENGINE_VERSION } from './shared/constants.js';

// Logger
export type { LogLevel, LogEntry, Logger } from './shared/logger.js';
export { createLogger } from './shared/logger.js';

// Utils
export {
  generateId,
  timestamp,
  generateEventId,
  generateWorkflowId,
  toErrorMessage,
  assertNever,
  parseRelativeTime,
} from './shared/utils.js';

// Shared types
export type { RuntimeResult, HealthCheck, HealthStatus } from './shared/types.js';

// Persistence types
export type {
  StateStore,
  CrashRecovery,
  PersistenceRecoveryResult,
} from './extensions/persistence/types.js';
export { JsonStateStore } from './extensions/persistence/state-store.js';
export { EventLog } from './extensions/events/event-log.js';
export type { EventLogStats } from './extensions/events/event-log.js';
export type {
  EventMetadata,
  EventSource,
  EventType,
  SessionStartedPayload,
  HookEventPayload,
  WorkflowStateChangedPayload,
  StateChangedPayload,
  AgentSpawnedPayload,
  AgentProgressPayload,
  TriggerFiredPayload,
  FileModifiedPayload,
  BuildResultPayload,
  TestResultPayload,
  DevServerPayload,
  EngineEventPayload,
  SystemErrorPayload,
  EventPayload,
  EventTypePattern,
  EventHandler,
  Unsubscribe,
  EventFilter,
  RuntimeEvent,
} from './shared/events.js';
export { EventBus } from './extensions/events/event-bus.js';
export { ConditionEvaluator } from './extensions/triggers/condition-evaluator.js';
export { TriggerActionExecutor } from './extensions/triggers/trigger-action-executor.js';
export { TriggerRegistry } from './core/trigger-registry.js';
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
  WorkflowContextProvider,
} from './extensions/triggers/types.js';
// Workflow extension
export type {
  WorkflowDefinition,
  StateDefinition,
  TransitionDefinition,
  GuardCondition,
  ActionDefinition,
  WorkflowInstance,
  WorkflowContext,
  WorkflowTransition,
  GuardFunction,
  ActionHandler,
} from './extensions/workflow/types.js';
export { WorkflowEngine } from './extensions/workflow/workflow-engine.js';
export type {
  WorkflowEventBusDep,
  PurgableQueue,
} from './extensions/workflow/workflow-engine.js';
export {
  WRFC_LOOP_DEFINITION,
  FIX_LOOP_DEFINITION,
  TEST_THEN_FIX_DEFINITION,
  REVIEW_ONLY_DEFINITION,
  loadCustomWorkflows,
  validateWorkflowDefinition,
  isValidWorkflowDefinition,
  isChainType,
  CHAIN_TYPES,
  CHAIN_MAX_TRANSITIONS,
  WRFC_EVENTS,
  TEST_FIX_EVENTS,
  REVIEW_ONLY_EVENTS,
} from './extensions/workflow/definitions/index.js';
export type { ChainType } from './extensions/workflow/definitions/index.js';
export { WatchdogCoordinator } from './extensions/workflow/watchdog.js';
export type { WatchdogCoordinatorDeps } from './extensions/workflow/watchdog.js';

// IPC protocol
export { validateIPCMessage } from './shared/ipc/protocol.js';
export type {
  HookEventMessage,
  QueryMessage,
  StateUpdateMessage,
  HeartbeatMessage,
  IPCMessage,
  IPCQuery,
  IPCResponse,
  IPCResponseData,
  Directive,
} from './shared/ipc/protocol.js';
export { IPCServer } from './shared/ipc/ipc-server.js';
export type { MessageHandler } from './shared/ipc/ipc-server.js';
export { RuntimeClient } from './shared/ipc/client.js';
export { FileFallback } from './core/state/file-fallback.js';
export { IPCRouter } from './extensions/ipc/ipc-router.js';
export type { IPCRouterDeps } from './extensions/ipc/ipc-router.js';
export { AgentCoordinator } from './extensions/agents/agent-coordinator.js';
export { BudgetTracker } from './extensions/agents/budget-tracker.js';
export type {
  CoordinatedAgent,
  AgentBudgetSnapshot,
  BudgetThreshold,
  CoordinatorStats,
  CoordinatedSpawnOptions,
} from './extensions/agents/types.js';
export type {
  WRFCChain,
  WRFCPhase,
  WRFCPhaseName,
  ExecutionPlan,
  ExecutionPhaseInfo,
  ExecutionPlanAgent,
  BudgetSummary,
} from './plugins/wrfc/types.js';
