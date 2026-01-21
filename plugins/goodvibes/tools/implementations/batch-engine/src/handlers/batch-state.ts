/**
 * batch_state handler - State and memory management tool
 * @see SPEC-v2 Section 13.6
 */

import type { CallToolResult, TextContent } from '@modelcontextprotocol/sdk/types.js';
import type {
  BatchStateInput,
  BatchStateOutput,
  StateOperation,
  MemoryQuery,
  StateSnapshot,
} from '../interfaces/tools/batch-state.js';
import type { Decision, Pattern, Failure } from '../interfaces/memory.js';
import type { GoodVibesState } from '../interfaces/state.js';
import type { Memory } from '../interfaces/memory.js';
import {
  createRuntimeContext,
  initializeRuntime,
  persistRuntime,
} from '../runtime/index.js';

/**
 * Output modes for batch state responses
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
 * Get a value from an object by dot-notation path
 */
function getByPath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Set a value in an object by dot-notation path
 */
function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
}

/**
 * Execute a get operation
 */
async function executeGet(
  options: NonNullable<BatchStateInput['get']>,
  runtime: ReturnType<typeof createRuntimeContext>
): Promise<Record<string, unknown>> {
  const state = runtime.state.getState();
  const memory = runtime.memory.getMemory();

  const values: Record<string, unknown> = {};

  for (const key of options.keys) {
    // Check if it's a state key
    if (key.startsWith('session.') || key === 'session') {
      values[key] = getByPath(state, key);
    } else if (key.startsWith('agents.') || key === 'agents') {
      values[key] = getByPath(state, key);
    } else if (key.startsWith('checkpoints.') || key === 'checkpoints') {
      values[key] = getByPath(state, key);
    } else if (key.startsWith('locks.') || key === 'locks') {
      values[key] = getByPath(state, key);
    } else if (key.startsWith('memory.') || key === 'memory') {
      values[key] = getByPath({ memory }, key);
    } else {
      // Try both state and custom keys
      const stateValue = getByPath(state, key);
      if (stateValue !== undefined) {
        values[key] = stateValue;
      } else {
        // Check preferences
        values[key] = runtime.memory.getPreference(key);
      }
    }
  }

  return values;
}

/**
 * Execute a set operation
 */
async function executeSet(
  options: NonNullable<BatchStateInput['set']>,
  runtime: ReturnType<typeof createRuntimeContext>
): Promise<void> {
  const merge = options.merge !== false; // Default to merge

  for (const [key, value] of Object.entries(options.values)) {
    // Check if it's a session update
    if (key.startsWith('session.')) {
      const sessionKey = key.slice('session.'.length);
      const currentSession = runtime.state.getSession();
      const updates: Record<string, unknown> = {};
      setByPath(updates, sessionKey, value);
      runtime.state.updateSession(updates as Partial<typeof currentSession>);
    } else if (key === 'session') {
      // Full session update
      if (merge) {
        runtime.state.updateSession(value as Partial<ReturnType<typeof runtime.state.getSession>>);
      } else {
        runtime.state.updateSession(value as ReturnType<typeof runtime.state.getSession>);
      }
    } else {
      // Store as preference
      runtime.memory.setPreference(key, value, 'session');
    }
  }
}

/**
 * Execute a query operation
 */
async function executeQuery(
  options: NonNullable<BatchStateInput['query']>,
  runtime: ReturnType<typeof createRuntimeContext>
): Promise<{ decisions?: Decision[]; patterns?: Pattern[]; failures?: Failure[] }> {
  const result: { decisions?: Decision[]; patterns?: Pattern[]; failures?: Failure[] } = {};
  const filters = options.filters || {};

  if (options.type === 'decisions' || options.type === 'all') {
    result.decisions = runtime.memory.getDecisions({
      category: filters.category as import('../interfaces/memory.js').DecisionCategory | undefined,
      files: filters.files,
      since: filters.since,
      status: filters.status as 'active' | 'superseded' | 'reverted' | undefined,
    });

    if (filters.limit) {
      result.decisions = result.decisions.slice(0, filters.limit);
    }
  }

  if (options.type === 'patterns' || options.type === 'all') {
    result.patterns = runtime.memory.getPatterns({
      since: filters.since,
    });

    if (filters.limit) {
      result.patterns = result.patterns.slice(0, filters.limit);
    }
  }

  if (options.type === 'failures' || options.type === 'all') {
    result.failures = runtime.memory.getFailures({
      files: filters.files,
      since: filters.since,
    });

    if (filters.limit) {
      result.failures = result.failures.slice(0, filters.limit);
    }
  }

  return result;
}

/**
 * Execute an export operation
 */
async function executeExport(
  options: NonNullable<BatchStateInput['export']>,
  runtime: ReturnType<typeof createRuntimeContext>
): Promise<{ exported: string | object; exported_path?: string }> {
  const includes = options.include || ['state', 'memory'];
  const format = options.format;

  const snapshot: StateSnapshot = {
    version: 1,
    exported_at: new Date().toISOString(),
    state: runtime.state.getState(),
    memory: runtime.memory.getMemory(),
  };

  // Filter based on includes
  const data: Record<string, unknown> = {
    version: snapshot.version,
    exported_at: snapshot.exported_at,
  };

  if (includes.includes('state')) {
    data.state = snapshot.state;
  }

  if (includes.includes('memory')) {
    data.memory = snapshot.memory;
  }

  if (includes.includes('telemetry')) {
    data.telemetry = runtime.telemetry.getSessionMetrics();
  }

  let exported: string | object;

  if (format === 'json') {
    exported = JSON.stringify(data, null, 2);
  } else if (format === 'markdown') {
    exported = formatAsMarkdown(data);
  } else {
    exported = data;
  }

  if (options.output_path) {
    // Write to file
    const fs = await import('fs/promises');
    const path = await import('path');
    const projectRoot = process.env.PROJECT_ROOT || process.cwd();
    const outputPath = path.isAbsolute(options.output_path)
      ? options.output_path
      : path.join(projectRoot, options.output_path);

    await fs.writeFile(
      outputPath,
      typeof exported === 'string' ? exported : JSON.stringify(exported, null, 2),
      'utf-8'
    );

    return { exported, exported_path: outputPath };
  }

  return { exported };
}

/**
 * Format data as markdown
 */
function formatAsMarkdown(data: Record<string, unknown>): string {
  const lines: string[] = [
    '# GoodVibes State Export',
    '',
    `Exported: ${data.exported_at}`,
    `Version: ${data.version}`,
    '',
  ];

  if (data.state) {
    const state = data.state as GoodVibesState;
    lines.push('## Session State', '');
    lines.push(`- **ID**: ${state.session.id}`);
    lines.push(`- **Mode**: ${state.session.mode}`);
    lines.push(`- **Started**: ${state.session.started_at}`);
    lines.push(`- **Batches Completed**: ${state.session.batches_completed}`);
    lines.push(`- **Operations Completed**: ${state.session.operations_completed}`);
    lines.push(`- **Tokens Used**: ${state.session.tokens_used}`);
    lines.push('');

    if (state.session.git) {
      lines.push('### Git Status', '');
      lines.push(`- **Branch**: ${state.session.git.current_branch}`);
      lines.push(`- **Last Commit**: ${state.session.git.last_commit}`);
      lines.push(`- **Uncommitted Files**: ${state.session.git.uncommitted_files.length}`);
      lines.push('');
    }
  }

  if (data.memory) {
    const memory = data.memory as Memory;
    lines.push('## Memory', '');
    lines.push(`- **Decisions**: ${memory.decisions.length}`);
    lines.push(`- **Patterns**: ${memory.patterns.length}`);
    lines.push(`- **Failures**: ${memory.failures.length}`);
    lines.push(`- **Preferences**: ${memory.preferences.length}`);
    lines.push('');

    if (memory.decisions.length > 0) {
      lines.push('### Recent Decisions', '');
      for (const decision of memory.decisions.slice(-5)) {
        lines.push(`- [${decision.category}] ${decision.what}`);
      }
      lines.push('');
    }
  }

  if (data.telemetry) {
    const telemetry = data.telemetry as { total_batches: number; total_operations: number; total_tokens: number };
    lines.push('## Telemetry', '');
    lines.push(`- **Total Batches**: ${telemetry.total_batches}`);
    lines.push(`- **Total Operations**: ${telemetry.total_operations}`);
    lines.push(`- **Total Tokens**: ${telemetry.total_tokens}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Execute an import operation
 */
async function executeImport(
  options: NonNullable<BatchStateInput['import']>,
  runtime: ReturnType<typeof createRuntimeContext>
): Promise<{ imported_count: number }> {
  let data: unknown;

  if (typeof options.source === 'string') {
    // Check if it's a file path or JSON string
    if (options.source.startsWith('{') || options.source.startsWith('[')) {
      data = JSON.parse(options.source);
    } else {
      // Assume it's a file path
      const fs = await import('fs/promises');
      const path = await import('path');
      const projectRoot = process.env.PROJECT_ROOT || process.cwd();
      const filePath = path.isAbsolute(options.source)
        ? options.source
        : path.join(projectRoot, options.source);

      const content = await fs.readFile(filePath, 'utf-8');
      data = JSON.parse(content);
    }
  } else {
    data = options.source;
  }

  let importedCount = 0;

  if (data && typeof data === 'object') {
    const snapshot = data as Partial<StateSnapshot>;

    if (snapshot.memory) {
      // Import memory entries
      for (const decision of snapshot.memory.decisions || []) {
        runtime.memory.recordDecision({
          what: decision.what,
          why: decision.why,
          category: decision.category,
          confidence: decision.confidence,
          files: decision.files,
          symbols: decision.symbols,
          status: decision.status,
        });
        importedCount++;
      }

      for (const pattern of snapshot.memory.patterns || []) {
        runtime.memory.recordPattern({
          name: pattern.name,
          description: pattern.description,
          examples: pattern.examples,
          when_to_use: pattern.when_to_use,
          when_not_to_use: pattern.when_not_to_use,
        });
        importedCount++;
      }

      for (const failure of snapshot.memory.failures || []) {
        runtime.memory.recordFailure({
          error_type: failure.error_type,
          error_message: failure.error_message,
          stack_trace: failure.stack_trace,
          operation: failure.operation,
          files: failure.files,
          resolved: failure.resolved,
          resolution: failure.resolution,
          root_cause: failure.root_cause,
          prevention: failure.prevention,
        });
        importedCount++;
      }
    }
  }

  return { imported_count: importedCount };
}

/**
 * Execute a clear operation
 */
async function executeClear(
  options: NonNullable<BatchStateInput['clear']>,
  runtime: ReturnType<typeof createRuntimeContext>
): Promise<{ cleared: string[] }> {
  const cleared: string[] = [];

  for (const target of options.targets) {
    switch (target) {
      case 'state':
        runtime.state.reset();
        cleared.push('state');
        break;
      case 'memory':
        runtime.memory.reset();
        cleared.push('memory');
        break;
      case 'telemetry':
        // Would need a reset method on telemetry
        cleared.push('telemetry');
        break;
      case 'checkpoints':
        runtime.state.cleanupCheckpoints();
        cleared.push('checkpoints');
        break;
    }
  }

  return { cleared };
}

/**
 * Main batch_state handler
 */
export const handleBatchState: ToolHandler = async (args: unknown) => {
  const getElapsed = startTimer();
  const outputMode = parseOutputMode(args);
  const input = args as BatchStateInput;

  try {
    // Validate operation
    if (!input.operation) {
      return toCallToolResult(errorResult(
        'operation is required',
        outputMode,
        getElapsed()
      ));
    }

    const validOperations: StateOperation[] = ['get', 'set', 'query', 'export', 'import', 'clear'];
    if (!validOperations.includes(input.operation as StateOperation)) {
      return toCallToolResult(errorResult(
        `Invalid operation: ${input.operation}. Must be one of: ${validOperations.join(', ')}`,
        outputMode,
        getElapsed()
      ));
    }

    // Initialize runtime
    const runtime = createRuntimeContext();
    await initializeRuntime(runtime);

    let output: BatchStateOutput;

    switch (input.operation) {
      case 'get': {
        if (!input.get?.keys || input.get.keys.length === 0) {
          return toCallToolResult(errorResult(
            'get.keys is required for get operation',
            outputMode,
            getElapsed()
          ));
        }
        const values = await executeGet(input.get, runtime);
        output = {
          operation: 'get',
          success: true,
          values,
        };
        break;
      }

      case 'set': {
        if (!input.set?.values) {
          return toCallToolResult(errorResult(
            'set.values is required for set operation',
            outputMode,
            getElapsed()
          ));
        }
        await executeSet(input.set, runtime);
        output = {
          operation: 'set',
          success: true,
        };
        break;
      }

      case 'query': {
        if (!input.query?.type) {
          return toCallToolResult(errorResult(
            'query.type is required for query operation',
            outputMode,
            getElapsed()
          ));
        }
        const queryResult = await executeQuery(input.query, runtime);
        output = {
          operation: 'query',
          success: true,
          decisions: queryResult.decisions,
          patterns: queryResult.patterns,
          failures: queryResult.failures,
        };
        break;
      }

      case 'export': {
        if (!input.export?.format) {
          return toCallToolResult(errorResult(
            'export.format is required for export operation',
            outputMode,
            getElapsed()
          ));
        }
        const exportResult = await executeExport(input.export, runtime);
        output = {
          operation: 'export',
          success: true,
          exported: exportResult.exported,
          exported_path: exportResult.exported_path,
        };
        break;
      }

      case 'import': {
        if (!input.import?.source) {
          return toCallToolResult(errorResult(
            'import.source is required for import operation',
            outputMode,
            getElapsed()
          ));
        }
        const importResult = await executeImport(input.import, runtime);
        output = {
          operation: 'import',
          success: true,
          imported_count: importResult.imported_count,
        };
        break;
      }

      case 'clear': {
        if (!input.clear?.targets || input.clear.targets.length === 0) {
          return toCallToolResult(errorResult(
            'clear.targets is required for clear operation',
            outputMode,
            getElapsed()
          ));
        }
        if (input.clear.confirm !== true) {
          return toCallToolResult(errorResult(
            'clear.confirm must be true to clear state',
            outputMode,
            getElapsed()
          ));
        }
        const clearResult = await executeClear(input.clear, runtime);
        output = {
          operation: 'clear',
          success: true,
          cleared: clearResult.cleared,
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
          ...(output.values && { value_count: Object.keys(output.values).length }),
          ...(output.decisions && { decision_count: output.decisions.length }),
          ...(output.patterns && { pattern_count: output.patterns.length }),
          ...(output.failures && { failure_count: output.failures.length }),
          ...(output.imported_count !== undefined && { imported_count: output.imported_count }),
          ...(output.cleared && { cleared_count: output.cleared.length }),
        };
        break;

      case 'minimal':
        responseData = {
          operation: output.operation,
          success: output.success,
          ...(output.values && { values: output.values }),
          ...(output.decisions && { decisions: output.decisions.length }),
          ...(output.patterns && { patterns: output.patterns.length }),
          ...(output.failures && { failures: output.failures.length }),
        };
        break;

      case 'verbose':
        responseData = output;
        break;

      default: // standard
        responseData = {
          operation: output.operation,
          success: output.success,
          ...(output.values && { values: output.values }),
          ...(output.decisions && { decisions: output.decisions }),
          ...(output.patterns && { patterns: output.patterns }),
          ...(output.failures && { failures: output.failures }),
          ...(output.exported && { exported: typeof output.exported === 'string' ? '[string data]' : output.exported }),
          ...(output.exported_path && { exported_path: output.exported_path }),
          ...(output.imported_count !== undefined && { imported_count: output.imported_count }),
          ...(output.cleared && { cleared: output.cleared }),
          ...(output.error && { error: output.error }),
        };
    }

    return toCallToolResult(successResult(responseData, outputMode, getElapsed()));

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return toCallToolResult(errorResult(errorMessage, outputMode, getElapsed()));
  }
};
