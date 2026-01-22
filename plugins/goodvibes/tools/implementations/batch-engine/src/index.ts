#!/usr/bin/env node
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
// MCP Server Imports
// ============================================================================

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from './logging.js';
import {
  toolDefinitions,
  getHandler,
  hasHandler,
  listHandlers,
} from './handlers/index.js';

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

  // Checkpoint Manager
  CheckpointManagerImpl,
  createCheckpointManager,
  getCheckpointManager,
  resetGlobalCheckpointManager,

  // Fix Loop
  FixLoopImpl,
  createFixLoop,
  getFixLoop,
  resetGlobalFixLoop,

  // Rollback System
  RollbackSystemImpl,
  createRollbackSystem,
  getRollbackSystem,
  resetGlobalRollbackSystem,

  // Recovery Manager
  RecoveryManagerImpl,
  RecoveryOrchestratorImpl,
  createRecoveryManager,
  getRecoveryManager,
  resetGlobalRecoveryManager,

  // Mode Manager
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
  type CheckpointManager,
  type CheckpointConfig,
  type RestoreOptions,
  type RestoreResult,
  type CleanupResult,
  type RollbackSystem,
  type RollbackManager,
  type RollbackResult,
  type RollbackScope,
  type RollbackTarget,
  type SelectiveRollbackOptions,
  type RollbackPreview,
  type RecoveryManager,
  type RecoveryOrchestrator,
  type RecoveryContext,
  type RecoveryDecision,
  type RecoveryResult,
  type RecoveryAction,
  type RecoveryConfig,
  type ModeManager,
  type ModeConfig,
  type ModeName,
  type Situation,
  type OutputMode,
  type ErrorAction,
  type ResultFormat,
  type ModeOverride,
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

// Operation-specific results
export type {
  // READ results
  FileReadResult,
  SearchResult,
  GlobResult,
  SymbolResult,
  UrlResult,
  AnalyzeResult,
  // WRITE results
  CreateResult,
  EditResult,
  DeleteResult,
  MoveResult,
  CopyResult,
  AtomicResult,
  // EXEC results
  CommandResult,
  ScriptResult,
  // QUERY results
  LspResult,
  ValidateResult,
  DiagnoseResult,
  // STATE results
  GetResult,
  SetResult,
  DeleteStateResult,
  ListResult,
  TrackResult,
  MemoryQueryResult,
} from './interfaces/operations/results.js';

// Result type guards
export {
  isFileReadResult,
  isSearchResult,
  isGlobResult,
  isSymbolResult,
  isUrlResult,
  isAnalyzeResult,
  isCreateResult,
  isEditResult,
  isDeleteResult,
  isMoveResult,
  isCopyResult,
  isAtomicResult,
  isCommandResult,
  isAgentResult,
  isScriptResult,
  isLspResult,
  isValidateResult,
  isDiagnoseResult,
  isGetResult,
  isSetResult,
  isDeleteStateResult,
  isListResult,
  isTrackResult,
  isMemoryQueryResult,
} from './interfaces/operations/results.js';

// Operations
export type {
  OperationType,
  OperationBase,
  Operation,
  Condition,
  Expectation,
} from './interfaces/operation.js';

// READ operations
export type {
  ReadOperation,
  ExtractMode,
  SearchMode,
  SymbolKind,
  UrlExtractMode,
  AnalysisKind,
  FileSpec,
} from './interfaces/operations/read.js';

// WRITE operations
export type {
  WriteOperation,
  ExtendedWriteOperation,
  CreateOperation,
  EditOperation,
  DeleteOperation,
  MoveOperation,
  CopyOperation,
  AtomicOperation,
  CreateSpec,
  EditSpec,
  Edit,
  MoveSpec,
  CopySpec,
  CreateOptions,
  EditOptions,
  DeleteOptions,
  MoveOptions,
  CopyOptions,
  AtomicOptions,
} from './interfaces/operations/write.js';

// EXEC, QUERY, STATE operations
export type {
  ExecOperation,
  QueryOperation,
  StateOperation,
  // Command
  CommandOperation,
  CommandSpec,
  CommandOptions,
  CaptureSpec,
  // Agent
  AgentOperation,
  AgentSpec,
  AgentBudget,
  AgentInject,
  ChainSpec,
  // Script
  ScriptOperation,
  ScriptSpec,
  // LSP
  LspOperation,
  LspQuery,
  LspOperationType,
  Position,
  // Validate
  ValidateOperation,
  ValidationSpec,
  ValidationCheck,
  ValidationType,
  // Diagnose
  DiagnoseOperation,
  DiagnosisSpec,
  DiagnosisKind,
  // State operations
  GetOperation,
  SetOperation,
  DeleteOperation as DeleteStateOperation,
  ListOperation,
  TrackOperation,
  MemoryQueryOperation,
  SetEntry,
  TrackEntry,
  TrackEntryKind,
  MemoryQueryFilters,
} from './interfaces/operations/exec.js';

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

// Mode System types are already exported from runtime/index.js
// (ModeName, ModeConfig, shouldAskUser, getOutputMode, handleError, formatResult)

export {
  MODES,
  getMode,
  getModeNames,
} from './interfaces/mode-configs.js';

export type {
  GoodVibesRuntime,
  RuntimeState,
  ModeController,
  ModeChangeResult,
  ModeChangeEffect,
  ModeEffectSystem,
  ModeEffects,
  OutputModeEffects,
  OutputVerbosity,
  TelemetryLevel,
  ErrorModeEffects,
  ErrorStrategy,
  AmbiguityStrategy,
  RiskStrategy,
  CommunicationModeEffects,
  ReportFormat,
  ExecutionModeEffects,
  CheckpointFrequency,
  LoggingModeEffects,
  ModeAwareComponent,
  ModeAwareBehavior,
  ModeAwareFormatter,
  OutputType,
  FormatConfig,
  ProgressContext,
  DecisionContext,
  ResultContext,
  ErrorContext,
  ModeAwareErrorHandler,
  ErrorHandlingContext,
  ErrorHandlingResult,
  ErrorActionTaken,
  FixResult,
  ErrorActionDecision,
  ModeAwareDecisionMaker,
  DecisionMakingContext,
  DecisionOption,
  DecisionSituation,
  DecisionResult,
  DecisionMethod,
  ModeConfigLoader,
  ModeValidation,
  ModeValidationError,
  ModeValidationWarning,
  ModeBehaviorCoordinator,
  CoordinatedComponent,
  ComponentBehavior,
  ModeSwitchHooks,
  BeforeSwitchContext,
  AfterSwitchContext,
  SwitchErrorContext,
  ValidateSwitchContext,
  SwitchValidation,
  ModeWiringFactory,
} from './interfaces/mode-wiring.js';

export {
  isModeConfig,
  isValidModeName,
  isErrorStrategy,
  isOutputVerbosity,
  isCheckpointFrequency,
} from './interfaces/mode-wiring.js';

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
  StateOperation as BatchStateOperation,
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

// ============================================================================
// MCP Server
// ============================================================================

/**
 * BatchEngineServer - MCP server for batch orchestration and execution.
 */
class BatchEngineServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      { name: SERVER_NAME, version: VERSION },
      { capabilities: { tools: {} } }
    );

    this.setupHandlers();
    this.setupErrorHandling();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug('ListTools request');
      return { tools: toolDefinitions };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      logger.tool(name, args);

      if (!hasHandler(name)) {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}. Available: ${listHandlers().join(', ')}`
        );
      }

      const handler = getHandler(name);
      if (!handler) {
        throw new McpError(ErrorCode.InternalError, `Handler not found: ${name}`);
      }

      try {
        return await handler(args);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Tool ${name} failed`, { error: message, args });
        throw new McpError(ErrorCode.InternalError, `Tool ${name} failed: ${message}`);
      }
    });
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => logger.error('MCP Server error', error);

    process.on('SIGINT', async () => {
      logger.info('Shutting down');
      await this.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Shutting down');
      await this.stop();
      process.exit(0);
    });
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info(`${SERVER_NAME} v${VERSION} started`);
    logger.info(`Tools: ${listHandlers().join(', ')}`);
  }

  async stop(): Promise<void> {
    await this.server.close();
  }
}

async function main(): Promise<void> {
  try {
    const server = new BatchEngineServer();
    await server.start();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Failed to start server', { error: message });
    process.exit(1);
  }
}

main();
