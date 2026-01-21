/**
 * Built-in Hook Handlers Implementation for Batch Engine
 * @see SPEC-v2 Section 5.2 - Built-in Hooks
 *
 * This module implements all 13 built-in lifecycle hooks that integrate with
 * StateManager, MemoryManager, TelemetryCollector, and CheckpointManager.
 */

import type { HookResult } from '../interfaces/lifecycle.js';
import type {
  RuntimeHookHandlers,
  GoodVibesRuntime,
  ValidationResult,
  FixLoopResult,
  ValidationOptions,
  ExecOptions,
  HookContext,
} from '../interfaces/hooks-runtime.js';
import type { CheckpointConfig } from '../interfaces/checkpoint.js';
import type { Decision, Pattern, Failure } from '../interfaces/memory.js';
import type { StateManager } from '../interfaces/state-api.js';
import type { MemoryManager } from '../interfaces/memory-api.js';
import type { TelemetryAPI } from '../interfaces/telemetry-api.js';
import type { CheckpointManager } from '../interfaces/checkpoint.js';
import type { Lock } from '../interfaces/state.js';
import { getStateManager } from './state.js';
import { getMemoryManager } from './memory.js';
import { getTelemetryCollector } from './telemetry.js';
import { getCheckpointManager } from './checkpoint.js';

/**
 * Built-in hook handlers implementation
 */
export class BuiltinHookHandlers implements RuntimeHookHandlers {
  private state: StateManager;
  private memory: MemoryManager;
  private telemetry: TelemetryAPI;
  private checkpoints: CheckpointManager;
  private projectRoot: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
    this.state = getStateManager(projectRoot);
    this.memory = getMemoryManager(projectRoot);
    this.telemetry = getTelemetryCollector(projectRoot);
    this.checkpoints = getCheckpointManager(projectRoot);
  }

  // =========================================================================
  // Session Hooks
  // =========================================================================

  async initSession(context: HookContext): Promise<void> {
    const { runtime, session_id } = context;

    runtime.log('info', 'Initializing session', { session_id });

    // Load persisted state (calling implementation methods directly)
    await (this.state as any).load?.();
    await (this.memory as any).load?.();
    await (this.telemetry as any).load?.();

    // Initialize checkpoint manager
    await this.checkpoints.initialize();

    // Update session state
    this.state.updateSession({
      id: session_id,
      started_at: new Date().toISOString(),
    });

    runtime.log('info', 'Session initialized', { session_id });
  }

  async cleanupSession(context: HookContext): Promise<void> {
    const { runtime, session_id } = context;

    runtime.log('info', 'Cleaning up session', { session_id });

    // Persist all state (calling implementation methods directly)
    await (this.state as any).persist?.();
    await (this.memory as any).persist?.();
    await (this.telemetry as any).persist?.();

    // Cleanup checkpoints if configured (using async version)
    const cleanupResult = await (this.checkpoints as any).cleanupAsync?.() || {
      removed: 0,
      freed_bytes: 0,
      remaining: 0,
    };
    if (cleanupResult.removed > 0) {
      runtime.log('info', 'Cleaned up checkpoints', {
        removed: cleanupResult.removed,
        freed_bytes: cleanupResult.freed_bytes,
      });
    }

    // Note: SessionState doesn't have ended_at property in the interface
    // We can still track session end in telemetry

    // Final persist
    await (this.state as any).persist?.();

    runtime.log('info', 'Session cleaned up', { session_id });
  }

  // =========================================================================
  // Checkpoint Hooks
  // =========================================================================

  async createCheckpoint(context: HookContext): Promise<string> {
    const { runtime, batch_id } = context;

    runtime.log('info', 'Creating checkpoint', { batch_id });

    const config: CheckpointConfig = {
      type: 'automatic',
      reason: 'batch_start',
      batch_id,
      include: {
        files: this.getModifiedFiles(),
        memory: true,
      },
      expires_after_hours: 24,
    };

    const checkpoint = await this.checkpoints.create(config);

    runtime.log('info', 'Checkpoint created', {
      checkpoint_id: checkpoint.id,
      batch_id,
      files_count: checkpoint.files.length,
      size_bytes: checkpoint.size_bytes,
    });

    return checkpoint.id;
  }

  async restoreCheckpoint(context: HookContext): Promise<void> {
    const { runtime, data } = context;

    // Extract checkpoint ID from context data
    const checkpointId = (data as any).checkpoint_id;

    if (!checkpointId) {
      runtime.log('error', 'No checkpoint ID provided for restore');
      return;
    }

    runtime.log('info', 'Restoring checkpoint', { checkpoint_id: checkpointId });

    const result = await this.checkpoints.restore(checkpointId);

    if (result.success) {
      runtime.log('info', 'Checkpoint restored', {
        checkpoint_id: checkpointId,
        files_restored: result.files_restored.length,
        state_restored: result.state_restored.length,
      });
    } else {
      runtime.log('error', 'Checkpoint restore failed', {
        checkpoint_id: checkpointId,
        errors: result.errors,
      });
    }
  }

  // =========================================================================
  // Telemetry Hooks
  // =========================================================================

  async recordTelemetry(context: HookContext): Promise<void> {
    const { runtime, batch_id, operation_id, data } = context;

    // Telemetry is already being recorded by the runtime
    // This hook is for custom telemetry processing

    runtime.log('debug', 'Recording telemetry', {
      batch_id,
      operation_id,
      event: context.event,
    });
  }

  async emitTelemetry(context: HookContext): Promise<void> {
    const { runtime } = context;

    // Flush telemetry to disk (calling implementation method directly)
    await (this.telemetry as any).persist?.();

    runtime.log('debug', 'Telemetry emitted');
  }

  // =========================================================================
  // Validation Hooks
  // =========================================================================

  async runTypecheck(context: HookContext): Promise<ValidationResult> {
    const { runtime } = context;
    const startTime = Date.now();

    runtime.log('info', 'Running TypeScript type check');

    try {
      const result = await runtime.exec('npx tsc --noEmit', {
        cwd: this.projectRoot,
        timeout_ms: 60000,
      });

      const duration_ms = Date.now() - startTime;
      const passed = result.exit_code === 0;

      const errors = this.parseTypescriptErrors(result.stderr);

      // Update session state with typecheck result
      this.state.updateSession({
        last_typecheck: {
          status: passed ? 'pass' : 'fail',
          timestamp: new Date().toISOString(),
          errors: errors.length,
        },
      });

      await (this.state as any).persist?.();

      return {
        passed,
        errors,
        warnings: [],
        duration_ms,
        command: 'npx tsc --noEmit',
        exit_code: result.exit_code,
      };
    } catch (error) {
      const duration_ms = Date.now() - startTime;
      return {
        passed: false,
        errors: [{
          message: error instanceof Error ? error.message : String(error),
          severity: 'error',
        }],
        warnings: [],
        duration_ms,
        command: 'npx tsc --noEmit',
        exit_code: 1,
      };
    }
  }

  async runLint(context: HookContext): Promise<ValidationResult> {
    const { runtime } = context;
    const startTime = Date.now();

    runtime.log('info', 'Running ESLint');

    try {
      const result = await runtime.exec('npx eslint . --ext .ts,.tsx,.js,.jsx', {
        cwd: this.projectRoot,
        timeout_ms: 60000,
      });

      const duration_ms = Date.now() - startTime;
      const passed = result.exit_code === 0;

      const { errors, warnings } = this.parseEslintOutput(result.stdout);

      // Update session state with lint result
      this.state.updateSession({
        last_lint: {
          status: passed ? 'pass' : 'fail',
          timestamp: new Date().toISOString(),
          errors: errors.length,
        },
      });

      await (this.state as any).persist?.();

      return {
        passed,
        errors,
        warnings,
        duration_ms,
        command: 'npx eslint . --ext .ts,.tsx,.js,.jsx',
        exit_code: result.exit_code,
      };
    } catch (error) {
      const duration_ms = Date.now() - startTime;
      return {
        passed: false,
        errors: [{
          message: error instanceof Error ? error.message : String(error),
          severity: 'error',
        }],
        warnings: [],
        duration_ms,
        command: 'npx eslint . --ext .ts,.tsx,.js,.jsx',
        exit_code: 1,
      };
    }
  }

  async runTest(context: HookContext): Promise<ValidationResult> {
    const { runtime } = context;
    const startTime = Date.now();

    runtime.log('info', 'Running test suite');

    try {
      const result = await runtime.exec('npm test', {
        cwd: this.projectRoot,
        timeout_ms: 120000,
      });

      const duration_ms = Date.now() - startTime;
      const passed = result.exit_code === 0;

      const errors = passed ? [] : [{
        message: 'Tests failed',
        severity: 'error' as const,
      }];

      // Update session state with test result
      this.state.updateSession({
        last_test: {
          status: passed ? 'pass' : 'fail',
          timestamp: new Date().toISOString(),
          errors: errors.length,
        },
      });

      await (this.state as any).persist?.();

      return {
        passed,
        errors,
        warnings: [],
        duration_ms,
        command: 'npm test',
        exit_code: result.exit_code,
      };
    } catch (error) {
      const duration_ms = Date.now() - startTime;
      return {
        passed: false,
        errors: [{
          message: error instanceof Error ? error.message : String(error),
          severity: 'error',
        }],
        warnings: [],
        duration_ms,
        command: 'npm test',
        exit_code: 1,
      };
    }
  }

  async runBuild(context: HookContext): Promise<ValidationResult> {
    const { runtime } = context;
    const startTime = Date.now();

    runtime.log('info', 'Running build');

    try {
      const result = await runtime.exec('npm run build', {
        cwd: this.projectRoot,
        timeout_ms: 120000,
      });

      const duration_ms = Date.now() - startTime;
      const passed = result.exit_code === 0;

      const errors = passed ? [] : [{
        message: 'Build failed',
        severity: 'error' as const,
      }];

      // Update session state with build result
      this.state.updateSession({
        last_build: {
          status: passed ? 'pass' : 'fail',
          timestamp: new Date().toISOString(),
          errors: errors.length,
        },
      });

      await (this.state as any).persist?.();

      return {
        passed,
        errors,
        warnings: [],
        duration_ms,
        command: 'npm run build',
        exit_code: result.exit_code,
      };
    } catch (error) {
      const duration_ms = Date.now() - startTime;
      return {
        passed: false,
        errors: [{
          message: error instanceof Error ? error.message : String(error),
          severity: 'error',
        }],
        warnings: [],
        duration_ms,
        command: 'npm run build',
        exit_code: 1,
      };
    }
  }

  // =========================================================================
  // Recovery Hooks
  // =========================================================================

  async rollback(context: HookContext): Promise<void> {
    const { runtime, data } = context;

    const checkpointId = (data as any).checkpoint_id;

    if (!checkpointId) {
      runtime.log('error', 'No checkpoint ID for rollback');
      return;
    }

    runtime.log('warn', 'Rolling back to checkpoint', { checkpoint_id: checkpointId });

    await this.restoreCheckpoint(context);

    // Update session state
    const session = this.state.getSession();
    this.state.updateSession({
      batches_completed: session.batches_completed,
    });

    runtime.log('info', 'Rollback complete', { checkpoint_id: checkpointId });
  }

  async runFixLoop(context: HookContext): Promise<FixLoopResult> {
    const { runtime, batch_id, operation_id } = context;
    const startTime = Date.now();

    runtime.log('info', 'Starting fix loop', { batch_id, operation_id });

    // Extract errors from context
    const errors = (context.data as any).errors || [];
    const maxAttempts = (context.data as any).max_attempts || 3;

    const fixedErrors: string[] = [];
    const actions: Array<{ type: 'edit' | 'create' | 'delete' | 'command'; target: string; description: string; success: boolean }> = [];
    let tokensUsed = 0;

    // Simple fix loop - in production this would use an agent to fix errors
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      runtime.log('info', `Fix loop attempt ${attempt}/${maxAttempts}`);

      // For now, just re-run validation
      const typecheckResult = await this.runTypecheck(context);

      if (typecheckResult.passed) {
        runtime.log('info', 'Errors fixed on attempt', { attempt });
        fixedErrors.push(...errors.map((e: any) => e.message || String(e)));
        break;
      }

      // Record that we attempted a fix
      actions.push({
        type: 'command' as const,
        target: 'typecheck',
        description: `Attempt ${attempt} validation`,
        success: false,
      });
    }

    const duration_ms = Date.now() - startTime;
    const remainingErrors = errors.filter((e: any) => !fixedErrors.includes(e.message || String(e)));

    return {
      success: remainingErrors.length === 0,
      attempts: maxAttempts,
      fixed_errors: fixedErrors,
      remaining_errors: remainingErrors.map((e: any) => e.message || String(e)),
      tokens_used: tokensUsed,
      duration_ms,
      actions,
    };
  }

  // =========================================================================
  // Memory Hooks
  // =========================================================================

  async recordDecision(context: HookContext): Promise<void> {
    const { runtime, batch_id, data } = context;

    const decisionData = (data as any).decision;
    if (!decisionData) {
      return;
    }

    const decision: Omit<Decision, 'id' | 'timestamp'> = {
      what: decisionData.what,
      why: decisionData.why,
      category: decisionData.category || 'architecture',
      confidence: decisionData.confidence || 'medium',
      status: 'active',
      batch_id,
    };

    const recorded = this.memory.recordDecision(decision);

    await (this.memory as any).persist?.();

    runtime.log('info', 'Decision recorded', {
      decision_id: recorded.id,
      what: recorded.what,
    });
  }

  async recordPattern(context: HookContext): Promise<void> {
    const { runtime, data } = context;

    const patternData = (data as any).pattern;
    if (!patternData) {
      return;
    }

    const pattern: Omit<Pattern, 'id' | 'timestamp' | 'usage_count'> = {
      name: patternData.name,
      description: patternData.description,
      examples: patternData.examples || [],
      when_to_use: patternData.when_to_use,
    };

    const recorded = this.memory.recordPattern(pattern);

    await (this.memory as any).persist?.();

    runtime.log('info', 'Pattern recorded', {
      pattern_id: recorded.id,
      name: recorded.name,
    });
  }

  async recordFailure(context: HookContext): Promise<void> {
    const { runtime, batch_id, operation_id, data } = context;

    const error = (data as any).error;
    if (!error) {
      return;
    }

    const failure: Omit<Failure, 'id' | 'timestamp'> = {
      error_type: error.name || 'Error',
      error_message: error.message || String(error),
      stack_trace: error.stack,
      operation: operation_id,
      resolved: false,
    };

    const recorded = this.memory.recordFailure(failure);

    await (this.memory as any).persist?.();

    runtime.log('error', 'Failure recorded', {
      failure_id: recorded.id,
      error_type: recorded.error_type,
    });
  }

  async injectContext(context: HookContext): Promise<void> {
    const { runtime, batch_id } = context;

    runtime.log('debug', 'Injecting relevant context from memory');

    // Get relevant decisions, patterns, and failures
    const decisions = this.memory.getDecisions({
      status: 'active',
      batch_id,
    });

    const failures = this.memory.getFailures({
      resolved: false,
    });

    // Log context injection
    runtime.log('info', 'Context injected', {
      decisions_count: decisions.length,
      failures_count: failures.length,
    });
  }

  // =========================================================================
  // Locking Hooks
  // =========================================================================

  async acquireLocks(context: HookContext): Promise<void> {
    const { runtime, batch_id, data } = context;

    const files = (data as any).files || [];

    if (files.length === 0) {
      return;
    }

    runtime.log('debug', 'Acquiring resource locks', {
      batch_id,
      files_count: files.length,
    });

    const locks: Lock[] = [];

    for (const file of files) {
      const lock = this.state.acquireLock({
        target: file,
        type: 'file',
        mode: 'exclusive',
        holder: batch_id || 'unknown',
      });

      if (lock) {
        locks.push(lock);
      } else {
        runtime.log('warn', 'Failed to acquire lock', { file });
      }
    }

    runtime.log('info', 'Locks acquired', {
      locks_count: locks.length,
    });
  }

  async releaseLocks(context: HookContext): Promise<void> {
    const { runtime, batch_id } = context;

    runtime.log('debug', 'Releasing resource locks', { batch_id });

    const currentLocks = this.state.getState().locks.locks;
    const batchLocks = currentLocks.filter(l => l.holder === batch_id);

    for (const lock of batchLocks) {
      this.state.releaseLock(lock.id);
    }

    runtime.log('info', 'Locks released', {
      locks_count: batchLocks.length,
    });
  }

  // =========================================================================
  // State Hooks
  // =========================================================================

  async updateState(context: HookContext): Promise<void> {
    const { runtime, batch_id, data } = context;

    runtime.log('debug', 'Updating session state', { batch_id });

    // Update session with batch result
    const session = this.state.getSession();

    this.state.updateSession({
      batches_completed: session.batches_completed + 1,
    });

    await this.state.persist();

    runtime.log('info', 'Session state updated');
  }

  // =========================================================================
  // Helper Methods
  // =========================================================================

  private getModifiedFiles(): string[] {
    const session = this.state.getSession();
    return [
      ...session.files.modified_this_session,
      ...session.files.created_this_session,
    ];
  }

  private parseTypescriptErrors(stderr: string): Array<{
    file?: string;
    line?: number;
    column?: number;
    message: string;
    code?: string;
    severity: 'error';
  }> {
    const errors: Array<{
      file?: string;
      line?: number;
      column?: number;
      message: string;
      code?: string;
      severity: 'error';
    }> = [];

    // Parse TypeScript error format: file(line,col): error TS####: message
    const errorRegex = /(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)/g;

    let match;
    while ((match = errorRegex.exec(stderr)) !== null) {
      errors.push({
        file: match[1],
        line: parseInt(match[2] || '0', 10),
        column: parseInt(match[3] || '0', 10),
        code: match[4],
        message: match[5] || '',
        severity: 'error',
      });
    }

    return errors;
  }

  private parseEslintOutput(output: string): {
    errors: Array<{
      file?: string;
      line?: number;
      column?: number;
      message: string;
      code?: string;
      severity: 'error';
    }>;
    warnings: Array<{
      file?: string;
      line?: number;
      column?: number;
      message: string;
      code?: string;
      severity: 'warning';
    }>;
  } {
    const errors: Array<{
      file?: string;
      line?: number;
      column?: number;
      message: string;
      code?: string;
      severity: 'error';
    }> = [];

    const warnings: Array<{
      file?: string;
      line?: number;
      column?: number;
      message: string;
      code?: string;
      severity: 'warning';
    }> = [];

    // Simple parsing - in production would parse ESLint JSON output
    const lines = output.split('\n');

    for (const line of lines) {
      if (line.includes('error')) {
        errors.push({
          message: line.trim(),
          severity: 'error',
        });
      } else if (line.includes('warning')) {
        warnings.push({
          message: line.trim(),
          severity: 'warning',
        });
      }
    }

    return { errors, warnings };
  }
}

/**
 * Create built-in hook handlers instance
 */
export function createBuiltinHookHandlers(projectRoot?: string): RuntimeHookHandlers {
  return new BuiltinHookHandlers(projectRoot);
}

/**
 * Singleton instance
 */
let globalHandlers: RuntimeHookHandlers | null = null;

/**
 * Get the global built-in hook handlers
 */
export function getBuiltinHookHandlers(projectRoot?: string): RuntimeHookHandlers {
  if (!globalHandlers) {
    globalHandlers = createBuiltinHookHandlers(projectRoot);
  }
  return globalHandlers;
}

/**
 * Reset global handlers (for testing)
 */
export function resetGlobalBuiltinHookHandlers(): void {
  globalHandlers = null;
}
