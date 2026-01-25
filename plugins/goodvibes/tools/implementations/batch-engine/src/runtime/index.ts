/**
 * Runtime exports for Batch Engine
 * @see SPEC-v2 Sections 7-9
 */

// Import for internal use
import {
  getStateManager,
  resetGlobalStateManager,
} from './state.js';
import {
  getMemoryManager,
  resetGlobalMemoryManager,
} from './memory.js';
import {
  getTelemetryCollector,
  resetGlobalTelemetryCollector,
} from './telemetry.js';
import {
  getCheckpointManager,
  resetGlobalCheckpointManager,
} from './checkpoint.js';
import {
  getRollbackSystem,
  resetGlobalRollbackSystem,
} from './rollback.js';
import {
  getRecoveryManager,
  resetGlobalRecoveryManager,
} from './recovery.js';
import {
  getContextGatherer,
  resetGlobalContextGatherer,
} from './context.js';
import {
  getTemplateResolver,
  resetGlobalTemplateResolver,
} from './template-resolver.js';
import {
  getModeManager,
  resetGlobalModeManager,
} from './mode.js';
import {
  getLogsManager,
  resetGlobalLogsManager,
} from './logs.js';

// State Manager
export {
  StateManagerImpl,
  createStateManager,
  getStateManager,
  resetGlobalStateManager,
} from './state.js';

// Memory Manager
export {
  MemoryManagerImpl,
  createMemoryManager,
  getMemoryManager,
  resetGlobalMemoryManager,
} from './memory.js';

// Telemetry Collector
export {
  TelemetryCollectorImpl,
  createTelemetryCollector,
  getTelemetryCollector,
  resetGlobalTelemetryCollector,
} from './telemetry.js';

// Checkpoint Manager
export {
  CheckpointManagerImpl,
  createCheckpointManager,
  getCheckpointManager,
  resetGlobalCheckpointManager,
} from './checkpoint.js';

// Hook Handlers
export {
  BuiltinHookHandlers,
  createBuiltinHookHandlers,
  getBuiltinHookHandlers,
  resetGlobalBuiltinHookHandlers,
} from './hooks-handlers.js';

// Rollback System
export {
  RollbackSystemImpl,
  createRollbackSystem,
  getRollbackSystem,
  resetGlobalRollbackSystem,
} from './rollback.js';

// Re-export interfaces for convenience
export type { StateManager, AgentResult } from '../interfaces/state-api.js';
export type { MemoryManager, DecisionFilter, PatternFilter, FailureFilter } from '../interfaces/memory-api.js';
export type { TelemetryAPI, Bottleneck } from '../interfaces/telemetry-api.js';
export type { CheckpointManager, CheckpointConfig, RestoreOptions, RestoreResult, CleanupResult } from '../interfaces/checkpoint.js';
export type { RollbackSystem, RollbackManager, RollbackResult, RollbackScope, RollbackTarget, SelectiveRollbackOptions, RollbackPreview } from '../interfaces/rollback.js';
export type { RecoveryManager, RecoveryOrchestrator, RecoveryContext, RecoveryDecision, RecoveryResult, RecoveryAction, RecoveryConfig } from '../interfaces/recovery.js';

/**
 * Runtime context containing all managers
 */
export interface RuntimeContext {
  state: import('../interfaces/state-api.js').StateManager;
  memory: import('../interfaces/memory-api.js').MemoryManager;
  telemetry: import('../interfaces/telemetry-api.js').TelemetryAPI;
  checkpoint: import('../interfaces/checkpoint.js').CheckpointManager;
  rollback: import('../interfaces/rollback.js').RollbackManager;
  mode: import('./mode.js').ModeManager;
  logs: import('./logs.js').LogsManager;
}

/**
 * Create a complete runtime context
 */
export function createRuntimeContext(projectRoot?: string): RuntimeContext {
  return {
    state: getStateManager(projectRoot),
    memory: getMemoryManager(projectRoot),
    telemetry: getTelemetryCollector(projectRoot),
    checkpoint: getCheckpointManager(projectRoot),
    rollback: getRollbackSystem(projectRoot),
    mode: getModeManager(projectRoot),
    logs: getLogsManager(projectRoot),
  };
}

/**
 * Initialize the runtime context
 * Loads persisted state from disk
 */
export async function initializeRuntime(context: RuntimeContext): Promise<void> {
  const stateManager = context.state as import('./state.js').StateManagerImpl;
  const memoryManager = context.memory as import('./memory.js').MemoryManagerImpl;
  const telemetryCollector = context.telemetry as import('./telemetry.js').TelemetryCollectorImpl;
  const checkpointManager = context.checkpoint as import('./checkpoint.js').CheckpointManagerImpl;
  const modeManager = context.mode as import('./mode.js').ModeManagerImpl;
  const logsManager = context.logs as import('./logs.js').LogsManagerImpl;

  await Promise.all([
    stateManager.load(),
    memoryManager.load(),
    telemetryCollector.load(),
    checkpointManager.initialize(),
    modeManager.loadCustomModes(),
    modeManager.loadPreference(),
    logsManager.initialize(),
  ]);
}

/**
 * Persist the runtime context
 * Saves state to disk
 */
export async function persistRuntime(context: RuntimeContext): Promise<void> {
  const stateManager = context.state as import('./state.js').StateManagerImpl;
  const memoryManager = context.memory as import('./memory.js').MemoryManagerImpl;
  const telemetryCollector = context.telemetry as import('./telemetry.js').TelemetryCollectorImpl;
  const checkpointManager = context.checkpoint as import('./checkpoint.js').CheckpointManagerImpl;
  const modeManager = context.mode as import('./mode.js').ModeManagerImpl;

  await Promise.all([
    stateManager.persist(),
    memoryManager.persist(),
    telemetryCollector.persist(),
    checkpointManager.shutdown(),
    modeManager.savePreference(),
  ]);
}

/**
 * Reset all runtime managers (useful for testing)
 */
export function resetRuntime(): void {
  resetGlobalStateManager();
  resetGlobalMemoryManager();
  resetGlobalTelemetryCollector();
  resetGlobalCheckpointManager();
  resetGlobalRollbackSystem();
  resetGlobalRecoveryManager();
  resetGlobalContextGatherer();
  resetGlobalTemplateResolver();
  resetGlobalModeManager();
  resetGlobalLogsManager();
}

// Fix Loop
export {
  FixLoopImpl,
  createFixLoop,
  getFixLoop,
  resetGlobalFixLoop,
} from './fix-loop.js';

// Recovery Manager
export {
  RecoveryManagerImpl,
  RecoveryOrchestratorImpl,
  createRecoveryManager,
  getRecoveryManager,
  resetGlobalRecoveryManager,
} from './recovery.js';

// Context Gatherer
export {
  ContextGathererImpl,
  createContextGatherer,
  getContextGatherer,
  resetGlobalContextGatherer,
} from './context.js';

// Template Resolver
export {
  TemplateResolverImpl,
  createTemplateResolver,
  getTemplateResolver,
  resetGlobalTemplateResolver,
  resolveTemplate,
  hasTemplates,
  extractTemplateRefs,
  resolveTemplatesInObject,
} from './template-resolver.js';

// Re-export context and template interfaces
export type { ContextGatherer, GatheringPhase, GatheringResult } from '../interfaces/context-gathering.js';
export type { Context, SessionContext, BatchContext, OperationContext, AgentContext } from '../interfaces/context.js';
export type { TemplateResolver, TemplateString, TemplateContext, TemplateHelper } from '../interfaces/template.js';

// ============================================================================
// Mode System (SPEC-v2 Section 10)
// ============================================================================

// Mode Manager
export {
  ModeManagerImpl,
  SessionModeTracker,
  createModeManager,
  getModeManager,
  resetGlobalModeManager,
  initializeModeSystem,
  shouldAskUser,
  getOutputMode,
  handleError,
  formatResult,
  applyModeOverride,
  createSessionModeTracker,
} from './mode.js';

// Re-export mode interfaces
export type { ModeConfig, ModeName } from '../interfaces/mode.js';
export type { Situation, OutputMode, ErrorAction, ResultFormat } from '../interfaces/mode-behavior.js';
export type { ModeManager, ModeOverride } from './mode.js';

// ============================================================================
// Logs System (SPEC-v2 Section 14.2.5)
// ============================================================================

// Logs Manager
export {
  LogsManagerImpl,
  createLogsManager,
  getLogsManager,
  resetGlobalLogsManager,
  getLogsDir,
  getLogFilePath,
} from './logs.js';

// Re-export logs types
export type {
  LogsManager,
  DecisionLogEntry,
  ErrorLogEntry,
  ActivityLogEntry,
  ErrorCategory,
  LogFileType,
} from './logs.js';

// ============================================================================
// Agent Coordination System (SPEC-v2 Section 12)
// ============================================================================

// Agent Pool Manager
export {
  AgentPoolImpl,
  AgentLifecycleManagerImpl,
  AgentCommunicationManagerImpl,
  DependencyResolverImpl,
  getAgentPool,
  getLifecycleManager,
  getCommunicationManager,
  getDependencyManager,
  createAgentPool,
  createLifecycleManager,
  createCommunicationManager,
  createDependencyManager,
  resetAgentCoordination,
} from './agent-pool.js';

// Re-export agent coordination interfaces
export type {
  AgentPoolManager,
  AgentPool,
  AgentPoolConfig,
  AgentSpec,
  ActiveAgent,
  CompletedAgent,
  QueuedAgent,
  BudgetStatus,
} from '../interfaces/agent-pool.js';

export type {
  AgentLifecycleManager,
  AgentLifecycle,
  SpawnResult,
  MonitorResult,
  CompletionResult,
  HealthReport,
} from '../interfaces/agent-lifecycle.js';

export type {
  AgentCommunicationManager,
  AgentCommunication,
  SharedResult,
  BroadcastMessage,
  AgentMessage,
  CommunicationStats,
} from '../interfaces/agent-communication.js';

export type {
  DependencyManager,
  DependencyResolver,
  ExecutionPlan,
  DependencyGraph,
  ResolutionResult,
} from '../interfaces/agent-dependencies.js';
