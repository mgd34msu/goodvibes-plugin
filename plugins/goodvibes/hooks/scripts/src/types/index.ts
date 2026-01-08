/**
 * Central export point for all type definitions.
 */

// Telemetry types
export type { TelemetryEntry, TelemetryTracking } from './telemetry.js';

// Memory types
export type {
  MemoryDecision,
  MemoryPattern,
  MemoryFailure,
  MemoryPreference,
  ProjectMemory,
} from './memory.js';

// Error types
export type { ErrorState, ErrorCategory } from './errors.js';
export { PHASE_RETRY_LIMITS } from './errors.js';

// State types
export type {
  SessionState,
  TestState,
  BuildState,
  GitState,
  FileState,
  DevServerState,
  HooksState,
} from './state.js';
export { createDefaultState } from './state.js';

// Config types
export type { GoodVibesConfig } from './config.js';
export { getDefaultConfig } from './config.js';

// Folder structure types
export type {
  ArchitecturePattern,
  SpecialDirectories,
  FolderStructure,
} from './folder-structure.js';
export { PATTERN_NAMES } from './folder-structure.js';

// Retry types
export type { RetryEntry, RetryData } from './retry.js';
export { isRetryData, isErrorState, DEFAULT_MAX_AGE_HOURS } from './retry.js';

// Recent activity types
export type {
  RecentActivity,
  FileChange,
  Hotspot,
  RecentCommit,
} from './recent-activity.js';

// Environment types
export type { EnvStatus, EnvironmentContext } from './environment.js';
