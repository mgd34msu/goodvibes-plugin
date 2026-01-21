/**
 * Batch Engine - Main Entry Point
 * @see SPEC-v2
 *
 * The batch engine is the core of SPEC-v2, providing:
 * - Batch orchestration with multi-phase execution
 * - Transaction support with atomic operations
 * - Checkpoint and rollback recovery
 * - State persistence to .goodvibes/state/
 * - Memory persistence to .goodvibes/memory/
 * - Telemetry collection to .goodvibes/telemetry/
 * - Agent lifecycle management
 * - Fix loop for automatic error recovery
 */

// ============================================================================
// Handlers
// ============================================================================

export {
  // Handler functions
  handleBatch,
  handleBatchStatus,
  handleListBatches,
  handleBatchRecover,
  handleListCheckpoints,
  handleBatchState,

  // Handler registry
  handlerRegistry,
  getHandler,
  hasHandler,
  listHandlers,

  // Tool definitions for MCP
  toolDefinitions,
  getToolDefinitions,

  // Batch tracking helpers
  getActiveBatch,
  getCompletedBatch,
  listActiveBatches,
  listCompletedBatches,

  // Types
  type ToolHandler,
} from './handlers/index.js';

// ============================================================================
// Runtime
// ============================================================================

export {
  // State Manager
  StateManagerImpl,
  createStateManager,
  getStateManager,
  resetGlobalStateManager,

  // Memory Manager
  MemoryManagerImpl,
  createMemoryManager,
  getMemoryManager,
  resetGlobalMemoryManager,

  // Telemetry Collector
  TelemetryCollectorImpl,
  createTelemetryCollector,
  getTelemetryCollector,
  resetGlobalTelemetryCollector,

  // Runtime Context
  type RuntimeContext,
  createRuntimeContext,
  initializeRuntime,
  persistRuntime,
  resetRuntime,

  // Re-exported types
  type StateManager,
  type AgentResult,
  type MemoryManager,
  type DecisionFilter,
  type PatternFilter,
  type FailureFilter,
  type TelemetryAPI,
  type Bottleneck,
} from './runtime/index.js';

// ============================================================================
// Interfaces (Re-exports for consumers)
// ============================================================================

// Batch
export type {
  Batch,
  BatchConfig,
  OutputConfig,
  ValidationStep,
  LifecycleConfig,
} from './interfaces/batch.js';

// Result
export type {
  BatchResult,
  PhaseResult,
  OperationResult,
  ValidationResult,
  ErrorInfo,
} from './interfaces/result.js';

// Operations
export type {
  OperationType,
  OperationBase,
  Operation,
  Condition,
  Expectation,
} from './interfaces/operation.js';

// State
export type {
  GoodVibesState,
  SessionState,
  AgentState,
  CheckpointState,
  LockState,
  ActiveAgent,
  CompletedAgent,
  Checkpoint,
  Lock,
  HealthResult,
} from './interfaces/state.js';

// Memory
export type {
  Memory,
  Decision,
  Pattern,
  Failure,
  Preference,
  DecisionCategory,
} from './interfaces/memory.js';

// Telemetry
export type {
  Telemetry,
  SessionMetrics,
  BatchMetrics,
  OperationMetrics,
  AgentMetrics,
  Aggregations,
  TimeseriesPoint,
  TypeAggregation,
  TrendAnalysis,
} from './interfaces/telemetry.js';

// Context
export type {
  Context,
  SessionContext,
  BatchContext,
  OperationContext,
  AgentContext,
} from './interfaces/context.js';

// Lifecycle
export type {
  LifecycleHooks,
  Hook,
  OperationHook,
  ErrorHook,
  RetryHook,
  HookPhase,
  HookContext,
  HookResult,
} from './interfaces/lifecycle.js';

// Tools
export type {
  BatchToolInput,
  BatchToolOutput,
  BatchPreview,
  BatchPhase,
  BatchExecutionContext,
  BatchExecutionOptions,
} from './interfaces/tools/batch-tool.js';

export type {
  BatchStatusInput,
  BatchStatusOutput,
  BatchStatus,
  BatchProgress,
  OperationStatus,
  AgentStatus,
} from './interfaces/tools/batch-status.js';

export type {
  BatchRecoverInput,
  BatchRecoverOutput,
  RecoveryOperation,
  RestoreOutput,
  RetryOutput,
  CleanupOutput,
  CheckpointSummary,
} from './interfaces/tools/batch-recover.js';

export type {
  BatchStateInput,
  BatchStateOutput,
  StateOperation,
  MemoryQuery,
  StateSnapshot,
} from './interfaces/tools/batch-state.js';

// File paths
export { STATE_PATHS, getCheckpointPath } from './interfaces/state-files.js';
export { MEMORY_PATHS, EMPTY_INDEX, EMPTY_PREFERENCES } from './interfaces/memory-files.js';
export { TELEMETRY_PATHS, getHistoryPath, getTodayDateString, EMPTY_SESSION_METRICS, EMPTY_AGGREGATIONS } from './interfaces/telemetry-files.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Batch engine version
 */
export const VERSION = '1.0.0';

/**
 * Server name for MCP registration
 */
export const SERVER_NAME = 'batch-engine';

/**
 * Default configuration values
 */
export const DEFAULTS = {
  MAX_PARALLEL_OPERATIONS: 10,
  MAX_RETRY_ATTEMPTS: 3,
  TRANSACTION_TIMEOUT_MS: 60000,
  CHECKPOINT_EXPIRY_HOURS: 24,
  MAX_CHECKPOINTS: 10,
} as const;

/**
 * Phase execution order
 */
export const PHASE_ORDER = ['discovery', 'read', 'write', 'exec', 'query', 'state'] as const;

/**
 * Token cost estimates per model (per 1M tokens)
 */
export const TOKEN_COSTS = {
  input: {
    haiku: 0.25,
    sonnet: 3.00,
    opus: 15.00,
  },
  output: {
    haiku: 1.25,
    sonnet: 15.00,
    opus: 75.00,
  },
} as const;
