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

// Re-export interfaces for convenience
export type { StateManager, AgentResult } from '../interfaces/state-api.js';
export type { MemoryManager, DecisionFilter, PatternFilter, FailureFilter } from '../interfaces/memory-api.js';
export type { TelemetryAPI, Bottleneck } from '../interfaces/telemetry-api.js';
export type { CheckpointManager, CheckpointConfig, RestoreOptions, RestoreResult, CleanupResult } from '../interfaces/checkpoint.js';

/**
 * Runtime context containing all managers
 */
export interface RuntimeContext {
  state: import('../interfaces/state-api.js').StateManager;
  memory: import('../interfaces/memory-api.js').MemoryManager;
  telemetry: import('../interfaces/telemetry-api.js').TelemetryAPI;
  checkpoint: import('../interfaces/checkpoint.js').CheckpointManager;
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

  await Promise.all([
    stateManager.load(),
    memoryManager.load(),
    telemetryCollector.load(),
    checkpointManager.initialize(),
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

  await Promise.all([
    stateManager.persist(),
    memoryManager.persist(),
    telemetryCollector.persist(),
    checkpointManager.shutdown(),
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
