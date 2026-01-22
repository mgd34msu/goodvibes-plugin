/**
 * batch_recover handler - Recovery operations for batch failures
 * @see SPEC-v2 Section 13.5
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { CallToolResult, TextContent } from '@modelcontextprotocol/sdk/types.js';
import type {
  BatchRecoverInput,
  BatchRecoverOutput,
  RecoveryOperation,
  RestoreOutput,
  RetryOutput,
  CleanupOutput,
  CheckpointSummary,
  ListCheckpointsInput,
  ListCheckpointsOutput,
  isRecoveryOperation,
  hasRollbackOptions,
  hasRestoreOptions,
  hasRetryOptions,
  hasCleanupOptions,
  hasFixOptions,
} from '../interfaces/tools/batch-recover.js';
import type { RollbackResult, RollbackScope } from '../interfaces/rollback.js';
import type { FixResult, FixStrategy, FixableError, FixAction, FixableErrorType } from '../interfaces/fix-loop.js';
import type { Checkpoint } from '../interfaces/checkpoint.js';
import {
  createRuntimeContext,
  initializeRuntime,
  persistRuntime,
} from '../runtime/index.js';
import { STATE_PATHS, getCheckpointPath } from '../interfaces/state-files.js';

/**
 * Output modes for batch recover responses
 */
type OutputMode = 'count_only' | 'minimal' | 'standard' | 'verbose';

/**
 * Tool handler type
 */
export type ToolHandler = (args: unknown) => Promise<CallToolResult>;

/**
 * Start a timer and return a function to get elapsed milliseconds
 */
function startTimer(): () => number {
  const start = performance.now();
  return () => Math.round(performance.now() - start);
}

/**
 * Estimate token count from a string
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Parse output mode from arguments
 */
function parseOutputMode(args: unknown): OutputMode {
  if (typeof args === 'object' && args !== null) {
    const obj = args as Record<string, unknown>;
    if (obj.output_mode && typeof obj.output_mode === 'string') {
      if (['count_only', 'minimal', 'standard', 'verbose'].includes(obj.output_mode)) {
        return obj.output_mode as OutputMode;
      }
    }
  }
  return 'standard';
}

/**
 * Create a successful result
 */
function successResult<T>(data: T, outputMode: OutputMode, executionMs: number) {
  return {
    success: true,
    data,
    meta: {
      output_mode: outputMode,
      token_estimate: estimateTokens(JSON.stringify(data)),
      execution_ms: executionMs,
    },
  };
}

/**
 * Create an error result
 */
function errorResult(error: string, outputMode: OutputMode, executionMs: number) {
  return {
    success: false,
    error,
    meta: {
      output_mode: outputMode,
      token_estimate: estimateTokens(error),
      execution_ms: executionMs,
    },
  };
}

/**
 * Convert result to MCP CallToolResult format
 */
function toCallToolResult<T>(result: { success: boolean; data?: T; error?: string; meta: unknown }): CallToolResult {
  const content: TextContent = {
    type: 'text',
    text: JSON.stringify(result, null, 2),
  };
  return {
    content: [content],
    isError: !result.success,
  };
}

/**
 * Get project root for file operations
 */
function getProjectRoot(): string {
  return process.env.PROJECT_ROOT || process.cwd();
}

/**
 * Execute a rollback operation
 */
async function executeRollback(
  options: NonNullable<BatchRecoverInput['rollback']>,
  runtime: ReturnType<typeof createRuntimeContext>
): Promise<RollbackResult> {
  const startTime = Date.now();
  const filesRestored: string[] = [];
  const filesFailed: string[] = [];
  const stateRestored: string[] = [];
  const stateFailed: string[] = [];
  const errors: string[] = [];

  try {
    // Determine the checkpoint to restore
    let checkpointId = options.checkpoint_id;

    if (!checkpointId && options.batch_id) {
      // Find checkpoint for this batch
      const state = runtime.state.getState();
      const checkpoint = state.checkpoints.checkpoints.find(
        cp => cp.batch_id === options.batch_id
      );
      if (checkpoint) {
        checkpointId = checkpoint.id;
      }
    }

    if (!checkpointId) {
      // Use the most recent checkpoint
      const state = runtime.state.getState();
      const checkpoints = state.checkpoints.checkpoints;
      if (checkpoints.length > 0) {
        const lastCheckpoint = checkpoints[checkpoints.length - 1];
        checkpointId = lastCheckpoint?.id;
      }
    }

    if (!checkpointId) {
      return {
        success: false,
        scope: options.scope || 'all',
        target: { type: 'checkpoint', checkpoint_id: '' },
        files_restored: [],
        files_failed: [],
        state_restored: [],
        state_failed: [],
        duration_ms: Date.now() - startTime,
        errors: ['No checkpoint available for rollback'],
      };
    }

    // Restore from checkpoint
    runtime.state.restoreCheckpoint(checkpointId);
    stateRestored.push('session');

    // If selective rollback with specific files
    if (options.files && options.files.length > 0) {
      const projectRoot = getProjectRoot();
      const checkpointPaths = getCheckpointPath(checkpointId);

      for (const file of options.files) {
        const backupPath = path.join(projectRoot, checkpointPaths.files, file);
        const targetPath = path.join(projectRoot, file);

        try {
          const backupContent = await fs.readFile(backupPath, 'utf-8');
          await fs.writeFile(targetPath, backupContent, 'utf-8');
          filesRestored.push(file);
        } catch {
          filesFailed.push(file);
          errors.push(`Failed to restore file: ${file}`);
        }
      }
    }

    return {
      success: errors.length === 0,
      scope: options.scope || 'all',
      target: { type: 'checkpoint', checkpoint_id: checkpointId },
      files_restored: filesRestored,
      files_failed: filesFailed,
      state_restored: stateRestored,
      state_failed: stateFailed,
      duration_ms: Date.now() - startTime,
      checkpoint_used: checkpointId,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    return {
      success: false,
      scope: options.scope || 'all',
      target: { type: 'checkpoint', checkpoint_id: '' },
      files_restored: filesRestored,
      files_failed: filesFailed,
      state_restored: stateRestored,
      state_failed: stateFailed,
      duration_ms: Date.now() - startTime,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

/**
 * Execute a restore operation
 */
async function executeRestore(
  options: NonNullable<BatchRecoverInput['restore']>,
  runtime: ReturnType<typeof createRuntimeContext>
): Promise<RestoreOutput> {
  const filesRestored: string[] = [];
  const filesFailed: string[] = [];
  const stateRestored: string[] = [];
  const stateFailed: string[] = [];

  try {
    const checkpointId = options.checkpoint_id;

    // Restore state (unless files_only)
    if (!options.files_only) {
      try {
        runtime.state.restoreCheckpoint(checkpointId);
        stateRestored.push('session');
      } catch {
        stateFailed.push('session');
      }
    }

    // Restore files (unless state_only)
    if (!options.state_only) {
      const projectRoot = getProjectRoot();
      const checkpointPaths = getCheckpointPath(checkpointId);
      const filesDir = path.join(projectRoot, checkpointPaths.files);

      try {
        const files = await fs.readdir(filesDir);
        for (const file of files) {
          const backupPath = path.join(filesDir, file);
          const targetPath = path.join(projectRoot, file);

          try {
            const stats = await fs.stat(backupPath);
            if (stats.isFile()) {
              const content = await fs.readFile(backupPath, 'utf-8');
              await fs.writeFile(targetPath, content, 'utf-8');
              filesRestored.push(file);
            }
          } catch {
            filesFailed.push(file);
          }
        }
      } catch {
        // Files directory may not exist
      }
    }

    return {
      checkpoint_id: checkpointId,
      files_restored: filesRestored,
      state_restored: stateRestored,
      files_failed: filesFailed,
      state_failed: stateFailed,
    };
  } catch (error) {
    return {
      checkpoint_id: options.checkpoint_id,
      files_restored: filesRestored,
      state_restored: stateRestored,
      files_failed: filesFailed,
      state_failed: stateFailed,
    };
  }
}

/**
 * Execute a retry operation
 *
 * @remarks
 * This function only works for batches executed in the current process session.
 * Retry relies on in-memory storage of completed batch information and will not
 * work for batches from previous sessions or other processes.
 */
async function executeRetry(
  options: NonNullable<BatchRecoverInput['retry']>,
  runtime: ReturnType<typeof createRuntimeContext>
): Promise<RetryOutput> {
  // Dynamic import to avoid circular dependency between batch.ts and batch-recover.ts
  const { getCompletedBatch, handleBatch } = await import('./batch.js');

  // Get the completed batch
  const completedBatch = getCompletedBatch(options.batch_id);

  if (!completedBatch) {
    // Batch not found in completed batches
    return {
      batch_id: options.batch_id,
      operations_retried: 0,
      operations_succeeded: 0,
      operations_failed: 0,
      new_batch_id: undefined,
    };
  }

  // Extract failed operations from batch result
  const failedOperations: string[] = [];

  if (completedBatch.output.result?.phases) {
    const phases = completedBatch.output.result.phases;

    // Collect all failed operations from all phases
    for (const phase of Object.values(phases)) {
      if (phase && phase.results) {
        for (const result of phase.results) {
          if (result.status === 'failed') {
            failedOperations.push(result.id);
          }
        }
      }
    }
  } else if (!completedBatch.output.result) {
    // Batch completed but had no result to inspect - this may indicate
    // the batch was aborted early or completed with no operations
    return {
      batch_id: options.batch_id,
      operations_retried: 0,
      operations_succeeded: 0,
      operations_failed: 0,
      new_batch_id: undefined,
    };
  }

  // Filter to specific operation IDs if provided
  const operationsToRetry = options.operation_ids
    ? failedOperations.filter(id => options.operation_ids.includes(id))
    : failedOperations;

  if (operationsToRetry.length === 0) {
    // No operations to retry
    return {
      batch_id: options.batch_id,
      operations_retried: 0,
      operations_succeeded: 0,
      operations_failed: 0,
      new_batch_id: undefined,
    };
  }

  // Filter the original input to only include failed operations
  const originalInput = completedBatch.input;
  const operationsToRetrySet = new Set(operationsToRetry);

  const filteredOperations: typeof originalInput.operations = {};

  if (originalInput.operations?.read) {
    const filtered = originalInput.operations.read.filter(op =>
      operationsToRetrySet.has(op.id)
    );
    // Only add if filtered array has items
    if (filtered.length > 0) {
      filteredOperations.read = filtered;
    }
  }

  if (originalInput.operations?.write) {
    const filtered = originalInput.operations.write.filter(op =>
      operationsToRetrySet.has(op.id)
    );
    if (filtered.length > 0) {
      filteredOperations.write = filtered;
    }
  }

  if (originalInput.operations?.exec) {
    const filtered = originalInput.operations.exec.filter(op =>
      operationsToRetrySet.has(op.id)
    );
    if (filtered.length > 0) {
      filteredOperations.exec = filtered;
    }
  }

  if (originalInput.operations?.query) {
    const filtered = originalInput.operations.query.filter(op =>
      operationsToRetrySet.has(op.id)
    );
    if (filtered.length > 0) {
      filteredOperations.query = filtered;
    }
  }

  if (originalInput.operations?.state) {
    const filtered = originalInput.operations.state.filter(op =>
      operationsToRetrySet.has(op.id)
    );
    if (filtered.length > 0) {
      filteredOperations.state = filtered;
    }
  }

  // After filtering, verify we found something to retry
  const totalFilteredOps =
    (filteredOperations.read?.length || 0) +
    (filteredOperations.write?.length || 0) +
    (filteredOperations.exec?.length || 0) +
    (filteredOperations.query?.length || 0) +
    (filteredOperations.state?.length || 0);

  if (totalFilteredOps === 0 && operationsToRetry.length > 0) {
    // Data integrity issue - operations marked for retry but not found in original input
    return {
      batch_id: options.batch_id,
      operations_retried: 0,
      operations_succeeded: 0,
      operations_failed: 0,
      new_batch_id: undefined,
    };
  }

  // Create new batch input with only failed operations
  // Override dry_run and preview to false, remove discovery
  const retryInput: typeof originalInput = {
    ...originalInput,
    operations: filteredOperations,
    dry_run: false,
    preview: false,
    discovery: undefined,
  };

  // Execute the retry batch using handleBatch
  const retryResult = await handleBatch(retryInput);

  // Parse the result
  let operationsSucceeded = 0;
  let operationsFailed = 0;
  let newBatchId: string | undefined;

  if (retryResult.content && retryResult.content.length > 0) {
    const resultText = retryResult.content[0]?.text;
    if (resultText && typeof resultText === 'string') {
      try {
        const parsedResult = JSON.parse(resultText);
        if (parsedResult.success && parsedResult.data) {
          newBatchId = parsedResult.data.batch_id;

          // Count successes and failures from the retry result
          if (parsedResult.data.result?.summary) {
            operationsSucceeded = parsedResult.data.result.summary.operations.succeeded || 0;
            operationsFailed = parsedResult.data.result.summary.operations.failed || 0;
          }
        }
      } catch (error) {
        // Log the error for debugging
        console.error('Failed to parse retry result:', error);
        operationsFailed = operationsToRetry.length;
      }
    }
  }

  return {
    batch_id: options.batch_id,
    operations_retried: operationsToRetry.length,
    operations_succeeded: operationsSucceeded,
    operations_failed: operationsFailed,
    new_batch_id: newBatchId,
  };
}

/**
 * Execute a cleanup operation
 */
async function executeCleanup(
  options: NonNullable<BatchRecoverInput['cleanup']>,
  runtime: ReturnType<typeof createRuntimeContext>
): Promise<CleanupOutput> {
  const errors: string[] = [];
  let checkpointsRemoved = 0;
  let bytesFreed = 0;

  try {
    const state = runtime.state.getState();
    const checkpoints = state.checkpoints.checkpoints;
    const keepLast = options.keep_last || 5;
    const olderThanHours = options.older_than_hours || 24;
    const olderThanMs = olderThanHours * 60 * 60 * 1000;
    const now = Date.now();

    // Sort checkpoints by creation time
    const sortedCheckpoints = [...checkpoints].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // Keep the most recent N checkpoints
    const toKeep = sortedCheckpoints.slice(0, keepLast);
    const candidates = sortedCheckpoints.slice(keepLast);

    // Filter candidates by age
    const toRemove = candidates.filter(cp => {
      const age = now - new Date(cp.created_at).getTime();
      return age > olderThanMs;
    });

    if (options.dry_run) {
      // Just return what would be removed
      return {
        checkpoints_removed: toRemove.length,
        bytes_freed: 0,
        checkpoints_remaining: checkpoints.length - toRemove.length,
        items_skipped: candidates.length - toRemove.length,
      };
    }

    // Actually remove checkpoints
    const projectRoot = getProjectRoot();
    for (const cp of toRemove) {
      try {
        const checkpointPaths = getCheckpointPath(cp.id);
        const checkpointDir = path.join(projectRoot, checkpointPaths.manifest).replace('/manifest.json', '');

        // Get size before deletion
        try {
          const stats = await fs.stat(checkpointDir);
          // This is a directory, so we'd need to calculate total size
          // For now, just use an estimate
          bytesFreed += 1024; // Placeholder
        } catch {
          // Ignore
        }

        // Remove checkpoint directory
        await fs.rm(checkpointDir, { recursive: true, force: true });
        checkpointsRemoved++;
      } catch (error) {
        errors.push(`Failed to remove checkpoint ${cp.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Update state to remove the deleted checkpoints
    const removedIds = new Set(toRemove.map(cp => cp.id));
    state.checkpoints.checkpoints = checkpoints.filter(cp => !removedIds.has(cp.id));

    return {
      checkpoints_removed: checkpointsRemoved,
      bytes_freed: bytesFreed,
      checkpoints_remaining: state.checkpoints.checkpoints.length,
      items_skipped: candidates.length - toRemove.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    return {
      checkpoints_removed: checkpointsRemoved,
      bytes_freed: bytesFreed,
      checkpoints_remaining: 0,
      items_skipped: 0,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

/**
 * Parse error from batch operation result
 */
function parseErrorFromOperation(opResult: any): FixableError | null {
  if (!opResult.error) return null;

  const error = opResult.error;

  // Classify error type based on error code or message
  let errorType: FixableErrorType = 'runtime_error';
  if (error.code) {
    if (error.code.startsWith('TS')) {
      errorType = 'typescript_error';
    } else if (error.code.includes('lint') || error.code.includes('eslint')) {
      errorType = 'lint_error';
    } else if (error.code.includes('prettier') || error.code.includes('format')) {
      errorType = 'format_error';
    } else if (error.code.includes('import')) {
      errorType = 'import_error';
    } else if (error.code.includes('test')) {
      errorType = 'test_failure';
    } else if (error.code.includes('build')) {
      errorType = 'build_error';
    }
  }

  return {
    type: errorType,
    message: error.message || String(error),
    code: error.code,
  };
}

/**
 * Collect errors from batch result
 */
function collectErrorsFromBatch(batchMetrics: any): FixableError[] {
  const errors: FixableError[] = [];

  // The batch metrics contain operation results
  if (batchMetrics.operations) {
    for (const op of batchMetrics.operations) {
      if (op.status === 'failed' && op.error) {
        const parsedError = parseErrorFromOperation(op);
        if (parsedError) {
          errors.push(parsedError);
        }
      }
    }
  }

  return errors;
}

/**
 * Map user strategy to internal FixStrategy type
 */
function mapStrategy(userStrategy?: 'auto' | 'agent' | 'targeted'): FixStrategy {
  switch (userStrategy) {
    case 'agent':
      return 'agent_fix';
    case 'targeted':
      return 'targeted_fix';
    case 'auto':
    default:
      return 'auto_fix';
  }
}

/**
 * Execute a fix operation
 */
async function executeFix(
  options: NonNullable<BatchRecoverInput['fix']>,
  runtime: ReturnType<typeof createRuntimeContext>
): Promise<FixResult> {
  const startTime = Date.now();
  const maxAttempts = options.max_attempts || 3;
  const strategy = mapStrategy(options.strategy);

  const actionsTaken: FixAction[] = [];
  let remainingErrors: FixableError[] = [];
  let totalTokensUsed = 0;
  let attempts = 0;

  try {
    // Get batch metrics to extract errors
    const batchMetrics = runtime.telemetry.getBatchMetrics(options.batch_id);

    // Collect all errors from failed operations
    remainingErrors = collectErrorsFromBatch(batchMetrics);

    if (remainingErrors.length === 0) {
      // No errors to fix
      return {
        success: true,
        attempts: 0,
        final_strategy: strategy,
        actions_taken: [],
        remaining_errors: [],
        total_tokens_used: 0,
        duration_ms: Date.now() - startTime,
      };
    }

    // Fix loop: attempt fixes up to max_attempts
    for (attempts = 1; attempts <= maxAttempts && remainingErrors.length > 0; attempts++) {
      const attemptStartTime = Date.now();

      // Determine strategy for this attempt
      let currentStrategy: FixStrategy;
      if (strategy === 'auto_fix' && attempts === 1) {
        currentStrategy = 'auto_fix';
      } else if (attempts === 2) {
        currentStrategy = 'agent_fix';
      } else {
        currentStrategy = 'targeted_fix';
      }

      // For auto_fix strategy, attempt to apply automatic fixes
      if (currentStrategy === 'auto_fix') {
        for (const error of remainingErrors) {
          let action: FixAction;

          switch (error.type) {
            case 'lint_error':
              action = {
                type: 'command',
                target: 'eslint --fix',
                description: 'Apply ESLint auto-fixes',
                success: false,
              };
              // In a real implementation, we would run eslint --fix
              // For now, we mark it as attempted but not successful
              break;

            case 'format_error':
              action = {
                type: 'command',
                target: 'prettier --write',
                description: 'Apply Prettier formatting',
                success: false,
              };
              break;

            case 'typescript_error':
              action = {
                type: 'command',
                target: 'tsc --noEmit',
                description: 'Check TypeScript errors',
                success: false,
              };
              break;

            default:
              action = {
                type: 'command',
                target: 'analyze',
                description: `Analyze ${error.type} error`,
                success: false,
              };
          }

          actionsTaken.push(action);

          // Estimate token usage for analysis
          totalTokensUsed += estimateTokens(JSON.stringify(error));
        }
      }
      // For agent_fix and targeted_fix, we would spawn an agent
      // For now, we log the intent
      else if (currentStrategy === 'agent_fix' || currentStrategy === 'targeted_fix') {
        const action: FixAction = {
          type: 'command',
          target: 'spawn_agent',
          description: `Spawn ${currentStrategy === 'agent_fix' ? 'code-architect' : 'specialized'} agent to fix errors`,
          success: false,
          error: 'Agent spawning not implemented in this handler',
        };
        actionsTaken.push(action);
        totalTokensUsed += 1000; // Estimate for agent spawning overhead
      }

      const attemptDuration = Date.now() - attemptStartTime;

      // In a real implementation, we would re-check for errors after fixes
      // For now, we assume fixes were not successful (as they're not actually executed)
      // and break the loop
      break;
    }

    const duration = Date.now() - startTime;

    return {
      success: remainingErrors.length === 0,
      attempts,
      final_strategy: strategy,
      actions_taken: actionsTaken,
      remaining_errors: remainingErrors,
      total_tokens_used: totalTokensUsed,
      duration_ms: duration,
    };
  } catch (error) {
    return {
      success: false,
      attempts,
      final_strategy: strategy,
      actions_taken: actionsTaken,
      remaining_errors: remainingErrors,
      total_tokens_used: totalTokensUsed,
      duration_ms: Date.now() - startTime,
    };
  }
}

/**
 * Main batch_recover handler
 */
export const handleBatchRecover: ToolHandler = async (args: unknown) => {
  const getElapsed = startTimer();
  const outputMode = parseOutputMode(args);
  const input = args as BatchRecoverInput;

  try {
    // Validate operation
    if (!input.operation) {
      return toCallToolResult(errorResult(
        'operation is required',
        outputMode,
        getElapsed()
      ));
    }

    const validOperations = ['rollback', 'restore', 'retry', 'cleanup', 'fix'];
    if (!validOperations.includes(input.operation)) {
      return toCallToolResult(errorResult(
        `Invalid operation: ${input.operation}. Must be one of: ${validOperations.join(', ')}`,
        outputMode,
        getElapsed()
      ));
    }

    // Initialize runtime
    const runtime = createRuntimeContext();
    await initializeRuntime(runtime);

    let output: BatchRecoverOutput;

    switch (input.operation) {
      case 'rollback': {
        const rollbackResult = await executeRollback(
          input.rollback || {},
          runtime
        );
        output = {
          operation: 'rollback',
          success: rollbackResult.success,
          rollback_result: rollbackResult,
          duration_ms: getElapsed(),
        };
        break;
      }

      case 'restore': {
        if (!input.restore?.checkpoint_id) {
          return toCallToolResult(errorResult(
            'restore.checkpoint_id is required for restore operation',
            outputMode,
            getElapsed()
          ));
        }
        const restoreResult = await executeRestore(input.restore, runtime);
        output = {
          operation: 'restore',
          success: restoreResult.files_failed.length === 0 && restoreResult.state_failed.length === 0,
          restore_result: restoreResult,
          duration_ms: getElapsed(),
        };
        break;
      }

      case 'retry': {
        if (!input.retry?.batch_id) {
          return toCallToolResult(errorResult(
            'retry.batch_id is required for retry operation',
            outputMode,
            getElapsed()
          ));
        }
        const retryResult = await executeRetry(input.retry, runtime);
        output = {
          operation: 'retry',
          success: retryResult.operations_failed === 0,
          retry_result: retryResult,
          duration_ms: getElapsed(),
        };
        break;
      }

      case 'cleanup': {
        const cleanupResult = await executeCleanup(
          input.cleanup || {},
          runtime
        );
        output = {
          operation: 'cleanup',
          success: !cleanupResult.errors || cleanupResult.errors.length === 0,
          cleanup_result: cleanupResult,
          duration_ms: getElapsed(),
        };
        break;
      }

      case 'fix': {
        if (!input.fix?.batch_id) {
          return toCallToolResult(errorResult(
            'fix.batch_id is required for fix operation',
            outputMode,
            getElapsed()
          ));
        }
        const fixResult = await executeFix(input.fix, runtime);
        output = {
          operation: 'fix',
          success: fixResult.success,
          fix_result: fixResult,
          duration_ms: getElapsed(),
        };
        break;
      }

      default:
        return toCallToolResult(errorResult(
          `Unknown operation: ${input.operation}`,
          outputMode,
          getElapsed()
        ));
    }

    // Persist runtime state
    await persistRuntime(runtime);

    // Format output based on mode
    let responseData: unknown;
    switch (outputMode) {
      case 'count_only':
        responseData = {
          operation: output.operation,
          success: output.success,
        };
        break;

      case 'minimal':
        responseData = {
          operation: output.operation,
          success: output.success,
          duration_ms: output.duration_ms,
        };
        break;

      case 'verbose':
        responseData = output;
        break;

      default: // standard
        responseData = {
          operation: output.operation,
          success: output.success,
          duration_ms: output.duration_ms,
          ...(output.rollback_result && {
            files_restored: output.rollback_result.files_restored.length,
            state_restored: output.rollback_result.state_restored.length,
          }),
          ...(output.restore_result && {
            files_restored: output.restore_result.files_restored.length,
            state_restored: output.restore_result.state_restored.length,
          }),
          ...(output.cleanup_result && {
            checkpoints_removed: output.cleanup_result.checkpoints_removed,
            bytes_freed: output.cleanup_result.bytes_freed,
          }),
          ...(output.error && { error: output.error }),
        };
    }

    return toCallToolResult(successResult(responseData, outputMode, getElapsed()));

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return toCallToolResult(errorResult(errorMessage, outputMode, getElapsed()));
  }
};

/**
 * List checkpoints handler
 */
export const handleListCheckpoints: ToolHandler = async (args: unknown) => {
  const getElapsed = startTimer();
  const outputMode = parseOutputMode(args);
  const input = (args || {}) as ListCheckpointsInput;

  try {
    // Initialize runtime
    const runtime = createRuntimeContext();
    await initializeRuntime(runtime);

    const state = runtime.state.getState();
    let checkpoints = state.checkpoints.checkpoints;

    // Apply filters
    if (input.batch_id) {
      checkpoints = checkpoints.filter(cp => cp.batch_id === input.batch_id);
    }

    if (!input.include_expired) {
      const now = Date.now();
      checkpoints = checkpoints.filter(cp => {
        if (!cp.expires_at) return true;
        return new Date(cp.expires_at).getTime() > now;
      });
    }

    // Sort by creation time (newest first)
    checkpoints = checkpoints.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // Apply limit
    const limit = input.limit || 50;
    const total = checkpoints.length;
    checkpoints = checkpoints.slice(0, limit);

    // Build summaries
    const summaries: CheckpointSummary[] = checkpoints.map(cp => ({
      id: cp.id,
      batch_id: cp.batch_id,
      created_at: cp.created_at,
      expires_at: cp.expires_at,
      size_bytes: 0, // Would need to calculate
      file_count: cp.files.length,
      reason: cp.reason,
    }));

    const output: ListCheckpointsOutput = {
      checkpoints: summaries,
      total,
    };

    // Format based on output mode
    let responseData: unknown;
    switch (outputMode) {
      case 'count_only':
        responseData = { total };
        break;

      case 'minimal':
        responseData = {
          checkpoints: summaries.map(cp => ({
            id: cp.id,
            created_at: cp.created_at,
          })),
          total,
        };
        break;

      case 'verbose':
        responseData = output;
        break;

      default: // standard
        responseData = {
          checkpoints: summaries.map(cp => ({
            id: cp.id,
            batch_id: cp.batch_id,
            created_at: cp.created_at,
            file_count: cp.file_count,
            reason: cp.reason,
          })),
          total,
        };
    }

    return toCallToolResult(successResult(responseData, outputMode, getElapsed()));

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return toCallToolResult(errorResult(errorMessage, outputMode, getElapsed()));
  }
};
