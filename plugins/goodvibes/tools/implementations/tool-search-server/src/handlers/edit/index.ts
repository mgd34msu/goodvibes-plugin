/**
 * Edit handlers
 *
 * Provides code editing and conflict resolution tools:
 * - resolve_merge_conflict: Intelligently resolve git merge conflicts using LLM
 * - atomic_multi_edit: Apply multiple edits atomically with validation and rollback
 *
 * @module handlers/edit
 */

// Resolve Merge Conflict
export { handleResolveMergeConflict } from './resolve-merge-conflict.js';
export type { ResolveMergeConflictArgs } from './resolve-merge-conflict.js';

// Atomic Multi-Edit
export { handleAtomicMultiEdit } from './atomic-multi-edit.js';
export type {
  AtomicMultiEditArgs,
  AtomicMultiEditResult,
  EditOperation,
  ValidationOptions,
} from './atomic-multi-edit.js';

// Auto-rollback
export { handleAutoRollback } from './auto-rollback.js';
export type {
  AutoRollbackArgs,
  AutoRollbackResult,
  RollbackTrigger,
} from './auto-rollback.js';

// Retry with Learning
export { handleRetryWithLearning } from './retry-with-learning.js';
export type {
  RetryWithLearningArgs,
  RetryWithLearningResult,
  AttemptInfo,
  FixStrategy,
} from './retry-with-learning.js';
// API Contract Validation
export { handleValidateApiContract } from './validate-api-contract.js';
export type { ValidateApiContractArgs } from './validate-api-contract.js';
