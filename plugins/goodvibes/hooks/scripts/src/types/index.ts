/**
 * Central export point for all type definitions.
 */

/** Telemetry tracking types for session analytics */
export type { TelemetryEntry, TelemetryTracking } from './telemetry.js';

/** Memory types for storing project learnings and decisions */
export type {
  MemoryDecision,
  MemoryPattern,
  MemoryFailure,
  MemoryPreference,
  ProjectMemory,
} from './memory.js';

/** Error tracking types for retry and escalation logic */
export type { ErrorState, ErrorCategory } from './errors.js';
export { PHASE_RETRY_LIMITS } from './errors.js';

/** Hook state types for persisting session data */
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

/** Configuration types for automation behavior */
export type { GoodVibesConfig } from './config.js';
export { getDefaultConfig } from './config.js';

/** Folder structure types for architecture pattern detection */
export type {
  ArchitecturePattern,
  SpecialDirectories,
  FolderStructure,
} from './folder-structure.js';
export { PATTERN_NAMES } from './folder-structure.js';

/** Retry tracking types for error recovery */
export type { RetryEntry, RetryData } from './retry.js';
export { isRetryData, isErrorState, DEFAULT_MAX_AGE_HOURS } from './retry.js';

/** Recent git activity types for hotspot detection */
export type {
  RecentActivity,
  FileChange,
  Hotspot,
  RecentCommit,
} from './recent-activity.js';

/** Environment configuration types for .env file management */
export type { EnvStatus, EnvironmentContext } from './environment.js';
