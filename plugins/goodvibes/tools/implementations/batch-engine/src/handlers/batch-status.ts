/**
 * batch_status handler - Check batch and agent status
 * @see SPEC-v2 Section 13.4
 */

import type { CallToolResult, TextContent } from '@modelcontextprotocol/sdk/types.js';
import type {
  BatchStatusInput,
  BatchStatusOutput,
  BatchStatus,
  BatchProgress,
  OperationStatus,
  AgentStatus,
  BatchHistoryEntry,
  ListBatchesInput,
  ListBatchesOutput,
} from '../interfaces/tools/batch-status.js';
import type { BatchPhase, PHASE_ORDER } from '../interfaces/tools/batch-tool.js';
import {
  getActiveBatch,
  getCompletedBatch,
  listActiveBatches,
  listCompletedBatches,
} from './batch.js';
import {
  createRuntimeContext,
  initializeRuntime,
} from '../runtime/index.js';

/**
 * Output modes for batch status responses
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
 * Phase order for progress calculation
 */
const PHASE_LIST: BatchPhase[] = ['discovery', 'read', 'write', 'exec', 'query', 'state'];

/**
 * Map batch execution status to BatchStatus
 */
function mapToBatchStatus(status: string): BatchStatus {
  switch (status) {
    case 'success':
      return 'completed';
    case 'partial':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'rolled_back':
      return 'rolled_back';
    case 'dry_run':
      return 'completed';
    default:
      return 'running';
  }
}

/**
 * Calculate progress for an active batch
 */
function calculateProgress(
  context: NonNullable<ReturnType<typeof getActiveBatch>>
): BatchProgress {
  const completedPhases = context.completed_phases || [];
  const currentPhase = context.current_phase || 'read';

  // Calculate pending phases
  const pendingPhases = PHASE_LIST.filter(
    p => !completedPhases.includes(p) && p !== currentPhase
  );

  // Count operations across all phases
  const batch = context.batch;
  const operations = batch.operations || {};

  const totalOps =
    (operations.read?.length || 0) +
    (operations.write?.length || 0) +
    (operations.exec?.length || 0) +
    (operations.query?.length || 0) +
    (operations.state?.length || 0);

  // Estimate completed operations based on completed phases
  let completedOps = 0;
  for (const phase of completedPhases) {
    const phaseOps = getPhaseOperationCount(phase, operations);
    completedOps += phaseOps;
  }

  // Calculate percentages
  const percentComplete = totalOps > 0
    ? Math.round((completedOps / totalOps) * 100)
    : 0;

  // Estimate remaining time based on elapsed time and progress
  const elapsed = Date.now() - new Date(context.start_time).getTime();
  const estimatedRemaining = percentComplete > 0
    ? Math.round((elapsed / percentComplete) * (100 - percentComplete))
    : undefined;

  return {
    current_phase: currentPhase,
    completed_phases: completedPhases,
    pending_phases: pendingPhases,
    operations_total: totalOps,
    operations_completed: completedOps,
    operations_failed: 0, // Updated as phase results come in
    operations_pending: totalOps - completedOps,
    percent_complete: percentComplete,
    estimated_remaining_ms: estimatedRemaining,
  };
}

/**
 * Get operation count for a phase
 */
function getPhaseOperationCount(
  phase: BatchPhase,
  operations: NonNullable<ReturnType<typeof getActiveBatch>>['batch']['operations']
): number {
  switch (phase) {
    case 'read':
      return operations.read?.length || 0;
    case 'write':
      return operations.write?.length || 0;
    case 'exec':
      return operations.exec?.length || 0;
    case 'query':
      return operations.query?.length || 0;
    case 'state':
      return operations.state?.length || 0;
    default:
      return 0;
  }
}

/**
 * Build operation status from phase results
 */
function buildOperationStatuses(
  context: NonNullable<ReturnType<typeof getActiveBatch>>
): OperationStatus[] {
  const statuses: OperationStatus[] = [];
  const phaseResults = context.phase_results || {};

  for (const [phase, result] of Object.entries(phaseResults)) {
    if (result && typeof result === 'object' && 'results' in result) {
      const phaseResult = result as { results: Array<{
        id: string;
        type: string;
        status: string;
        duration_ms?: number;
        tokens_used?: number;
        error?: { message: string };
      }> };

      for (const opResult of phaseResult.results) {
        statuses.push({
          id: opResult.id,
          type: opResult.type,
          phase: phase as BatchPhase,
          status: opResult.status as 'pending' | 'running' | 'completed' | 'failed' | 'skipped',
          duration_ms: opResult.duration_ms,
          tokens_used: opResult.tokens_used,
          error: opResult.error?.message,
        });
      }
    }
  }

  return statuses;
}

/**
 * Build agent statuses from active agents in state
 */
async function buildAgentStatuses(): Promise<AgentStatus[]> {
  const statuses: AgentStatus[] = [];

  const runtime = createRuntimeContext();
  await initializeRuntime(runtime);

  const activeAgents = runtime.state.getActiveAgents();

  for (const agent of activeAgents) {
    statuses.push({
      agent_id: agent.id,
      operation_id: agent.operation_id,
      agent_type: agent.agent_type,
      status: 'running',
      tokens_used: agent.budget.tokens_used,
      turns_used: agent.budget.turns_used,
      started_at: agent.started_at,
    });
  }

  return statuses;
}

/**
 * Main batch_status handler
 */
export const handleBatchStatus: ToolHandler = async (args: unknown) => {
  const getElapsed = startTimer();
  const outputMode = parseOutputMode(args);
  const input = args as BatchStatusInput;

  try {
    const batchId = input.batch_id;

    if (!batchId) {
      return toCallToolResult(errorResult(
        'batch_id is required',
        outputMode,
        getElapsed()
      ));
    }

    // Check active batches first
    const activeContext = getActiveBatch(batchId);
    if (activeContext) {
      // Batch is still running
      const progress = calculateProgress(activeContext);
      const elapsed = Date.now() - new Date(activeContext.start_time).getTime();

      const output: BatchStatusOutput = {
        batch_id: batchId,
        status: 'running',
        progress,
        duration_ms: elapsed,
        tokens_used: 0,
      };

      // Add optional data based on include flags
      if (input.include?.operations) {
        output.operations = buildOperationStatuses(activeContext);
      }

      if (input.include?.agents) {
        output.agents = await buildAgentStatuses();
      }

      // Format based on output mode
      let responseData: unknown;
      switch (outputMode) {
        case 'count_only':
          responseData = {
            batch_id: batchId,
            status: 'running',
            percent_complete: progress.percent_complete,
          };
          break;

        case 'minimal':
          responseData = {
            batch_id: batchId,
            status: 'running',
            progress: {
              current_phase: progress.current_phase,
              percent_complete: progress.percent_complete,
            },
          };
          break;

        case 'verbose':
          responseData = output;
          break;

        default: // standard
          responseData = {
            batch_id: batchId,
            status: 'running',
            progress,
            duration_ms: elapsed,
          };
      }

      return toCallToolResult(successResult(responseData, outputMode, getElapsed()));
    }

    // Check completed batches
    const completedOutput = getCompletedBatch(batchId);
    if (completedOutput) {
      const status = mapToBatchStatus(completedOutput.status);

      const output: BatchStatusOutput = {
        batch_id: batchId,
        status,
        progress: {
          current_phase: 'state', // Last phase
          completed_phases: PHASE_LIST,
          pending_phases: [],
          operations_total: completedOutput.result?.summary.operations.total || 0,
          operations_completed: completedOutput.result?.summary.operations.succeeded || 0,
          operations_failed: completedOutput.result?.summary.operations.failed || 0,
          operations_pending: 0,
          percent_complete: 100,
        },
        duration_ms: completedOutput.duration_ms,
        tokens_used: completedOutput.tokens_used,
      };

      // Add optional data based on include flags
      if (input.include?.results && completedOutput.result) {
        output.results = completedOutput.result;
      }

      if (input.include?.telemetry) {
        const runtime = createRuntimeContext();
        await initializeRuntime(runtime);
        try {
          output.telemetry = runtime.telemetry.getBatchMetrics(batchId);
        } catch {
          // Telemetry not available
        }
      }

      // Format based on output mode
      let responseData: unknown;
      switch (outputMode) {
        case 'count_only':
          responseData = {
            batch_id: batchId,
            status,
            operations_total: output.progress.operations_total,
            operations_succeeded: output.progress.operations_completed,
            operations_failed: output.progress.operations_failed,
          };
          break;

        case 'minimal':
          responseData = {
            batch_id: batchId,
            status,
            duration_ms: completedOutput.duration_ms,
            tokens_used: completedOutput.tokens_used,
          };
          break;

        case 'verbose':
          responseData = output;
          break;

        default: // standard
          responseData = {
            batch_id: batchId,
            status,
            progress: output.progress,
            duration_ms: completedOutput.duration_ms,
            tokens_used: completedOutput.tokens_used,
          };
      }

      return toCallToolResult(successResult(responseData, outputMode, getElapsed()));
    }

    // Batch not found
    return toCallToolResult(errorResult(
      `Batch not found: ${batchId}`,
      outputMode,
      getElapsed()
    ));

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return toCallToolResult(errorResult(errorMessage, outputMode, getElapsed()));
  }
};

/**
 * List batches handler
 */
export const handleListBatches: ToolHandler = async (args: unknown) => {
  const getElapsed = startTimer();
  const outputMode = parseOutputMode(args);
  const input = (args || {}) as ListBatchesInput;

  try {
    const entries: BatchHistoryEntry[] = [];

    // Get active batches
    const activeIds = listActiveBatches();
    for (const batchId of activeIds) {
      const context = getActiveBatch(batchId);
      if (context) {
        const elapsed = Date.now() - new Date(context.start_time).getTime();
        const operations = context.batch.operations || {};
        const opsCount =
          (operations.read?.length || 0) +
          (operations.write?.length || 0) +
          (operations.exec?.length || 0) +
          (operations.query?.length || 0) +
          (operations.state?.length || 0);

        entries.push({
          batch_id: batchId,
          started_at: context.start_time,
          status: 'running',
          operations_count: opsCount,
          tokens_used: 0,
          duration_ms: elapsed,
        });
      }
    }

    // Get completed batches
    const completedIds = listCompletedBatches();
    for (const batchId of completedIds) {
      const output = getCompletedBatch(batchId);
      if (output) {
        entries.push({
          batch_id: batchId,
          started_at: '', // Not stored in output
          completed_at: '', // Not stored in output
          status: mapToBatchStatus(output.status),
          operations_count: output.result?.summary.operations.total || 0,
          tokens_used: output.tokens_used,
          duration_ms: output.duration_ms,
        });
      }
    }

    // Apply filters
    let filtered = entries;

    if (input.status && input.status.length > 0) {
      filtered = filtered.filter(e => input.status!.includes(e.status));
    }

    if (input.since) {
      const sinceDate = new Date(input.since);
      filtered = filtered.filter(e => {
        if (!e.started_at) return true;
        return new Date(e.started_at) >= sinceDate;
      });
    }

    if (input.until) {
      const untilDate = new Date(input.until);
      filtered = filtered.filter(e => {
        if (!e.started_at) return true;
        return new Date(e.started_at) <= untilDate;
      });
    }

    // Apply limit
    const limit = input.limit || 50;
    const hasMore = filtered.length > limit;
    const batches = filtered.slice(0, limit);

    const output: ListBatchesOutput = {
      batches,
      total: filtered.length,
      has_more: hasMore,
    };

    // Format based on output mode
    let responseData: unknown;
    switch (outputMode) {
      case 'count_only':
        responseData = {
          total: output.total,
          running: entries.filter(e => e.status === 'running').length,
          completed: entries.filter(e => e.status === 'completed').length,
          failed: entries.filter(e => e.status === 'failed').length,
        };
        break;

      case 'minimal':
        responseData = {
          batches: batches.map(b => ({
            batch_id: b.batch_id,
            status: b.status,
          })),
          total: output.total,
        };
        break;

      case 'verbose':
        responseData = output;
        break;

      default: // standard
        responseData = {
          batches: batches.map(b => ({
            batch_id: b.batch_id,
            status: b.status,
            operations_count: b.operations_count,
            duration_ms: b.duration_ms,
          })),
          total: output.total,
          has_more: output.has_more,
        };
    }

    return toCallToolResult(successResult(responseData, outputMode, getElapsed()));

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return toCallToolResult(errorResult(errorMessage, outputMode, getElapsed()));
  }
};
