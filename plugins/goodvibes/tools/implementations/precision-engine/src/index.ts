#!/usr/bin/env node
/**
 * Precision Engine MCP Server - SPEC-v2
 *
 * Token-efficient file operations with configurable output modes.
 *
 * SPEC-v2 Tools (9):
 * - precision_grep: Search with precise output control
 * - precision_read: Read files with extraction modes
 * - precision_glob: Find files with intelligent filtering
 * - precision_symbols: Search and analyze code symbols
 * - precision_edit: Atomic file editing with validation
 * - precision_write: Create/write files with encoding support
 * - precision_exec: Execute shell commands with expectations
 * - precision_fetch: Fetch URLs with extraction modes
 * - discover: Lightweight parallel query execution
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { SERVER_NAME, SERVER_VERSION } from './config.js';
import { logger } from './logging.js';
import { allSchemas } from './schemas/index.js';
import { getHandler, hasHandler, listHandlers } from './handlers/index.js';
import { FileStateCache } from './state/file-cache.js';
import { sessionState } from './state/index.js';
import { PrecisionRuntime, extractMetadata, extractCacheHit } from './state/precision-runtime.js';
import { HooksManager, HookAbortError } from './state/hooks.js';
import type { HookContext } from './state/hooks.js';
import { Telemetry } from './state/telemetry.js';

/**
 * PrecisionEngineServer - MCP server for token-efficient file operations.
 */
class PrecisionEngineServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      { name: SERVER_NAME, version: SERVER_VERSION },
      { capabilities: { tools: {} } }
    );

    this.setupHandlers();
    this.setupErrorHandling();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug('ListTools request');
      return { tools: allSchemas };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      logger.tool(name, args);

      if (!hasHandler(name)) {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}. Available: ${listHandlers().join(', ')}`
        );
      }

      const handler = getHandler(name);
      if (!handler) {
        throw new McpError(ErrorCode.InternalError, `Handler not found: ${name}`);
      }

      try {
        return await executeHandler(name, handler, args);
      } catch (error) {
        if (error instanceof McpError) throw error;
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Tool ${name} failed`, { error: message, args });
        throw new McpError(ErrorCode.InternalError, `Tool ${name} failed: ${message}`);
      }
    });
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => logger.error('MCP Server error', error);

    process.on('SIGINT', async () => {
      logger.info('Shutting down');
      await this.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Shutting down');
      await this.stop();
      process.exit(0);
    });
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info(`${SERVER_NAME} v${SERVER_VERSION} started`);
    logger.info(`Tools: ${listHandlers().join(', ')}`);

    // Initialize the PrecisionRuntime (non-blocking on failure)
    PrecisionRuntime.initialize().catch((err) => {
      logger.warn('PrecisionRuntime initialization failed — operating in degraded mode', {
        err: err instanceof Error ? err.message : String(err),
      });
    });
  }

  async stop(): Promise<void> {
    // Clear file state cache on shutdown
    try {
      const cache = FileStateCache.getInstance();
      const stats = cache.getStats();
      logger.info('FileStateCache session stats', stats);
      cache.clear();
    } catch {
      // Cache may not have been initialized
    }

    // Reset session state on shutdown
    try {
      sessionState.reset();
      logger.info('Session state reset');
    } catch {
      // Session state may not have been initialized
    }

    // Kill all background processes
    try {
      const { processManager } = await import('./state/index.js');
      await processManager.killAll();
      logger.info('Background processes terminated');
    } catch {
      // Process manager may not have been initialized
    }

    // Shut down PrecisionRuntime (flushes index, closes telemetry DB)
    try {
      const runtime = PrecisionRuntime.get();
      if (runtime) {
        await runtime.shutdown();
      }
    } catch {
      // Runtime may not have been initialized
    }

    await this.server.close();
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Handler dispatch wrapper
// ───────────────────────────────────────────────────────────────────────────

/**
 * Extract the short tool name from a full tool name.
 * Matches the mapping used by Telemetry.generateId.
 */
function toShortToolName(toolName: string): string {
  const MAP: Record<string, string> = {
    precision_read: 'read',
    precision_write: 'write',
    precision_edit: 'edit',
    precision_exec: 'exec',
    precision_grep: 'grep',
    precision_glob: 'glob',
    precision_fetch: 'fetch',
    precision_symbols: 'symbols',
    precision_config: 'config',
    precision_notebook: 'notebook',
    discover: 'discover',
  };
  return MAP[toolName] ?? toolName.slice(0, 12);
}

/**
 * Extract the list of file paths affected by a successful tool call.
 * Used to populate HookContext.paths_affected for OnPrecisionMutation.
 */
function extractPathsAffected(toolName: string, args: unknown, result: unknown): string[] {
  const input = args as Record<string, unknown>;
  const paths: string[] = [];

  switch (toolName) {
    case 'precision_write': {
      const files = input.files as Array<{ path: string }> | undefined;
      if (files) paths.push(...files.map((f) => f.path).filter(Boolean));
      break;
    }
    case 'precision_edit': {
      const edits = input.edits as Array<{ path?: string; file?: string }> | undefined;
      if (edits) {
        const unique = new Set(
          edits.map((e) => e.path ?? e.file ?? '').filter(Boolean),
        );
        paths.push(...unique);
      }
      break;
    }
    case 'precision_exec': {
      // Extract paths from file_ops
      const fileOps = input.file_ops as Array<{ source?: string; destination?: string }> | undefined;
      if (fileOps) {
        for (const op of fileOps) {
          if (op.source) paths.push(op.source);
          if (op.destination) paths.push(op.destination);
        }
      }
      break;
    }
    case 'precision_notebook': {
      const nb = input as { path?: string };
      if (nb.path) paths.push(nb.path);
      break;
    }
    default:
      break;
  }

  return paths;
}

/**
 * Execute a tool handler with optional PrecisionRuntime instrumentation.
 *
 * When PrecisionRuntime is initialized:
 * - Runs PrePrecisionTool hooks (may abort the call)
 * - Generates a precision_id and prepends it to the response
 * - Records telemetry (tool name, status, tokens, duration)
 * - Increments session.toolCalls counter
 * - Runs PostPrecisionTool hooks (telemetry, index updates)
 * - Runs OnPrecisionMutation hooks for write/edit/exec
 *
 * When PrecisionRuntime is NOT initialized (degraded mode):
 * - Calls the handler directly with no overhead
 * - No precision_id, no telemetry, no hooks
 *
 * Errors from the handler propagate unchanged — callers handle McpError wrapping.
 */
async function executeHandler(
  toolName: string,
  handler: (args: unknown) => Promise<unknown>,
  args: unknown,
): Promise<unknown> {
  const runtime = PrecisionRuntime.get();
  const startMs = Date.now();
  let precisionId: string | undefined;
  const shortName = toShortToolName(toolName);

  if (runtime) {
    precisionId = runtime.generateId(toolName);
    runtime.session.toolCalls++;
  }

  // Build the base hook context (result/error filled in later)
  const hookContext: HookContext = {
    precision_id: precisionId ?? `${shortName}_degraded_${Date.now()}`,
    tool_name: shortName,
    full_tool_name: toolName,
    input: args,
  };

  // --- PrePrecisionTool hooks ---
  const hooks = HooksManager.getInstance();
  try {
    const preResult = await hooks.runPreHooks(hookContext);
    if (preResult.abort) {
      throw new HookAbortError(preResult.reason);
    }
  } catch (err) {
    if (err instanceof HookAbortError) throw err;
    // Other pre-hook errors must not block execution
    logger.warn(`Pre-hooks error for ${toolName} (non-fatal)`, {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    const result = await handler(args);

    // Record successful telemetry (zero LLM token cost — server-side only)
    if (runtime && precisionId && (!hooks || hooks.isHookEnabled('PostPrecisionTool', 'record_telemetry'))) {
      try {
        runtime.telemetry.record({
          id: precisionId,
          tool: toolName,
          status: 'success',
          tokens_in: Telemetry.estimateTokens(args),
          tokens_out: Telemetry.estimateTokens(result),
          duration_ms: Date.now() - startMs,
          cache_hit: extractCacheHit(result),
          metadata: extractMetadata(toolName, args),
        });
      } catch (telErr) {
        // Telemetry failure must never affect the tool response
        logger.warn(`Telemetry record failed for ${toolName}`, {
          err: telErr instanceof Error ? telErr.message : String(telErr),
        });
      }

      // Prepend precision_id as the first line of the first text content block
      // This adds ~1 token overhead per call, visible to the LLM for correlation
      const resultObj = result as Record<string, unknown>;
      if (resultObj && Array.isArray(resultObj.content)) {
        const firstText = (resultObj.content as Array<{ type: string; text?: string }>).find(
          (c) => c.type === 'text',
        );
        if (firstText && typeof firstText.text === 'string') {
          firstText.text = `[${precisionId}]\n${firstText.text}`;
        }
      }
    }

    // --- PostPrecisionTool hooks ---
    const postContext: HookContext = { ...hookContext, result };
    try {
      await hooks.runPostHooks(postContext);
    } catch (err) {
      logger.warn(`Post-hooks error for ${toolName} (non-fatal)`, {
        err: err instanceof Error ? err.message : String(err),
      });
    }

    // --- OnPrecisionMutation hooks (for write/edit/exec/notebook) ---
    if (hooks.isMutationTool(shortName)) {
      const pathsAffected = extractPathsAffected(toolName, args, result);
      const mutContext: HookContext = { ...hookContext, result, paths_affected: pathsAffected };
      try {
        await hooks.runMutationHooks(mutContext);
      } catch (err) {
        logger.warn(`Mutation hooks error for ${toolName} (non-fatal)`, {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return result;
  } catch (error) {
    // Don't run error hooks for HookAbortError — that's not a tool failure
    if (error instanceof HookAbortError) throw error;

    // --- OnPrecisionError hooks ---
    const errorContext: HookContext = {
      ...hookContext,
      error: error instanceof Error ? error : new Error(String(error)),
    };
    try {
      await hooks.runErrorHooks(errorContext);
    } catch (hookErr) {
      logger.warn(`Error-hooks error for ${toolName} (non-fatal)`, {
        err: hookErr instanceof Error ? hookErr.message : String(hookErr),
      });
    }

    // Record failed telemetry
    if (runtime && precisionId && (!hooks || hooks.isHookEnabled('PostPrecisionTool', 'record_telemetry'))) {
      try {
        runtime.telemetry.record({
          id: precisionId,
          tool: toolName,
          status: 'failed',
          tokens_in: Telemetry.estimateTokens(args),
          duration_ms: Date.now() - startMs,
          error: error instanceof Error ? error.message : String(error),
          metadata: extractMetadata(toolName, args),
        });
      } catch {
        // Telemetry failure must never shadow the original error
      }
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const server = new PrecisionEngineServer();
  await server.start();
}

main().catch((error) => {
  logger.error('Failed to start', error);
  process.exit(1);
});
