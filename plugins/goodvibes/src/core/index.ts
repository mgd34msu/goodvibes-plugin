/**
 * Core module exports for GoodVibes plugin.
 * Contains state management, checkpointing, fix loop, and agent pool.
 */

// State Manager
export { StateManager } from "./state-manager.js";
export type {
  SessionState,
  AgentState,
  AgentBudget,
  FileLock,
  DirtyFile,
} from "./state-manager.js";

// Checkpoint Manager
export { CheckpointManager } from "./checkpoint.js";
export type {
  Checkpoint,
  CheckpointFile,
  RollbackResult,
} from "./checkpoint.js";

// Fix Loop
export { FixLoop } from "./fix-loop.js";
export type {
  DiagnosedIssue,
  FixAttempt,
  FixChange,
  VerificationResult,
  VerificationCheck,
  FixLoopConfig,
  FixLoopResult,
  DiagnoseContext,
  DiagnoseFunction,
  FixFunction,
  FixFunctionResult,
  VerifyFunction,
} from "./fix-loop.js";

// Agent Pool
export { AgentPool } from "./agent-pool.js";
export type {
  AgentSpec,
  PoolAgent,
  AgentBudgetState,
  TokenPricing,
  AgentPoolConfig,
  AgentPoolStats,
  AgentCallback,
} from "./agent-pool.js";

// Memory System
export { Memory } from "./memory.js";
export type {
  Decision,
  Pattern,
  Failure,
  MemoryConfig,
  MemorySearchOptions,
} from "./memory.js";

// Telemetry System
export { Telemetry } from "./telemetry.js";
export type {
  Span,
  SpanEvent,
  MetricCounter,
  MetricHistogram,
  PerformanceMetrics,
  TelemetryConfig,
} from "./telemetry.js";

// Mode System
export { ModeSystem } from "./mode-system.js";
export type {
  OperatingMode,
  ModeBehavior,
  ModeConfig,
  PreservedState,
} from "./mode-system.js";

// Context Injector
export { ContextInjector } from "./context-injector.js";
export type {
  TaskType,
  ContextSource,
  ContextItem,
  AssembledContext,
  DetectionResult,
  ContextInjectorConfig,
} from "./context-injector.js";

// Logs Manager
export { LogsManager, createLogsManager } from "./logs.js";
export type {
  ILogsManager,
  DecisionLogEntry,
  ErrorLogEntry,
  ActivityLogEntry,
  ErrorCategory,
} from "./logs.js";

// Path Utilities
export {
  GOODVIBES_DIR,
  SUBDIRS,
  LOG_FILES,
  MEMORY_FILES,
  STATE_FILES,
  getGoodVibesDir,
  getLogsDir,
  getLogFilePath,
  getMemoryDir,
  getMemoryFilePath,
  getStateDir,
  getStateFilePath,
  getTelemetryDir,
  getTelemetryFilePath,
  getPlansDir,
  getAllGoodVibesDirs,
} from "./paths.js";
export type {
  LogFileType,
  MemoryFileType,
  StateFileType,
} from "./paths.js";
