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
  AgentPoolConfig,
  AgentPoolStats,
  AgentCallback,
} from "./agent-pool.js";
