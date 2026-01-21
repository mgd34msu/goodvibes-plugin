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

// Re-export interfaces for convenience
export type { StateManager, AgentResult } from '../interfaces/state-api.js';
export type { MemoryManager, DecisionFilter, PatternFilter, FailureFilter } from '../interfaces/memory-api.js';
export type { TelemetryAPI, Bottleneck } from '../interfaces/telemetry-api.js';

/**
 * Runtime context containing all managers
 */
export interface RuntimeContext {
  state: import('../interfaces/state-api.js').StateManager;
  memory: import('../interfaces/memory-api.js').MemoryManager;
  telemetry: import('../interfaces/telemetry-api.js').TelemetryAPI;
}

/**
 * Create a complete runtime context
 */
export function createRuntimeContext(projectRoot?: string): RuntimeContext {
  return {
    state: getStateManager(projectRoot),
    memory: getMemoryManager(projectRoot),
    telemetry: getTelemetryCollector(projectRoot),
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

  await Promise.all([
    stateManager.load(),
    memoryManager.load(),
    telemetryCollector.load(),
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

  await Promise.all([
    stateManager.persist(),
    memoryManager.persist(),
    telemetryCollector.persist(),
  ]);
}

/**
 * Reset all runtime managers (useful for testing)
 */
export function resetRuntime(): void {
  resetGlobalStateManager();
  resetGlobalMemoryManager();
  resetGlobalTelemetryCollector();
}
