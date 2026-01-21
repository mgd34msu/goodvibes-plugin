/**
 * Recovery Orchestrator implementation for Batch Engine
 * @see SPEC-v2 Section 11
 */

import * as crypto from 'crypto';
import type {
  RecoveryOrchestrator,
  RecoveryManager,
  RecoveryContext,
  RecoveryDecision,
  RecoveryResult,
  RecoveryAction,
  RecoveryMode,
  RecoveryEvent,
  RecoveryEventHandler,
  RecoveryEventData,
  RecoveryHistoryEntry,
  RecoveryStats,
  RecoveryConfig,
  RecoveryHistoryFilter,
} from '../interfaces/recovery.js';
import { DEFAULT_RECOVERY_CONFIG } from '../interfaces/recovery.js';
import type {
  CheckpointSystem,
  Checkpoint,
} from '../interfaces/checkpoint.js';
import type {
  FixLoop,
  FixResult,
  FixContext,
  FixableError,
} from '../interfaces/fix-loop.js';
import type {
  RollbackSystem,
  RollbackResult,
} from '../interfaces/rollback.js';
import type {
  Batch,
  BatchConfig,
} from '../interfaces/batch.js';
import type {
  BatchResult,
  OperationResult,
} from '../interfaces/result.js';

/**
 * Generate a unique ID with prefix
 */
function generateId(prefix: string): string {
  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const random = crypto.randomBytes(4).toString('hex');
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Check if an error can be auto-fixed
 */
function isAutoFixable(error: Error | FixableError): boolean {
  if ('type' in error) {
    const fixableError = error as FixableError;
    // These error types are candidates for auto-fixing
    return ['lint_error', 'format_error', 'import_error', 'typescript_error'].includes(fixableError.type);
  }
  return false;
}

/**
 * Calculate exponential backoff delay
 */
function exponentialBackoff(attempt: number, baseDelayMs: number = 1000): number {
  return Math.min(baseDelayMs * Math.pow(2, attempt - 1), 30000);
}

/**
 * Recovery Orchestrator implementation
 * Coordinates checkpoint, fix-loop, and rollback systems
 */
export class RecoveryOrchestratorImpl implements RecoveryOrchestrator {
  public checkpoint: CheckpointSystem;
  public fixLoop: FixLoop;
  public rollback: RollbackSystem;
  public mode: RecoveryMode;

  protected eventHandlers: Map<RecoveryEvent, RecoveryEventHandler[]>;

  constructor(
    checkpoint: CheckpointSystem,
    fixLoop: FixLoop,
    rollback: RollbackSystem,
    mode: RecoveryMode = 'fix_loop'
  ) {
    this.checkpoint = checkpoint;
    this.fixLoop = fixLoop;
    this.rollback = rollback;
    this.mode = mode;
    this.eventHandlers = new Map();
  }

  /**
   * Prepare batch for recovery (create checkpoint)
   */
  async prepareBatch(batch: Batch, config: BatchConfig): Promise<Checkpoint | null> {
    // Check if checkpoint is needed based on config
    if (!config.recovery.checkpoint) {
      return null;
    }

    // Create checkpoint
    const checkpoint = await this.checkpoint.create({
      batch_id: batch.id,
      reason: 'batch_start',
      type: 'automatic',
    });

    // Emit event
    this.emit('checkpoint_created', {
      event: 'checkpoint_created',
      timestamp: new Date().toISOString(),
      batch_id: batch.id,
      checkpoint_id: checkpoint.id,
    });

    return checkpoint;
  }

  /**
   * Handle operation failure
   * Decides what recovery action to take for a failed operation
   */
  async handleOperationFailure(context: RecoveryContext): Promise<RecoveryDecision> {
    const { mode, failed_operations } = context;

    // If mode is 'none', fail immediately
    if (mode === 'none') {
      return {
        action: {
          type: 'abort',
          reason: 'Recovery mode is set to none',
        },
        context,
        decided_at: new Date().toISOString(),
        decided_by: 'mode_config',
      };
    }

    // Get the primary failed operation
    const failedOp = failed_operations[0];
    if (!failedOp || !failedOp.error) {
      return {
        action: {
          type: 'abort',
          reason: 'No error information available',
        },
        context,
        decided_at: new Date().toISOString(),
        decided_by: 'error_type',
      };
    }

    // Parse error to see if it's fixable
    const error = this.parseOperationError(failedOp);

    // Determine action based on mode and error type
    if (mode === 'fix_loop' || mode === 'full') {
      // Check if error can be fixed
      if (this.fixLoop.canFix(error)) {
        return {
          action: {
            type: 'fix',
            reason: `Error type '${error.type}' is auto-fixable`,
            data: { error },
          },
          context,
          decided_at: new Date().toISOString(),
          decided_by: 'error_type',
        };
      }
    }

    // If fix not available or mode is auto_rollback, rollback
    if (mode === 'auto_rollback' || mode === 'full') {
      return {
        action: {
          type: 'rollback',
          reason: 'Error cannot be auto-fixed, rolling back',
        },
        context,
        decided_at: new Date().toISOString(),
        decided_by: 'mode_config',
      };
    }

    // If mode is checkpoint only, ask user
    if (mode === 'checkpoint') {
      return {
        action: {
          type: 'ask_user',
          reason: 'Checkpoint mode requires user decision',
        },
        context,
        decided_at: new Date().toISOString(),
        decided_by: 'mode_config',
      };
    }

    // Default: continue
    return {
      action: {
        type: 'continue',
        reason: 'Continuing with partial results',
      },
      context,
      decided_at: new Date().toISOString(),
      decided_by: 'mode_config',
    };
  }

  /**
   * Handle batch failure
   * Executes full recovery flow for batch-level failure
   */
  async handleBatchFailure(context: RecoveryContext): Promise<RecoveryResult> {
    const startTime = Date.now();
    const { mode, failed_operations, checkpoint } = context;

    // If mode is 'none', fail immediately
    if (mode === 'none') {
      return {
        success: false,
        action_taken: {
          type: 'abort',
          reason: 'Recovery mode is set to none',
        },
        duration_ms: Date.now() - startTime,
        error: 'Recovery disabled',
      };
    }

    // Try fix loop first if enabled
    if (mode === 'fix_loop' || mode === 'full') {
      for (const failedOp of failed_operations) {
        const error = this.parseOperationError(failedOp);

        if (this.fixLoop.canFix(error)) {
          this.emit('fix_started', {
            event: 'fix_started',
            timestamp: new Date().toISOString(),
            batch_id: context.batch.id,
            operation_id: failedOp.id,
            error,
          });

          const fixContext: FixContext = {
            operation: failedOp,
            batch: context.batch,
            error,
            attempt: 1,
            max_attempts: context.max_fix_attempts,
            prior_attempts: [],
          };

          const fixResult = await this.fixLoop.run(fixContext);

          if (fixResult.success) {
            this.emit('fix_succeeded', {
              event: 'fix_succeeded',
              timestamp: new Date().toISOString(),
              batch_id: context.batch.id,
              operation_id: failedOp.id,
              result: fixResult,
            });

            return {
              success: true,
              action_taken: {
                type: 'fix',
                reason: 'Fix loop successfully resolved errors',
              },
              fix_result: fixResult,
              duration_ms: Date.now() - startTime,
            };
          } else {
            this.emit('fix_failed', {
              event: 'fix_failed',
              timestamp: new Date().toISOString(),
              batch_id: context.batch.id,
              operation_id: failedOp.id,
              result: fixResult,
            });
          }
        }
      }
    }

    // If fix failed or not attempted, try rollback
    if ((mode === 'auto_rollback' || mode === 'full') && checkpoint) {
      this.emit('rollback_started', {
        event: 'rollback_started',
        timestamp: new Date().toISOString(),
        batch_id: context.batch.id,
        checkpoint_id: checkpoint.id,
      });

      const rollbackResult = await this.rollback.toCheckpoint(checkpoint.id, 'all');

      if (rollbackResult.success) {
        this.emit('rollback_succeeded', {
          event: 'rollback_succeeded',
          timestamp: new Date().toISOString(),
          batch_id: context.batch.id,
          result: rollbackResult,
        });

        return {
          success: true,
          action_taken: {
            type: 'rollback',
            reason: 'Rolled back to checkpoint after fix failure',
          },
          rollback_result: rollbackResult,
          checkpoint_restored: checkpoint.id,
          duration_ms: Date.now() - startTime,
        };
      } else {
        this.emit('rollback_failed', {
          event: 'rollback_failed',
          timestamp: new Date().toISOString(),
          batch_id: context.batch.id,
          result: rollbackResult,
        });

        return {
          success: false,
          action_taken: {
            type: 'rollback',
            reason: 'Rollback attempted but failed',
          },
          rollback_result: rollbackResult,
          duration_ms: Date.now() - startTime,
          error: rollbackResult.errors?.join('; '),
        };
      }
    }

    // No recovery possible
    return {
      success: false,
      action_taken: {
        type: 'abort',
        reason: 'No recovery options available',
      },
      duration_ms: Date.now() - startTime,
      error: 'Recovery not possible',
    };
  }

  /**
   * Execute recovery action
   * Performs the specified recovery action
   */
  async executeAction(action: RecoveryAction, context: RecoveryContext): Promise<RecoveryResult> {
    const startTime = Date.now();

    switch (action.type) {
      case 'fix': {
        const error = (action.data as { error: FixableError }).error;
        const failedOp = context.failed_operations[0];

        if (!failedOp) {
          return {
            success: false,
            action_taken: action,
            duration_ms: Date.now() - startTime,
            error: 'No failed operation to fix',
          };
        }

        const fixContext: FixContext = {
          operation: failedOp,
          batch: context.batch,
          error,
          attempt: 1,
          max_attempts: context.max_fix_attempts,
          prior_attempts: [],
        };

        const fixResult = await this.fixLoop.run(fixContext);

        return {
          success: fixResult.success,
          action_taken: action,
          fix_result: fixResult,
          duration_ms: Date.now() - startTime,
          error: fixResult.success ? undefined : 'Fix loop failed',
        };
      }

      case 'rollback': {
        if (!context.checkpoint) {
          return {
            success: false,
            action_taken: action,
            duration_ms: Date.now() - startTime,
            error: 'No checkpoint available for rollback',
          };
        }

        const rollbackResult = await this.rollback.toCheckpoint(context.checkpoint.id, 'all');

        return {
          success: rollbackResult.success,
          action_taken: action,
          rollback_result: rollbackResult,
          checkpoint_restored: context.checkpoint.id,
          duration_ms: Date.now() - startTime,
          error: rollbackResult.success ? undefined : rollbackResult.errors?.join('; '),
        };
      }

      case 'continue':
        return {
          success: true,
          action_taken: action,
          duration_ms: Date.now() - startTime,
        };

      case 'abort':
        return {
          success: false,
          action_taken: action,
          duration_ms: Date.now() - startTime,
          error: action.reason,
        };

      case 'ask_user':
        return {
          success: false,
          action_taken: action,
          duration_ms: Date.now() - startTime,
          error: 'User intervention required',
        };

      default:
        return {
          success: false,
          action_taken: action,
          duration_ms: Date.now() - startTime,
          error: `Unknown action type: ${(action as RecoveryAction).type}`,
        };
    }
  }

  /**
   * Register event handler
   */
  on(event: RecoveryEvent, handler: RecoveryEventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  /**
   * Unregister event handler
   */
  off(event: RecoveryEvent, handler: RecoveryEventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Emit event to registered handlers
   */
  private emit(event: RecoveryEvent, data: RecoveryEventData): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event, data);
        } catch (error) {
          // Ignore handler errors
          console.error(`Error in recovery event handler for ${event}:`, error);
        }
      }
    }
  }

  /**
   * Parse operation error into FixableError structure
   */
  protected parseOperationError(operation: OperationResult): FixableError {
    if (!operation.error) {
      return {
        type: 'runtime_error',
        message: 'Unknown error',
      };
    }

    // Try to infer error type from error message
    const message = operation.error.message.toLowerCase();
    let type: FixableError['type'] = 'runtime_error';

    if (message.includes('typescript') || message.includes('ts(')) {
      type = 'typescript_error';
    } else if (message.includes('eslint') || message.includes('lint')) {
      type = 'lint_error';
    } else if (message.includes('prettier') || message.includes('format')) {
      type = 'format_error';
    } else if (message.includes('import') || message.includes('module')) {
      type = 'import_error';
    } else if (message.includes('test') || message.includes('expect')) {
      type = 'test_failure';
    } else if (message.includes('build')) {
      type = 'build_error';
    }

    return {
      type,
      message: operation.error.message,
      code: operation.error.code,
    };
  }
}

/**
 * Recovery Manager implementation
 * Extends orchestrator with history, stats, and lifecycle management
 */
export class RecoveryManagerImpl extends RecoveryOrchestratorImpl implements RecoveryManager {
  public config: RecoveryConfig;
  public history: RecoveryHistoryEntry[];
  public stats: RecoveryStats;

  constructor(
    checkpoint: CheckpointSystem,
    fixLoop: FixLoop,
    rollback: RollbackSystem,
    config: RecoveryConfig = { ...DEFAULT_RECOVERY_CONFIG }
  ) {
    super(checkpoint, fixLoop, rollback, config.mode);
    this.config = config;
    this.history = [];
    this.stats = this.createDefaultStats();
  }

  /**
   * Initialize the recovery manager
   */
  async initialize(): Promise<void> {
    // Reset history and stats
    this.history = [];
    this.stats = this.createDefaultStats();
  }

  /**
   * Shutdown the recovery manager
   */
  async shutdown(): Promise<void> {
    // Clear event handlers
    this.eventHandlers.clear();
  }

  /**
   * Override handleBatchFailure to track history
   */
  async handleBatchFailure(context: RecoveryContext): Promise<RecoveryResult> {
    const decision: RecoveryDecision = {
      action: {
        type: 'fix',
        reason: 'Attempting recovery',
      },
      context,
      decided_at: new Date().toISOString(),
      decided_by: 'mode_config',
    };

    const result = await super.handleBatchFailure(context);

    // Track history if enabled
    if (this.config.keep_history) {
      const entry: RecoveryHistoryEntry = {
        id: generateId('recovery'),
        batch_id: context.batch.id,
        timestamp: new Date().toISOString(),
        context,
        decision,
        result,
      };
      this.history.push(entry);
    }

    // Update statistics
    this.updateStats(result, context);

    return result;
  }

  /**
   * Get recovery history with optional filtering
   */
  getHistory(filter?: RecoveryHistoryFilter): RecoveryHistoryEntry[] {
    let filtered = this.history;

    if (filter?.batch_id) {
      filtered = filtered.filter(entry => entry.batch_id === filter.batch_id);
    }

    if (filter?.success !== undefined) {
      filtered = filtered.filter(entry => entry.result.success === filter.success);
    }

    if (filter?.limit) {
      filtered = filtered.slice(-filter.limit);
    }

    return filtered;
  }

  /**
   * Clear all recovery history
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Get current recovery statistics
   */
  getStats(): RecoveryStats {
    return { ...this.stats };
  }

  /**
   * Reset all statistics
   */
  resetStats(): void {
    this.stats = this.createDefaultStats();
  }

  /**
   * Create default statistics
   */
  private createDefaultStats(): RecoveryStats {
    return {
      total_recoveries: 0,
      successful_fixes: 0,
      successful_rollbacks: 0,
      failed_recoveries: 0,
      avg_fix_attempts: 0,
      avg_recovery_duration_ms: 0,
      by_error_type: {},
    };
  }

  /**
   * Update statistics based on recovery result
   */
  private updateStats(result: RecoveryResult, context: RecoveryContext): void {
    this.stats.total_recoveries++;

    if (result.success) {
      if (result.fix_result) {
        this.stats.successful_fixes++;
        const currentAvg = this.stats.avg_fix_attempts;
        const count = this.stats.successful_fixes;
        this.stats.avg_fix_attempts = ((currentAvg * (count - 1)) + result.fix_result.attempts) / count;
      }
      if (result.rollback_result) {
        this.stats.successful_rollbacks++;
      }
    } else {
      this.stats.failed_recoveries++;
    }

    // Update average duration
    const currentAvg = this.stats.avg_recovery_duration_ms;
    const total = this.stats.total_recoveries;
    this.stats.avg_recovery_duration_ms = ((currentAvg * (total - 1)) + result.duration_ms) / total;

    // Update by error type
    for (const failedOp of context.failed_operations) {
      const error = this.parseOperationError(failedOp);
      const errorType = error.type;

      if (!this.stats.by_error_type[errorType]) {
        this.stats.by_error_type[errorType] = {
          count: 0,
          success_rate: 0,
        };
      }

      const typeStats = this.stats.by_error_type[errorType];
      const prevCount = typeStats.count;
      const prevSuccesses = prevCount * typeStats.success_rate;

      typeStats.count++;
      const newSuccesses = prevSuccesses + (result.success ? 1 : 0);
      typeStats.success_rate = newSuccesses / typeStats.count;
    }
  }
}

/**
 * Global recovery manager instance
 */
let globalRecoveryManager: RecoveryManager | null = null;

/**
 * Get or create the global recovery manager
 */
export function getRecoveryManager(
  checkpoint?: CheckpointSystem,
  fixLoop?: FixLoop,
  rollback?: RollbackSystem,
  config?: RecoveryConfig
): RecoveryManager {
  if (!globalRecoveryManager) {
    if (!checkpoint || !fixLoop || !rollback) {
      throw new Error('Recovery manager not initialized. Provide checkpoint, fixLoop, and rollback systems.');
    }
    globalRecoveryManager = new RecoveryManagerImpl(checkpoint, fixLoop, rollback, config);
  }
  return globalRecoveryManager;
}

/**
 * Create a new recovery manager instance
 */
export function createRecoveryManager(
  checkpoint: CheckpointSystem,
  fixLoop: FixLoop,
  rollback: RollbackSystem,
  config?: RecoveryConfig
): RecoveryManager {
  return new RecoveryManagerImpl(checkpoint, fixLoop, rollback, config);
}

/**
 * Reset global recovery manager (useful for testing)
 */
export function resetGlobalRecoveryManager(): void {
  globalRecoveryManager = null;
}
