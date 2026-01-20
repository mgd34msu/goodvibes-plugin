/**
 * Core module exports for GoodVibes plugin.
 * Contains state management, checkpointing, and foundational utilities.
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
