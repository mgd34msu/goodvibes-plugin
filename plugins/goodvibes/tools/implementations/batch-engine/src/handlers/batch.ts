/**
 * batch handler - Main batch orchestration tool
 * @see SPEC-v2 Section 13.3
 */

import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';
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
type OutputMode = 'minimal' | 'summary' | 'full' | 'verbose';

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
      if (['minimal', 'summary', 'full', 'verbose'].includes(obj.output_mode)) {
        return obj.output_mode as OutputMode;
      }
    }
    if (obj.output && typeof obj.output === 'object' && obj.output !== null) {
      const output = obj.output as Record<string, unknown>;
      if (output.mode && typeof output.mode === 'string') {
        if (['minimal', 'summary', 'full', 'verbose'].includes(output.mode)) {
          return output.mode as OutputMode;
        }
      }
    }
  }
  return 'summary';
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
 * Stores both input and output for retry capability
 */
const completedBatches = new Map<string, { input: BatchToolInput; output: BatchToolOutput }>();

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
 * Delegates to specific handlers based on operation type
 */
async function executeOperationByType(
  operation: OperationBase,
  context: BatchExecutionContext,
  runtime: RuntimeContext,
): Promise<unknown> {
  switch (operation.type) {
    // READ operations
    case 'files':
      return await executeFilesOperation(operation as ReadOperation, runtime);
    case 'search':
      return await executeSearchOperation(operation as ReadOperation, runtime);
    case 'glob':
      return await executeGlobOperation(operation as ReadOperation, runtime);
    case 'symbols':
      return await executeSymbolsOperation(operation as ReadOperation, runtime);

    // WRITE operations
    case 'create':
      return await executeCreateOperation(operation as WriteOperation, runtime);
    case 'edit':
      return await executeEditOperation(operation as WriteOperation, runtime);
    case 'delete':
      return await executeDeleteOperation(operation as WriteOperation, runtime);
    case 'move':
      return await executeMoveOperation(operation as WriteOperation, runtime);
    case 'atomic':
      return await executeAtomicOperation(operation as WriteOperation, context, runtime);

    // EXEC operations
    case 'command':
      return await executeCommandOperation(operation as ExecOperation, runtime);
    case 'agent':
      return await executeAgentOperation(operation as ExecOperation, runtime);
    case 'script':
      return await executeScriptOperation(operation as ExecOperation, runtime);

    // QUERY operations
    case 'lsp':
      return await executeLspOperation(operation as QueryOperation, runtime);
    case 'validate':
      return await executeValidateOperation(operation as QueryOperation, runtime);
    case 'diagnose':
      return await executeDiagnoseOperation(operation as QueryOperation, runtime);

    // STATE operations
    case 'get':
      return await executeGetOperation(operation as StateOperation, runtime);
    case 'set':
      return await executeSetOperation(operation as StateOperation, runtime);
    case 'delete_state':
      return await executeDeleteStateOperation(operation as StateOperation, runtime);
    case 'list':
      return await executeListOperation(operation as StateOperation, runtime);
    case 'track':
      return await executeTrackOperation(operation as StateOperation, runtime);
    case 'query':
      return await executeQueryOperation(operation as StateOperation, runtime);

    default:
      throw new Error(`Unknown operation type: ${operation.type}`);
  }
}

// ============================================================================
// READ Operation Handlers
// ============================================================================

const execAsync = promisify(execCallback);

async function executeFilesOperation(operation: ReadOperation, runtime: RuntimeContext): Promise<unknown> {
  if (operation.type !== 'files') throw new Error('Invalid operation type');

  const results: Record<string, unknown> = {};
  let totalLines = 0;

  for (const target of operation.targets) {
    const filePath = typeof target === 'string' ? target : target.path;
    const offset = typeof target === 'string' ? undefined : target.offset;
    const limit = typeof target === 'string' ? undefined : target.limit;

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      const startLine = offset ? offset - 1 : 0;
      const endLine = limit ? startLine + limit : lines.length;
      const selectedLines = lines.slice(startLine, endLine);

      totalLines += selectedLines.length;

      if (operation.extract === 'content') {
        results[filePath] = selectedLines.join('\n');
      } else if (operation.extract === 'outline') {
        // Simple outline extraction (functions, classes)
        const outline = selectedLines
          .map((line, idx) => ({ line: line.trim(), num: startLine + idx + 1 }))
          .filter(({ line }) =>
            line.startsWith('function ') ||
            line.startsWith('class ') ||
            line.startsWith('interface ') ||
            line.startsWith('type ') ||
            line.startsWith('export ')
          )
          .map(({ line, num }) => `${num}: ${line}`);
        results[filePath] = outline;
      } else if (operation.extract === 'lines') {
        results[filePath] = {
          lines: selectedLines,
          start: startLine + 1,
          end: endLine,
          total: selectedLines.length,
        };
      } else {
        results[filePath] = content;
      }
    } catch (error) {
      results[filePath] = { error: error instanceof Error ? error.message : String(error) };
    }
  }

  return { files_read: operation.targets.length, total_lines: totalLines, results };
}

async function executeSearchOperation(operation: ReadOperation, runtime: RuntimeContext): Promise<unknown> {
  if (operation.type !== 'search') throw new Error('Invalid operation type');

  const matches: Array<{ file: string; line: number; content: string }> = [];

  try {
    // Use ripgrep if available, fallback to grep
    const caseSensitive = operation.options?.case_sensitive ?? true;
    const flags = caseSensitive ? '' : '-i';
    const globPattern = operation.glob || '**/*';

    // Try ripgrep first
    const rgCommand = `rg ${flags} --line-number --no-heading "${operation.pattern}" ${globPattern}`;

    try {
      const { stdout } = await execAsync(rgCommand, { maxBuffer: 10 * 1024 * 1024 });
      const lines = stdout.split('\n').filter(l => l.trim());

      for (const line of lines) {
        const match = line.match(/^([^:]+):(\d+):(.*)$/);
        if (match && match[1] && match[2] && match[3]) {
          matches.push({
            file: match[1],
            line: parseInt(match[2], 10),
            content: match[3],
          });
        }
      }
    } catch {
      // Ripgrep not available or failed, return empty results
    }

    return { matches, total: matches.length };
  } catch (error) {
    return { matches: [], total: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

async function executeGlobOperation(operation: ReadOperation, runtime: RuntimeContext): Promise<unknown> {
  if (operation.type !== 'glob') throw new Error('Invalid operation type');

  const files: string[] = [];

  try {
    // Use glob pattern with Node.js fs
    const { glob } = await import('glob');

    for (const pattern of operation.patterns) {
      const matched = await glob(pattern, {
        ignore: operation.exclude || [],
        nodir: true,
      });
      files.push(...matched);
    }

    // Apply filters
    let filteredFiles = files;
    if (operation.filters) {
      const stats = await Promise.all(
        files.map(async (file) => {
          try {
            const stat = await fs.stat(file);
            return { file, stat };
          } catch {
            return null;
          }
        })
      );

      filteredFiles = stats
        .filter((s): s is { file: string; stat: import('fs').Stats } => s !== null)
        .filter(({ stat }) => {
          if (operation.filters?.min_size && stat.size < operation.filters.min_size) return false;
          if (operation.filters?.max_size && stat.size > operation.filters.max_size) return false;
          return true;
        })
        .map(({ file }) => file);
    }

    return { files: filteredFiles, total: filteredFiles.length };
  } catch (error) {
    return { files: [], total: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

async function executeSymbolsOperation(operation: ReadOperation, runtime: RuntimeContext): Promise<unknown> {
  if (operation.type !== 'symbols') throw new Error('Invalid operation type');

  // Symbol extraction requires LSP or AST parsing
  // This is a simplified implementation that searches for common patterns
  const symbols: Array<{ name: string; kind: string; location: string }> = [];

  try {
    const scope = operation.scope || '**/*.{ts,js,tsx,jsx}';
    const { glob } = await import('glob');
    const files = await glob(scope, { nodir: true });

    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const lines = content.split('\n');

        lines.forEach((line, idx) => {
          const trimmed = line.trim();

          // Match functions
          if (trimmed.match(/^(export\s+)?(async\s+)?function\s+(\w+)/)) {
            const match = trimmed.match(/function\s+(\w+)/);
            if (match && match[1] && match[1].includes(operation.query)) {
              symbols.push({ name: match[1], kind: 'function', location: `${file}:${idx + 1}` });
            }
          }

          // Match classes
          if (trimmed.match(/^(export\s+)?class\s+(\w+)/)) {
            const match = trimmed.match(/class\s+(\w+)/);
            if (match && match[1] && match[1].includes(operation.query)) {
              symbols.push({ name: match[1], kind: 'class', location: `${file}:${idx + 1}` });
            }
          }

          // Match interfaces
          if (trimmed.match(/^(export\s+)?interface\s+(\w+)/)) {
            const match = trimmed.match(/interface\s+(\w+)/);
            if (match && match[1] && match[1].includes(operation.query)) {
              symbols.push({ name: match[1], kind: 'interface', location: `${file}:${idx + 1}` });
            }
          }
        });
      } catch {
        // Skip files that can't be read
      }
    }

    return { symbols, total: symbols.length };
  } catch (error) {
    return { symbols: [], total: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

// ============================================================================
// WRITE Operation Handlers
// ============================================================================

async function executeCreateOperation(operation: WriteOperation, runtime: RuntimeContext): Promise<unknown> {
  if (operation.type !== 'create') throw new Error('Invalid operation type');

  const created: string[] = [];
  const errors: Record<string, string> = {};

  for (const file of operation.files) {
    try {
      // Create directories if needed
      if (operation.options?.create_dirs) {
        await fs.mkdir(path.dirname(file.path), { recursive: true });
      }

      // Check if file exists
      if (!operation.options?.overwrite) {
        try {
          await fs.access(file.path);
          errors[file.path] = 'File already exists';
          continue;
        } catch {
          // File doesn't exist, proceed
        }
      }

      await fs.writeFile(file.path, file.content, { encoding: (file.encoding || 'utf-8') as BufferEncoding });
      created.push(file.path);
    } catch (error) {
      errors[file.path] = error instanceof Error ? error.message : String(error);
    }
  }

  return { created, total: created.length, errors: Object.keys(errors).length > 0 ? errors : undefined };
}

async function executeEditOperation(operation: WriteOperation, runtime: RuntimeContext): Promise<unknown> {
  if (operation.type !== 'edit') throw new Error('Invalid operation type');

  const edited: string[] = [];
  const errors: Record<string, string> = {};

  for (const editSpec of operation.edits) {
    try {
      const content = await fs.readFile(editSpec.file, 'utf-8');
      let newContent = content;

      for (const edit of editSpec.edits) {
        if (edit.occurrence === 'all') {
          // Replace all occurrences
          const regex = new RegExp(edit.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
          newContent = newContent.replace(regex, edit.replace);
        } else if (edit.occurrence === 'first') {
          // Replace first occurrence
          newContent = newContent.replace(edit.find, edit.replace);
        } else {
          // Default to exact match replacement
          const index = newContent.indexOf(edit.find);
          if (index !== -1) {
            newContent = newContent.slice(0, index) + edit.replace + newContent.slice(index + edit.find.length);
          }
        }
      }

      await fs.writeFile(editSpec.file, newContent, 'utf-8');
      edited.push(editSpec.file);
    } catch (error) {
      errors[editSpec.file] = error instanceof Error ? error.message : String(error);
    }
  }

  return { edited, total: edited.length, errors: Object.keys(errors).length > 0 ? errors : undefined };
}

async function executeDeleteOperation(operation: WriteOperation, runtime: RuntimeContext): Promise<unknown> {
  if (operation.type !== 'delete') throw new Error('Invalid operation type');

  const deleted: string[] = [];
  const errors: Record<string, string> = {};

  for (const file of operation.files) {
    try {
      // Safety checks
      if (operation.options?.blocked_paths?.some(pattern => file.includes(pattern))) {
        errors[file] = 'Path is blocked by safety rules';
        continue;
      }

      const stat = await fs.stat(file);

      if (stat.isDirectory() && operation.options?.require_empty) {
        const contents = await fs.readdir(file);
        if (contents.length > 0) {
          errors[file] = 'Directory is not empty';
          continue;
        }
      }

      if (stat.isDirectory()) {
        await fs.rmdir(file, { recursive: true });
      } else {
        await fs.unlink(file);
      }

      deleted.push(file);
    } catch (error) {
      errors[file] = error instanceof Error ? error.message : String(error);
    }
  }

  return { deleted, total: deleted.length, errors: Object.keys(errors).length > 0 ? errors : undefined };
}

async function executeMoveOperation(operation: WriteOperation, runtime: RuntimeContext): Promise<unknown> {
  if (operation.type !== 'move') throw new Error('Invalid operation type');

  const moved: Array<{ from: string; to: string }> = [];
  const errors: Record<string, string> = {};

  for (const move of operation.moves) {
    try {
      // Create target directory if needed
      await fs.mkdir(path.dirname(move.to), { recursive: true });

      // Check if target exists
      if (!operation.options?.overwrite) {
        try {
          await fs.access(move.to);
          errors[move.from] = 'Target file already exists';
          continue;
        } catch {
          // Target doesn't exist, proceed
        }
      }

      await fs.rename(move.from, move.to);
      moved.push({ from: move.from, to: move.to });
    } catch (error) {
      errors[move.from] = error instanceof Error ? error.message : String(error);
    }
  }

  return { moved, total: moved.length, errors: Object.keys(errors).length > 0 ? errors : undefined };
}

async function executeAtomicOperation(
  operation: WriteOperation,
  context: BatchExecutionContext,
  runtime: RuntimeContext
): Promise<unknown> {
  if (operation.type !== 'atomic') throw new Error('Invalid operation type');

  const results: unknown[] = [];
  const errors: string[] = [];

  // Execute all operations atomically
  for (const subOp of operation.operations) {
    try {
      const result = await executeOperationByType(subOp as OperationBase, context, runtime);
      results.push(result);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));

      // Rollback on failure if configured
      if (operation.options?.rollback_on_failure) {
        // Trigger rollback via runtime
        throw new Error(`Atomic operation failed: ${errors.join(', ')}`);
      }

      if (!operation.options?.continue_on_error) {
        break;
      }
    }
  }

  return {
    edits_applied: results.length,
    total_operations: operation.operations.length,
    errors: errors.length > 0 ? errors : undefined,
  };
}

// ============================================================================
// EXEC Operation Handlers
// ============================================================================

async function executeCommandOperation(operation: ExecOperation, runtime: RuntimeContext): Promise<unknown> {
  if (operation.type !== 'command') throw new Error('Invalid operation type');

  const results: Array<{ cmd: string; exit_code: number; stdout: string; stderr: string }> = [];

  for (const cmd of operation.commands) {
    try {
      const timeout = cmd.timeout_ms || 30000;
      const env = { ...process.env, ...operation.options?.env };
      const cwd = operation.options?.working_dir || process.cwd();

      const { stdout, stderr } = await execAsync(cmd.cmd, {
        timeout,
        env,
        cwd,
        maxBuffer: 10 * 1024 * 1024,
      });

      results.push({
        cmd: cmd.cmd,
        exit_code: 0,
        stdout: stdout.toString(),
        stderr: stderr.toString(),
      });
    } catch (error: unknown) {
      const execError = error as { code?: number; stdout?: string; stderr?: string };
      results.push({
        cmd: cmd.cmd,
        exit_code: execError.code || 1,
        stdout: execError.stdout?.toString() || '',
        stderr: execError.stderr?.toString() || (error instanceof Error ? error.message : String(error)),
      });
    }
  }

  return { commands: results, total: results.length };
}

async function executeAgentOperation(operation: ExecOperation, runtime: RuntimeContext): Promise<unknown> {
  if (operation.type !== 'agent') throw new Error('Invalid operation type');

  /**
   * Agent spawning requires integration with the agent pool system.
   * This is a complex operation that delegates to the runtime's agent coordination system.
   *
   * Implementation approach:
   * 1. For each agent spec, call runtime.state.registerAgent()
   * 2. Return agent IDs and spawn status
   * 3. Actual agent execution happens asynchronously via the agent pool
   */

  const spawned: Array<{ id: string; agent: string; status: string }> = [];

  for (const agentSpec of operation.agents) {
    try {
      // Register agent in state
      runtime.state.registerAgent({
        id: agentSpec.id,
        agent_type: agentSpec.agent,
        task: agentSpec.task,
        started_at: new Date().toISOString(),
        budget: {
          max_tokens: agentSpec.budget?.max_tokens || 100000,
          max_turns: agentSpec.budget?.max_turns || 50,
          tokens_used: 0,
          turns_used: 0,
        },
        batch_id: '',
        operation_id: '',
      });

      spawned.push({
        id: agentSpec.id,
        agent: agentSpec.agent,
        status: 'spawned',
      });
    } catch (error) {
      spawned.push({
        id: agentSpec.id,
        agent: agentSpec.agent,
        status: 'failed',
      });
    }
  }

  return { spawned, total: spawned.length };
}

async function executeScriptOperation(operation: ExecOperation, runtime: RuntimeContext): Promise<unknown> {
  if (operation.type !== 'script') throw new Error('Invalid operation type');

  const results: Array<{ language: string; exit_code: number; output: string }> = [];

  for (const script of operation.scripts) {
    try {
      let command: string;

      switch (script.language) {
        case 'bash':
          command = 'bash';
          break;
        case 'python':
          command = 'python';
          break;
        case 'node':
          command = 'node';
          break;
        case 'deno':
          command = 'deno run';
          break;
        case 'bun':
          command = 'bun run';
          break;
        default:
          throw new Error(`Unsupported script language: ${script.language}`);
      }

      // Write script to temp file
      const tmpFile = path.join(process.cwd(), `.tmp-script-${Date.now()}`);
      await fs.writeFile(tmpFile, script.code, 'utf-8');

      try {
        const { stdout } = await execAsync(`${command} ${tmpFile}`, {
          maxBuffer: 10 * 1024 * 1024,
        });

        results.push({
          language: script.language,
          exit_code: 0,
          output: stdout,
        });
      } finally {
        // Cleanup temp file
        try {
          await fs.unlink(tmpFile);
        } catch {
          // Ignore cleanup errors
        }
      }
    } catch (error) {
      results.push({
        language: script.language,
        exit_code: 1,
        output: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { scripts: results, total: results.length };
}

// ============================================================================
// QUERY Operation Handlers (Stubs with clear documentation)
// ============================================================================

async function executeLspOperation(operation: QueryOperation, runtime: RuntimeContext): Promise<unknown> {
  if (operation.type !== 'lsp') throw new Error('Invalid operation type');

  /**
   * LSP operations require an active Language Server Protocol connection.
   * Implementation would need to:
   * 1. Initialize LSP client for the appropriate language
   * 2. Send LSP requests (textDocument/definition, textDocument/references, etc.)
   * 3. Parse and return LSP responses
   *
   * This is a complex operation that requires external LSP infrastructure.
   * For now, return a stub result indicating LSP is not yet implemented.
   */

  return {
    results: [],
    total: 0,
    message: 'LSP operations require Language Server Protocol integration (not yet implemented)',
  };
}

async function executeValidateOperation(operation: QueryOperation, runtime: RuntimeContext): Promise<unknown> {
  if (operation.type !== 'validate') throw new Error('Invalid operation type');

  /**
   * Validation operations execute various checks like typecheck, lint, test, build.
   * Implementation approach:
   * 1. For 'typecheck': Run `tsc --noEmit` or equivalent
   * 2. For 'lint': Run `eslint` or configured linter
   * 3. For 'test': Run test suite
   * 4. For 'build': Run build command
   *
   * For now, delegate to command execution where possible.
   */

  const results: Array<{ check: string; passed: boolean; errors?: string[] }> = [];

  for (const validation of operation.validations) {
    for (const check of validation.checks) {
      try {
        let command: string;

        switch (check.kind) {
          case 'typecheck':
            command = 'tsc --noEmit';
            break;
          case 'lint':
            command = 'eslint .';
            break;
          case 'test':
            command = 'npm test';
            break;
          case 'build':
            command = 'npm run build';
            break;
          default:
            throw new Error(`Unsupported validation type: ${check.kind}`);
        }

        const { stdout, stderr } = await execAsync(command, { maxBuffer: 10 * 1024 * 1024 });
        results.push({ check: check.kind, passed: true });
      } catch (error: unknown) {
        const execError = error as { stderr?: string };
        results.push({
          check: check.kind,
          passed: false,
          errors: [execError.stderr || (error instanceof Error ? error.message : String(error))],
        });
      }
    }
  }

  return { validations: results, total: results.length };
}

async function executeDiagnoseOperation(operation: QueryOperation, runtime: RuntimeContext): Promise<unknown> {
  if (operation.type !== 'diagnose') throw new Error('Invalid operation type');

  /**
   * Diagnose operations analyze errors, performance issues, memory leaks, etc.
   * Implementation would require integration with diagnostic tools and AI analysis.
   *
   * For now, return a stub indicating diagnosis is not yet implemented.
   */

  return {
    diagnoses: [],
    total: 0,
    message: 'Diagnostic operations require specialized analysis tools (not yet implemented)',
  };
}

// ============================================================================
// STATE Operation Handlers
// ============================================================================

async function executeGetOperation(operation: StateOperation, runtime: RuntimeContext): Promise<unknown> {
  if (operation.type !== 'get') throw new Error('Invalid operation type');

  /**
   * State GET operations retrieve key-value pairs from session preferences.
   * Uses the memory manager's preference system.
   */

  const values: Record<string, unknown> = {};

  for (const key of operation.keys) {
    const value = runtime.memory.getPreference(key);
    values[key] = value;
  }

  return { values, total: Object.keys(values).length };
}

async function executeSetOperation(operation: StateOperation, runtime: RuntimeContext): Promise<unknown> {
  if (operation.type !== 'set') throw new Error('Invalid operation type');

  /**
   * State SET operations store key-value pairs in session preferences.
   * Uses the memory manager's preference system.
   */

  const set: string[] = [];

  for (const entry of operation.entries) {
    const scope = operation.options?.persist ? 'project' : 'session';
    runtime.memory.setPreference(entry.key, entry.value, scope);
    set.push(entry.key);
  }

  return { set, total: set.length };
}

async function executeDeleteStateOperation(operation: StateOperation, runtime: RuntimeContext): Promise<unknown> {
  if (operation.type !== 'delete_state') throw new Error('Invalid operation type');

  /**
   * State DELETE operations remove preferences.
   * Sets preference values to undefined.
   */

  const deleted: string[] = [];

  for (const key of operation.keys) {
    runtime.memory.setPreference(key, undefined);
    deleted.push(key);
  }

  return { deleted, total: deleted.length };
}

async function executeListOperation(operation: StateOperation, runtime: RuntimeContext): Promise<unknown> {
  if (operation.type !== 'list') throw new Error('Invalid operation type');

  /**
   * State LIST operations list all preference keys.
   * Returns all keys from memory manager preferences.
   */

  const memory = runtime.memory.getMemory();
  const keys = memory.preferences.map(p => p.key);

  // Filter by prefix if specified
  const filteredKeys = operation.prefix
    ? keys.filter(k => k.startsWith(operation.prefix!))
    : keys;

  return { keys: filteredKeys, total: filteredKeys.length };
}

async function executeTrackOperation(operation: StateOperation, runtime: RuntimeContext): Promise<unknown> {
  if (operation.type !== 'track') throw new Error('Invalid operation type');

  /**
   * Track operations record various types of memory entries.
   * Uses the memory manager's record methods.
   */

  const tracked: string[] = [];

  for (const entry of operation.entries) {
    switch (entry.kind) {
      case 'decision':
        // Type assertion needed as the data structure may not be complete
        runtime.memory.recordDecision(entry.data as Omit<import('../interfaces/memory.js').Decision, 'id' | 'timestamp'>);
        break;
      case 'pattern':
        runtime.memory.recordPattern(entry.data as Omit<import('../interfaces/memory.js').Pattern, 'id' | 'timestamp' | 'usage_count'>);
        break;
      case 'failure':
        runtime.memory.recordFailure(entry.data as Omit<import('../interfaces/memory.js').Failure, 'id' | 'timestamp'>);
        break;
      case 'task':
        // Tasks are stored as preferences
        runtime.memory.setPreference(`task_${Date.now()}`, entry.data);
        break;
      case 'metric':
        // Metrics are stored as preferences
        runtime.memory.setPreference(`metric_${Date.now()}`, entry.data);
        break;
    }
    tracked.push(entry.kind);
  }

  return { tracked, total: tracked.length };
}

async function executeQueryOperation(operation: StateOperation, runtime: RuntimeContext): Promise<unknown> {
  if (operation.type !== 'query') throw new Error('Invalid operation type');

  /**
   * Query operations search memory for tracked entries.
   * Uses the memory manager's get methods with filters.
   */

  const filters = operation.filters || {};
  const results: unknown[] = [];

  // Use memory manager to query
  if (!filters.kinds || filters.kinds.includes('decision')) {
    const decisions = runtime.memory.getDecisions({
      since: filters.since,
    });
    results.push(...decisions);
  }

  if (!filters.kinds || filters.kinds.includes('pattern')) {
    const patterns = runtime.memory.getPatterns({
      since: filters.since,
    });
    results.push(...patterns);
  }

  if (!filters.kinds || filters.kinds.includes('failure')) {
    const failures = runtime.memory.getFailures({
      since: filters.since,
    });
    results.push(...failures);
  }

  // Apply keyword filtering if specified
  let filteredResults = results;
  if (filters.keywords && filters.keywords.length > 0) {
    const searchResults = runtime.memory.search(
      filters.keywords,
      filters.kinds as ('decision' | 'pattern' | 'failure' | 'preference')[] | undefined
    );
    filteredResults = searchResults.map(r => r.entry);
  }

  // Apply limit if specified
  if (filters.limit) {
    filteredResults = filteredResults.slice(0, filters.limit);
  }

  return { results: filteredResults, total: filteredResults.length };
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
    try {
      let command: string;

      // Parse check string to determine validation type
      // Supports formats: 'typecheck', 'lint', 'test', 'build'
      // Or with options: 'typecheck:strict', 'test:unit'
      const [checkType, ...options] = check.split(':');
      const checkName: string = checkType || check;

      // Map check type to appropriate command
      switch (checkType) {
        case 'typecheck':
          // Run TypeScript type checking
          command = 'tsc --noEmit';
          if (options.includes('strict')) {
            command += ' --strict';
          }
          break;

        case 'lint':
          // Run linter (ESLint)
          command = 'eslint .';
          if (options.includes('fix')) {
            command += ' --fix';
          }
          break;

        case 'test':
          // Run test suite
          if (options.includes('unit')) {
            command = 'npm run test:unit';
          } else if (options.includes('integration')) {
            command = 'npm run test:integration';
          } else {
            command = 'npm test';
          }
          break;

        case 'build':
          // Run build process
          command = 'npm run build';
          break;

        default:
          // Unknown check type - log warning and skip
          errors.push(`Unknown validation check type: ${checkType}`);
          continue;
      }

      // Execute validation command
      const { stdout, stderr } = await execAsync(command, {
        maxBuffer: 10 * 1024 * 1024,
        cwd: process.cwd(),
      });

      // Command succeeded (exit code 0)
      // Check stderr for warnings that should be treated as errors
      if (stderr && stderr.length > 0) {
        const stderrStr = stderr.toString().trim();
        if (stderrStr.length > 0) {
          // Log stderr but don't treat as error unless it contains error keywords
          if (stderrStr.toLowerCase().includes('error')) {
            errors.push(`${checkName} validation warnings: ${stderrStr.substring(0, 500)}`);
          }
        }
      }
    } catch (error: unknown) {
      // Command failed (non-zero exit code)
      const execError = error as { code?: number; stderr?: string; stdout?: string };
      const errorMsg = execError.stderr?.toString() || execError.stdout?.toString() ||
        (error instanceof Error ? error.message : String(error));

      // Truncate long error messages to keep output manageable
      const truncatedMsg = errorMsg.length > 500
        ? errorMsg.substring(0, 500) + '... (truncated)'
        : errorMsg;

      errors.push(`${check} failed: ${truncatedMsg}`);
    }
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
      completedBatches.set(batchId, { input, output });

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
        operations: {
          total: totalOperations,
          succeeded: succeededOperations,
          failed: failedOperations,
          skipped: skippedOperations,
        },
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
    completedBatches.set(batchId, { input, output });

    // Format output based on mode
    let responseData: unknown;
    switch (outputMode) {
      case 'minimal':
        responseData = {
          batch_id: batchId,
          status,
          operations: {
            total: totalOperations,
            succeeded: succeededOperations,
            failed: failedOperations,
          },
        };
        break;

      case 'summary':
        responseData = {
          batch_id: batchId,
          status,
          summary: batchResult.summary,
          errors: errors.length > 0 ? errors.map(e => e.message) : undefined,
        };
        break;

      case 'full':
        responseData = {
          batch_id: batchId,
          status,
          summary: batchResult.summary,
          validation: batchResult.validation,
          recovery: batchResult.recovery,
          errors: errors.length > 0 ? errors : undefined,
        };
        break;

      case 'verbose':
        responseData = output;
        break;

      default:
        // Default to summary mode
        responseData = {
          batch_id: batchId,
          status,
          summary: batchResult.summary,
          errors: errors.length > 0 ? errors.map(e => e.message) : undefined,
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
export function getCompletedBatch(batchId: string): { input: BatchToolInput; output: BatchToolOutput } | undefined {
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
