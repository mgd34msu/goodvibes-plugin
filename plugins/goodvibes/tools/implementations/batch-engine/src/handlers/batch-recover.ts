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
import type { FixResult, FixStrategy } from '../interfaces/fix-loop.js';
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
 */
async function executeRetry(
  options: NonNullable<BatchRecoverInput['retry']>,
  runtime: ReturnType<typeof createRuntimeContext>
): Promise<RetryOutput> {
  // TODO: Implement actual retry logic
  // For now, return a placeholder result

  return {
    batch_id: options.batch_id,
    operations_retried: 0,
    operations_succeeded: 0,
    operations_failed: 0,
    new_batch_id: undefined,
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
 * Execute a fix operation
 */
async function executeFix(
  options: NonNullable<BatchRecoverInput['fix']>,
  runtime: ReturnType<typeof createRuntimeContext>
): Promise<FixResult> {
  // TODO: Implement actual fix loop logic
  // For now, return a placeholder result

  return {
    success: false,
    attempts: 0,
    final_strategy: 'auto_fix',
    actions_taken: [],
    remaining_errors: [],
    total_tokens_used: 0,
    duration_ms: 0,
  };
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
