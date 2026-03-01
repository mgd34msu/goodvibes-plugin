/**
 * Persistence Module — Barrel Exports
 *
 * Exports all public types and classes from the persistence subsystem.
 */

export type { StateStore } from './types.js';
export type { StateStore as PersistenceStateStore, CrashRecovery, PersistenceRecoveryResult } from './types.js';
export { JsonStateStore } from './state-store.js';

export type {
  ReplayDeps,
  ReplayOptions,
  ReplayResult,
} from './replay-engine.js';
export { replayEvents } from './replay-engine.js';

export type {
  TriggerStateSnapshot,
  RuntimeSnapshot,
  SnapshotDeps,
} from './snapshot-manager.js';
export { SnapshotManager } from './snapshot-manager.js';

export type {
  RecoveryMethod,
  SnapshotRecoveryInfo,
  ReplayRecoveryInfo,
  RecoveryResult,
} from './startup-recovery.js';
export { recoverState } from './startup-recovery.js';

export type { CheckpointManagerDeps } from './checkpoint-manager.js';
export { CheckpointManager } from './checkpoint-manager.js';
export * from './subsystem.js';
