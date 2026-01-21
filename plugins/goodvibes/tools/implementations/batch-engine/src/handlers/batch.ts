/**
 * batch handler - Main batch orchestration tool
 * @see SPEC-v2 Section 13.3
 */

import * as crypto from 'crypto';
import type { CallToolResult, TextContent } from '@modelcontextprotocol/sdk/types.js';
import type {
  BatchToolInput,
  BatchToolOutput,
  BatchPreview,
  PhasePreview,
  OperationPreview,
  BatchError,
  BatchPhase,
  BatchExecutionContext,
  BatchExecutionOptions,
  DEFAULT_EXECUTION_OPTIONS,
} from '../interfaces/tools/batch-tool.js';
import { PHASE_ORDER } from '../interfaces/tools/batch-tool.js';
import type { Batch, BatchConfig, OutputConfig } from '../interfaces/batch.js';
import type { BatchResult, PhaseResult, OperationResult, ValidationResult } from '../interfaces/result.js';
import type { OperationBase } from '../interfaces/operation.js';
import type { ReadOperation } from '../interfaces/operations/read.js';
import type { WriteOperation } from '../interfaces/operations/write.js';
import type { ExecOperation, QueryOperation, StateOperation } from '../interfaces/operations/exec.js';
import {
  createRuntimeContext,
  initializeRuntime,
  persistRuntime,
  type RuntimeContext,
} from '../runtime/index.js';

/**
 * Output modes for batch tool responses
 */
type OutputMode = 'count_only' | 'minimal' | 'standard' | 'verbose';

/**
 * Tool handler type
 */
export type ToolHandler = (args: unknown) => Promise<CallToolResult>;

/**
 * Generate a unique batch ID
 */
function generateBatchId(): string {
  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const random = crypto.randomBytes(4).toString('hex');
  return `batch_${timestamp}_${random}`;
}

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
    if (obj.output && typeof obj.output === 'object' && obj.output !== null) {
      const output = obj.output as Record<string, unknown>;
      if (output.mode && typeof output.mode === 'string') {
        if (['count_only', 'minimal', 'standard', 'verbose'].includes(output.mode)) {
          return output.mode as OutputMode;
        }
      }
    }
  }
  return 'standard';
}

/**
 * Create a successful result
 */
function successResult<T>(data: T, outputMode: OutputMode, executionMs: number): { success: true; data: T; meta: { output_mode: OutputMode; token_estimate: number; execution_ms: number } } {
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
function errorResult(error: string, outputMode: OutputMode, executionMs: number): { success: false; error: string; meta: { output_mode: OutputMode; token_estimate: number; execution_ms: number } } {
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
 * Default batch configuration
 */
const DEFAULT_BATCH_CONFIG: BatchConfig = {
  transaction: {
    mode: 'atomic',
    isolation: 'strict',
    timeout_ms: 60000,
  },
  execution: {
    mode: 'parallel',
    max_workers: 10,
    fail_fast: true,
    retry: {
      attempts: 3,
      backoff: 'exponential',
      delay_ms: 1000,
    },
  },
  preview: {
    dry_run: false,
    diff: true,
    impact: true,
  },
  validation: {
    before: ['typecheck'],
    after: ['typecheck', 'lint'],
    on_fail: 'rollback',
  },
  recovery: {
    checkpoint: true,
    rollback_on_fail: true,
    cleanup_on_success: true,
  },
};

/**
 * Active batch executions (for status tracking)
 */
const activeBatches = new Map<string, BatchExecutionContext>();

/**
 * Completed batch results (for status queries)
 */
const completedBatches = new Map<string, BatchToolOutput>();

/**
 * Count total operations in a batch
 */
function countOperations(operations: BatchToolInput['operations']): number {
  if (!operations) return 0;
  return (
    (operations.read?.length || 0) +
    (operations.write?.length || 0) +
    (operations.exec?.length || 0) +
    (operations.query?.length || 0) +
    (operations.state?.length || 0)
  );
}

/**
 * Collect all affected files from operations
 */
function collectAffectedFiles(operations: BatchToolInput['operations']): string[] {
  const files = new Set<string>();

  if (operations?.read) {
    for (const op of operations.read) {
      if ('files' in op && Array.isArray(op.files)) {
        for (const file of op.files) {
          if (typeof file === 'string') {
            files.add(file);
          } else if (file && typeof file === 'object' && 'path' in file) {
            files.add(file.path);
          }
        }
      }
      if ('pattern' in op && op.pattern) {
        // Glob patterns - can't determine files without executing
      }
    }
  }

  if (operations?.write) {
    for (const op of operations.write) {
      if ('edits' in op && Array.isArray(op.edits)) {
        for (const edit of op.edits) {
          if ('file' in edit && edit.file) {
            files.add(edit.file);
          }
        }
      }
      if ('file' in op && typeof op.file === 'string') {
        files.add(op.file);
      }
    }
  }

  return Array.from(files);
}

/**
 * Collect all commands to run from exec operations
 */
function collectCommands(operations: BatchToolInput['operations']): string[] {
  const commands: string[] = [];

  if (operations?.exec) {
    for (const op of operations.exec) {
      if (op.type === 'command' && 'commands' in op) {
        for (const cmd of op.commands) {
          commands.push(cmd.cmd);
        }
      }
    }
  }

  return commands;
}

/**
 * Assess risk level of batch operations
 */
function assessRiskLevel(operations: BatchToolInput['operations']): {
  level: 'low' | 'medium' | 'high' | 'critical';
  factors: string[];
} {
  const factors: string[] = [];
  let riskScore = 0;

  // Check for write operations
  const writeCount = operations?.write?.length || 0;
  if (writeCount > 0) {
    riskScore += writeCount * 2;
    factors.push(`${writeCount} file write operations`);
  }

  // Check for delete operations
  if (operations?.write) {
    const deleteOps = operations.write.filter(op => op.type === 'delete');
    if (deleteOps.length > 0) {
      riskScore += deleteOps.length * 5;
      factors.push(`${deleteOps.length} file delete operations`);
    }
  }

  // Check for exec operations
  if (operations?.exec) {
    const cmdOps = operations.exec.filter(op => op.type === 'command');
    if (cmdOps.length > 0) {
      riskScore += cmdOps.length * 3;
      factors.push(`${cmdOps.length} command executions`);
    }

    const agentOps = operations.exec.filter(op => op.type === 'agent');
    if (agentOps.length > 0) {
      riskScore += agentOps.length * 4;
      factors.push(`${agentOps.length} agent spawns`);
    }
  }

  // Check for state operations that modify
  if (operations?.state) {
    const modifyOps = operations.state.filter(op =>
      op.type === 'set' || op.type === 'delete_state'
    );
    if (modifyOps.length > 0) {
      riskScore += modifyOps.length;
      factors.push(`${modifyOps.length} state modifications`);
    }
  }

  // Determine level based on score
  let level: 'low' | 'medium' | 'high' | 'critical';
  if (riskScore >= 20) {
    level = 'critical';
  } else if (riskScore >= 10) {
    level = 'high';
  } else if (riskScore >= 5) {
    level = 'medium';
  } else {
    level = 'low';
  }

  return { level, factors };
}

/**
 * Generate a preview of what the batch would do
 */
function generatePreview(input: BatchToolInput): BatchPreview {
  const phases: PhasePreview[] = [];
  const operations = input.operations;

  // Read phase
  if (operations?.read && operations.read.length > 0) {
    phases.push({
      phase: 'read',
      operations: operations.read.map(op => ({
        id: op.id,
        type: op.type,
        description: describeOperation(op),
        targets: extractTargets(op),
        estimated_tokens: estimateOperationTokens(op),
      })),
      parallel_groups: [operations.read.map(op => op.id)],
    });
  }

  // Write phase
  if (operations?.write && operations.write.length > 0) {
    phases.push({
      phase: 'write',
      operations: operations.write.map(op => ({
        id: op.id,
        type: op.type,
        description: describeOperation(op),
        targets: extractTargets(op),
        estimated_tokens: estimateOperationTokens(op),
      })),
      parallel_groups: groupByDependencies(operations.write),
    });
  }

  // Exec phase
  if (operations?.exec && operations.exec.length > 0) {
    phases.push({
      phase: 'exec',
      operations: operations.exec.map(op => ({
        id: op.id,
        type: op.type,
        description: describeOperation(op),
        targets: extractTargets(op),
        estimated_tokens: estimateOperationTokens(op),
      })),
      parallel_groups: groupByDependencies(operations.exec),
    });
  }

  // Query phase
  if (operations?.query && operations.query.length > 0) {
    phases.push({
      phase: 'query',
      operations: operations.query.map(op => ({
        id: op.id,
        type: op.type,
        description: describeOperation(op),
        targets: extractTargets(op),
        estimated_tokens: estimateOperationTokens(op),
      })),
      parallel_groups: [operations.query.map(op => op.id)],
    });
  }

  // State phase
  if (operations?.state && operations.state.length > 0) {
    phases.push({
      phase: 'state',
      operations: operations.state.map(op => ({
        id: op.id,
        type: op.type,
        description: describeOperation(op),
        targets: extractTargets(op),
        estimated_tokens: estimateOperationTokens(op),
      })),
      parallel_groups: [operations.state.map(op => op.id)],
    });
  }

  const totalOperations = countOperations(operations);
  const estimatedTokens = phases.reduce(
    (sum, p) => sum + p.operations.reduce((s, o) => s + o.estimated_tokens, 0),
    0
  );
  const risk = assessRiskLevel(operations);

  return {
    phases,
    total_operations: totalOperations,
    estimated_tokens: estimatedTokens,
    estimated_duration_ms: estimatedTokens * 10, // Rough estimate
    files_affected: collectAffectedFiles(operations),
    commands_to_run: collectCommands(operations),
    risk_level: risk.level,
    risk_factors: risk.factors,
  };
}

/**
 * Describe an operation for preview
 */
function describeOperation(op: OperationBase): string {
  switch (op.type) {
    case 'files':
      return 'Read files';
    case 'search':
      return 'Search content';
    case 'glob':
      return 'Find files by pattern';
    case 'symbols':
      return 'Get code symbols';
    case 'create':
      return 'Create new file';
    case 'edit':
      return 'Edit file';
    case 'delete':
      return 'Delete file';
    case 'move':
      return 'Move file';
    case 'atomic':
      return 'Atomic multi-file edit';
    case 'command':
      return 'Execute shell command';
    case 'agent':
      return 'Spawn background agent';
    case 'script':
      return 'Run script';
    case 'lsp':
      return 'LSP query';
    case 'validate':
      return 'Run validation';
    case 'diagnose':
      return 'Diagnose issue';
    case 'get':
      return 'Get state value';
    case 'set':
      return 'Set state value';
    case 'delete_state':
      return 'Delete state';
    case 'list':
      return 'List state keys';
    case 'track':
      return 'Track memory entry';
    case 'query':
      return 'Query memory';
    default:
      return `${op.type} operation`;
  }
}

/**
 * Extract targets from an operation
 */
function extractTargets(op: OperationBase): string[] {
  const targets: string[] = [];
  const anyOp = op as unknown as Record<string, unknown>;

  if (anyOp.files && Array.isArray(anyOp.files)) {
    for (const f of anyOp.files) {
      if (typeof f === 'string') targets.push(f);
      else if (f && typeof f === 'object' && 'path' in f) targets.push((f as { path: string }).path);
    }
  }
  if (anyOp.file && typeof anyOp.file === 'string') {
    targets.push(anyOp.file);
  }
  if (anyOp.pattern && typeof anyOp.pattern === 'string') {
    targets.push(anyOp.pattern);
  }
  if (anyOp.commands && Array.isArray(anyOp.commands)) {
    for (const cmd of anyOp.commands) {
      if (cmd && typeof cmd === 'object' && 'cmd' in cmd) {
        targets.push((cmd as { cmd: string }).cmd);
      }
    }
  }
  if (anyOp.keys && Array.isArray(anyOp.keys)) {
    targets.push(...anyOp.keys);
  }

  return targets;
}

/**
 * Estimate tokens for an operation
 */
function estimateOperationTokens(op: OperationBase): number {
  // Base estimate
  let tokens = 100;

  const anyOp = op as unknown as Record<string, unknown>;

  // Adjust based on operation type
  switch (op.type) {
    case 'files':
    case 'search':
      tokens = 500;
      break;
    case 'agent':
      tokens = 5000; // Agents use significant tokens
      break;
    case 'edit':
    case 'atomic':
      tokens = 300;
      break;
    case 'command':
      tokens = 200;
      break;
    default:
      tokens = 100;
  }

  // Adjust for number of targets
  if (anyOp.files && Array.isArray(anyOp.files)) {
    tokens *= Math.max(1, anyOp.files.length);
  }

  return tokens;
}

/**
 * Group operations by dependencies for parallel execution
 */
function groupByDependencies(operations: OperationBase[]): string[][] {
  const groups: string[][] = [];
  const processed = new Set<string>();
  const dependencyMap = new Map<string, Set<string>>();

  // Build dependency map
  for (const op of operations) {
    dependencyMap.set(op.id, new Set(op.depends_on || []));
  }

  // Process operations in dependency order
  while (processed.size < operations.length) {
    const currentGroup: string[] = [];

    for (const op of operations) {
      if (processed.has(op.id)) continue;

      const deps = dependencyMap.get(op.id) || new Set();
      const allDepsProcessed = Array.from(deps).every(d => processed.has(d));

      if (allDepsProcessed) {
        currentGroup.push(op.id);
      }
    }

    if (currentGroup.length === 0) {
      // Circular dependency or missing dependency - add remaining
      const remaining = operations.filter(op => !processed.has(op.id)).map(op => op.id);
      groups.push(remaining);
      break;
    }

    groups.push(currentGroup);
    currentGroup.forEach(id => processed.add(id));
  }

  return groups;
}

/**
 * Execute a single phase of the batch
 */
async function executePhase(
  phase: BatchPhase,
  operations: OperationBase[],
  context: BatchExecutionContext,
  runtime: RuntimeContext,
): Promise<PhaseResult> {
  const startTime = Date.now();
  const results: OperationResult[] = [];
  let totalTokens = 0;

  // Group operations for parallel execution
  const groups = groupByDependencies(operations);

  for (const group of groups) {
    const groupOps = operations.filter(op => group.includes(op.id));

    // Execute group in parallel
    const groupResults = await Promise.all(
      groupOps.map(op => executeOperation(op, context, runtime))
    );

    results.push(...groupResults);
    totalTokens += groupResults.reduce((sum, r) => sum + r.tokens_used, 0);

    // Check for failures in fail-fast mode
    const config = context.batch.config;
    if (config.execution.fail_fast) {
      const failed = groupResults.find(r => r.status === 'failed');
      if (failed) {
        break;
      }
    }
  }

  const duration_ms = Date.now() - startTime;
  const succeeded = results.filter(r => r.status === 'success').length;
  const failed = results.filter(r => r.status === 'failed').length;

  let status: 'success' | 'partial' | 'failed';
  if (failed === 0) {
    status = 'success';
  } else if (succeeded > 0) {
    status = 'partial';
  } else {
    status = 'failed';
  }

  return {
    status,
    results,
    duration_ms,
    tokens_used: totalTokens,
  };
}

/**
 * Execute a single operation
 */
async function executeOperation(
  operation: OperationBase,
  context: BatchExecutionContext,
  runtime: RuntimeContext,
): Promise<OperationResult> {
  const startTime = Date.now();

  try {
    // Record telemetry start
    runtime.telemetry.recordOperationStart(operation);

    // Check conditions
    if (operation.skip_if) {
      for (const condition of operation.skip_if) {
        if (evaluateCondition(condition.expression, context)) {
          return {
            id: operation.id,
            type: operation.type,
            status: 'skipped',
            data: { reason: `Skip condition met: ${condition.expression}` },
            duration_ms: Date.now() - startTime,
            tokens_used: 0,
          };
        }
      }
    }

    if (operation.when) {
      for (const condition of operation.when) {
        if (!evaluateCondition(condition.expression, context)) {
          return {
            id: operation.id,
            type: operation.type,
            status: 'skipped',
            data: { reason: `When condition not met: ${condition.expression}` },
            duration_ms: Date.now() - startTime,
            tokens_used: 0,
          };
        }
      }
    }

    // Execute based on operation type
    const data = await executeOperationByType(operation, context, runtime);
    const duration_ms = Date.now() - startTime;
    const tokens_used = estimateTokens(JSON.stringify(data));

    const result: OperationResult = {
      id: operation.id,
      type: operation.type,
      status: 'success',
      data,
      duration_ms,
      tokens_used,
    };

    // Check expectations
    if (operation.expect) {
      for (const expectation of operation.expect) {
        if (!evaluateExpectation(expectation.expression, data, context)) {
          result.status = 'failed';
          result.error = {
            code: 'EXPECTATION_FAILED',
            message: expectation.message || `Expectation failed: ${expectation.expression}`,
          };
          break;
        }
      }
    }

    // Record telemetry complete
    runtime.telemetry.recordOperationComplete(operation.id, result);

    return result;
  } catch (error) {
    const duration_ms = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    const result: OperationResult = {
      id: operation.id,
      type: operation.type,
      status: 'failed',
      data: null,
      error: {
        code: 'EXECUTION_ERROR',
        message: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      },
      duration_ms,
      tokens_used: 0,
    };

    runtime.telemetry.recordOperationComplete(operation.id, result);
    return result;
  }
}

/**
 * Execute operation by type
 * This is a placeholder - in a real implementation, this would delegate to specific operation handlers
 */
async function executeOperationByType(
  operation: OperationBase,
  context: BatchExecutionContext,
  runtime: RuntimeContext,
): Promise<unknown> {
  // TODO: Implement actual operation execution
  // For now, return mock results based on operation type

  switch (operation.type) {
    case 'files':
      return { files_read: 0, total_lines: 0 };
    case 'search':
      return { matches: [], total: 0 };
    case 'glob':
      return { files: [], total: 0 };
    case 'symbols':
      return { symbols: [] };
    case 'create':
      return { created: true };
    case 'edit':
      return { edited: true };
    case 'delete':
      return { deleted: true };
    case 'move':
      return { moved: true };
    case 'atomic':
      return { edits_applied: 0 };
    case 'command':
      return { exit_code: 0, stdout: '', stderr: '' };
    case 'agent':
      return { agent_id: '', status: 'spawned' };
    case 'script':
      return { exit_code: 0, output: '' };
    case 'lsp':
      return { results: [] };
    case 'validate':
      return { valid: true, errors: [] };
    case 'diagnose':
      return { diagnosis: '', suggestions: [] };
    case 'get':
      return { values: {} };
    case 'set':
      return { set: true };
    case 'delete_state':
      return { deleted: true };
    case 'list':
      return { keys: [] };
    case 'track':
      return { tracked: true };
    case 'query':
      return { results: [] };
    default:
      return {};
  }
}

/**
 * Evaluate a condition expression
 */
function evaluateCondition(expression: string, context: BatchExecutionContext): boolean {
  // Simple condition evaluation
  // In a real implementation, this would parse and evaluate the expression

  // Check for common patterns
  if (expression === 'true') return true;
  if (expression === 'false') return false;

  // Check for result references like "result.op_id.status == 'success'"
  const resultMatch = expression.match(/result\.(\w+)\.(\w+)\s*==\s*'(\w+)'/);
  if (resultMatch) {
    const [, opId, field, expectedValue] = resultMatch;
    const result = context.phase_results[context.current_phase];
    if (result && typeof result === 'object' && opId && opId in (result as Record<string, unknown>)) {
      const opResult = (result as Record<string, Record<string, unknown>>)[opId];
      if (opResult && field) {
        return opResult[field] === expectedValue;
      }
    }
  }

  return true; // Default to true for unknown expressions
}

/**
 * Evaluate an expectation expression
 */
function evaluateExpectation(
  expression: string,
  data: unknown,
  context: BatchExecutionContext
): boolean {
  // Simple expectation evaluation
  if (expression === 'true') return true;
  if (expression === 'false') return false;

  // Check for data references like "data.status == 'success'"
  if (expression.startsWith('data.') && data && typeof data === 'object') {
    const match = expression.match(/data\.(\w+)\s*==\s*'(\w+)'/);
    if (match) {
      const [, field, expectedValue] = match;
      if (field) {
        return (data as Record<string, unknown>)[field] === expectedValue;
      }
    }
  }

  return true; // Default to true for unknown expressions
}

/**
 * Run validation checks
 */
async function runValidation(
  checks: string[],
  runtime: RuntimeContext,
): Promise<ValidationResult> {
  const errors: string[] = [];

  for (const check of checks) {
    // TODO: Implement actual validation
    // For now, assume all checks pass
  }

  return {
    check: checks.join(','),
    passed: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Main batch handler
 */
export const handleBatch: ToolHandler = async (args: unknown) => {
  const getElapsed = startTimer();
  const outputMode = parseOutputMode(args);
  const input = args as BatchToolInput;

  try {
    // Validate input
    if (!input.operations && !input.discovery) {
      return toCallToolResult(errorResult(
        'Either operations or discovery must be provided',
        outputMode,
        getElapsed()
      ));
    }

    // Generate batch ID
    const batchId = generateBatchId();

    // Check for dry_run or preview
    if (input.dry_run || input.preview) {
      const preview = generatePreview(input);
      const output: BatchToolOutput = {
        batch_id: batchId,
        status: 'dry_run',
        preview,
        duration_ms: getElapsed(),
        tokens_used: estimateTokens(JSON.stringify(preview)),
      };

      return toCallToolResult(successResult(output, outputMode, getElapsed()));
    }

    // Initialize runtime
    const runtime = createRuntimeContext();
    await initializeRuntime(runtime);

    // Create batch configuration
    const config: BatchConfig = {
      ...DEFAULT_BATCH_CONFIG,
      ...(input.config || {}),
    };

    // Create batch object
    const batch: Batch = {
      id: batchId,
      operations: input.operations || {},
      config,
      lifecycle: {},
      output: {
        mode: outputMode,
        include: [],
        exclude: [],
      },
    };

    // Create execution context
    const context: BatchExecutionContext = {
      batch,
      current_phase: 'read',
      completed_phases: [],
      phase_results: {} as Record<BatchPhase, unknown>,
      start_time: new Date().toISOString(),
    };

    // Store in active batches
    activeBatches.set(batchId, context);

    // Record telemetry start
    runtime.telemetry.recordBatchStart(batch);

    // Create checkpoint if configured
    let checkpointId: string | undefined;
    if (config.recovery.checkpoint) {
      const checkpoint = runtime.state.createCheckpoint(batchId, 'batch_start');
      checkpointId = checkpoint.id;
      context.checkpoint_id = checkpointId;
    }

    // Run before validation
    const beforeValidation = await runValidation(config.validation.before, runtime);

    if (!beforeValidation.passed && config.validation.on_fail === 'rollback') {
      // Validation failed, abort
      const output: BatchToolOutput = {
        batch_id: batchId,
        status: 'failed',
        errors: [{
          phase: 'read',
          code: 'VALIDATION_FAILED',
          message: `Before validation failed: ${beforeValidation.errors?.join(', ')}`,
          recoverable: true,
        }],
        duration_ms: getElapsed(),
        tokens_used: 0,
      };

      activeBatches.delete(batchId);
      completedBatches.set(batchId, output);

      return toCallToolResult(successResult(output, outputMode, getElapsed()));
    }

    // Execute phases in order
    const phaseResults: Partial<Record<BatchPhase, PhaseResult>> = {};
    let totalOperations = 0;
    let succeededOperations = 0;
    let failedOperations = 0;
    let skippedOperations = 0;
    let totalTokens = 0;
    const errors: BatchError[] = [];
    let rollbackTriggered = false;

    const operations = input.operations || {};

    // Execute each phase
    for (const phase of PHASE_ORDER) {
      const phaseOps = getPhaseOperations(phase, operations);
      if (phaseOps.length === 0) continue;

      context.current_phase = phase;

      const phaseResult = await executePhase(phase, phaseOps, context, runtime);

      phaseResults[phase] = phaseResult;
      context.phase_results[phase] = phaseResult;
      context.completed_phases.push(phase);

      // Accumulate stats
      totalOperations += phaseResult.results.length;
      succeededOperations += phaseResult.results.filter(r => r.status === 'success').length;
      failedOperations += phaseResult.results.filter(r => r.status === 'failed').length;
      skippedOperations += phaseResult.results.filter(r => r.status === 'skipped').length;
      totalTokens += phaseResult.tokens_used;

      // Collect errors
      for (const result of phaseResult.results) {
        if (result.status === 'failed' && result.error) {
          errors.push({
            phase,
            operation_id: result.id,
            code: result.error.code,
            message: result.error.message,
            recoverable: true,
          });
        }
      }

      // Check for phase failure
      if (phaseResult.status === 'failed' && config.execution.fail_fast) {
        break;
      }
    }

    // Run after validation
    const afterValidation = await runValidation(config.validation.after, runtime);

    // Determine overall status
    let status: 'success' | 'partial' | 'failed' | 'rolled_back';
    if (failedOperations === 0 && afterValidation.passed) {
      status = 'success';
    } else if (succeededOperations > 0) {
      status = 'partial';

      // Rollback if configured
      if (config.recovery.rollback_on_fail && checkpointId) {
        try {
          runtime.state.restoreCheckpoint(checkpointId);
          status = 'rolled_back';
          rollbackTriggered = true;
        } catch {
          // Rollback failed
        }
      }
    } else {
      status = 'failed';

      if (config.recovery.rollback_on_fail && checkpointId) {
        try {
          runtime.state.restoreCheckpoint(checkpointId);
          status = 'rolled_back';
          rollbackTriggered = true;
        } catch {
          // Rollback failed
        }
      }
    }

    // Calculate execution graph
    const executionGraph = {
      phases: context.completed_phases,
      parallel_groups: PHASE_ORDER.map(phase => {
        const ops = getPhaseOperations(phase, operations);
        return ops.length > 0 ? groupByDependencies(ops) : [];
      }).flat(),
      critical_path_ms: getElapsed(),
    };

    // Build result
    const batchResult: BatchResult = {
      summary: {
        status,
        operations_total: totalOperations,
        operations_succeeded: succeededOperations,
        operations_failed: failedOperations,
        operations_skipped: skippedOperations,
        duration_ms: getElapsed(),
        tokens_used: totalTokens,
      },
      phases: phaseResults as BatchResult['phases'],
      validation: {
        before: beforeValidation,
        after: afterValidation,
      },
      recovery: {
        checkpoint_id: checkpointId,
        rollback_available: !!checkpointId,
        rollback_triggered: rollbackTriggered,
      },
      execution_graph: executionGraph,
    };

    // Record telemetry complete
    runtime.telemetry.recordBatchComplete(batchId, batchResult);

    // Persist runtime state
    await persistRuntime(runtime);

    // Cleanup checkpoint if successful and configured
    if (status === 'success' && config.recovery.cleanup_on_success) {
      runtime.state.cleanupCheckpoints();
    }

    // Build output
    const output: BatchToolOutput = {
      batch_id: batchId,
      status,
      result: batchResult,
      errors: errors.length > 0 ? errors : undefined,
      duration_ms: getElapsed(),
      tokens_used: totalTokens,
    };

    // Move from active to completed
    activeBatches.delete(batchId);
    completedBatches.set(batchId, output);

    // Format output based on mode
    let responseData: unknown;
    switch (outputMode) {
      case 'count_only':
        responseData = {
          batch_id: batchId,
          status,
          operations_total: totalOperations,
          operations_succeeded: succeededOperations,
          operations_failed: failedOperations,
        };
        break;

      case 'minimal':
        responseData = {
          batch_id: batchId,
          status,
          summary: batchResult.summary,
          errors: errors.length > 0 ? errors.map(e => e.message) : undefined,
        };
        break;

      case 'verbose':
        responseData = output;
        break;

      default: // standard
        responseData = {
          batch_id: batchId,
          status,
          summary: batchResult.summary,
          validation: batchResult.validation,
          recovery: batchResult.recovery,
          errors: errors.length > 0 ? errors : undefined,
        };
    }

    return toCallToolResult(successResult(responseData, outputMode, getElapsed()));

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return toCallToolResult(errorResult(errorMessage, outputMode, getElapsed()));
  }
};

/**
 * Get operations for a specific phase
 */
function getPhaseOperations(
  phase: BatchPhase,
  operations: BatchToolInput['operations']
): OperationBase[] {
  if (!operations) return [];

  switch (phase) {
    case 'read':
      return (operations.read || []) as OperationBase[];
    case 'write':
      return (operations.write || []) as OperationBase[];
    case 'exec':
      return (operations.exec || []) as OperationBase[];
    case 'query':
      return (operations.query || []) as OperationBase[];
    case 'state':
      return (operations.state || []) as OperationBase[];
    default:
      return [];
  }
}

/**
 * Get active batch context (for status queries)
 */
export function getActiveBatch(batchId: string): BatchExecutionContext | undefined {
  return activeBatches.get(batchId);
}

/**
 * Get completed batch result (for status queries)
 */
export function getCompletedBatch(batchId: string): BatchToolOutput | undefined {
  return completedBatches.get(batchId);
}

/**
 * List all active batches
 */
export function listActiveBatches(): string[] {
  return Array.from(activeBatches.keys());
}

/**
 * List all completed batches
 */
export function listCompletedBatches(): string[] {
  return Array.from(completedBatches.keys());
}
