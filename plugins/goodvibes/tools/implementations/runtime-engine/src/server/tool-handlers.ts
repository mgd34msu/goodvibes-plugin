/**
 * Tool handler implementations for the runtime-engine MCP server.
 *
 * Phase 1 tools:
 * - runtime_status  — health, uptime, and runtime diagnostics
 * - runtime_config  — configuration management (get/set/reset)
 *
 * Architecture:
 * - Each handler is a function conforming to ToolHandler.
 * - Handlers are registered in the handlerRegistry Map.
 * - Helper functions (getHandler, hasHandler, listHandlers) provide
 *   clean access without leaking Map internals.
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { RuntimeConfig } from '../shared/config.js';
import { DEFAULT_CONFIG, saveConfig } from '../shared/config.js';
import { createLogger } from '../shared/logger.js';
import type { RuntimeResult } from '../types.js';

const logger = createLogger('tool-handlers');

// ─── Handler type ────────────────────────────────────────────────────────────

/**
 * A runtime-engine tool handler.
 * Receives raw MCP tool arguments and returns an MCP CallToolResult.
 */
export type ToolHandler = (args: unknown, context: HandlerContext) => Promise<CallToolResult>;

/**
 * Shared context injected into every tool handler call.
 * Provides access to engine-level services without global state.
 */
export interface HandlerContext {
  /** Milliseconds since engine startup. */
  getUptime: () => number;
  /** Current runtime configuration snapshot. */
  getConfig: () => RuntimeConfig;
  /** Current health status snapshot. */
  getHealth: () => import('../types.js').HealthStatus;
  /** Update the in-memory runtime configuration after a disk write. */
  updateConfig: (config: RuntimeConfig) => void;
  /** Absolute path to the project root. */
  projectRoot: string;
  /** Engine version string. */
  version: string;
}

// ─── Result helpers ───────────────────────────────────────────────────────────

/**
 * Wrap a successful result in a RuntimeResult envelope and encode for MCP.
 *
 * @param data - The typed payload.
 * @param version - Engine version string.
 * @param uptime_ms - Current engine uptime.
 * @param execution_ms - Handler execution time.
 * @returns MCP CallToolResult with JSON-encoded body.
 */
function toSuccess<T>(
  data: T,
  version: string,
  uptime_ms: number,
  execution_ms: number
): CallToolResult {
  const result: RuntimeResult<T> = {
    success: true,
    data,
    meta: { engine: 'runtime-engine', version, uptime_ms, execution_ms },
  };
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    isError: false,
  };
}

/**
 * Wrap an error in a RuntimeResult envelope and encode for MCP.
 *
 * @param error - Human-readable error message.
 * @param version - Engine version string.
 * @param uptime_ms - Current engine uptime.
 * @param execution_ms - Handler execution time.
 * @returns MCP CallToolResult flagged as an error.
 */
function toError(
  error: string,
  version: string,
  uptime_ms: number,
  execution_ms: number
): CallToolResult {
  const result: RuntimeResult<never> = {
    success: false,
    error,
    meta: { engine: 'runtime-engine', version, uptime_ms, execution_ms },
  };
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    isError: true,
  };
}

// ─── runtime_status handler ────────────────────────────────────────────────

/**
 * Handle runtime_status tool calls.
 *
 * Returns a RuntimeResult<HealthStatus> containing uptime, memory,
 * PID, stub counts for Phase 1 (workflows/agents/queue), feature flags,
 * and individual health check results.
 *
 * Input schema: { include?: string[], verbosity?: string }
 */
export const handleRuntimeStatus: ToolHandler = async (
  args: unknown,
  ctx: HandlerContext
): Promise<CallToolResult> => {
  const start = Date.now();

  // Validate args — runtime_status accepts an optional object
  if (args !== null && args !== undefined && typeof args !== 'object') {
    return toError(
      'Invalid arguments: expected an object',
      ctx.version,
      ctx.getUptime(),
      Date.now() - start
    );
  }

  try {
    const uptime_ms = ctx.getUptime();
    // Delegate to HealthChecker via context to avoid duplicated logic
    const statusData = ctx.getHealth();

    logger.debug('runtime_status computed', { status: statusData.status });
    return toSuccess(statusData, ctx.version, uptime_ms, Date.now() - start);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('runtime_status failed', { error: message });
    return toError(message, ctx.version, ctx.getUptime(), Date.now() - start);
  }
};

// ─── runtime_config handler ────────────────────────────────────────────────

/**
 * Handle runtime_config tool calls.
 *
 * Supports three actions:
 * - get    — return full config, or config[key] if a dot-separated key is given
 * - set    — set config[key] = value and persist to disk
 * - reset  — restore DEFAULT_CONFIG and persist to disk
 *
 * Input schema: { action: 'get'|'set'|'reset', key?: string, value?: unknown }
 */
export const handleRuntimeConfig: ToolHandler = async (
  args: unknown,
  ctx: HandlerContext
): Promise<CallToolResult> => {
  const start = Date.now();
  const uptime_ms = ctx.getUptime();

  try {
    // Validate args before casting
    if (args === null || args === undefined || typeof args !== 'object') {
      return toError(
        'Invalid arguments: expected an object',
        ctx.version,
        uptime_ms,
        Date.now() - start
      );
    }
    const params = args as Record<string, unknown>;
    const action = params.action as string | undefined;

    if (!action) {
      return toError(
        "Missing required field: action. Use 'get', 'set', or 'reset'.",
        ctx.version,
        uptime_ms,
        Date.now() - start
      );
    }

    // ── get ──────────────────────────────────────────────────────────────────
    if (action === 'get') {
      const key = params.key as string | undefined;
      const config = ctx.getConfig();

      if (key) {
        const value = getNestedValue(config as unknown as Record<string, unknown>, key);
        return toSuccess({ key, value }, ctx.version, uptime_ms, Date.now() - start);
      }

      return toSuccess({ config }, ctx.version, uptime_ms, Date.now() - start);
    }

    // ── set ──────────────────────────────────────────────────────────────────
    if (action === 'set') {
      const key = params.key as string | undefined;
      const value = params.value;

      if (!key) {
        return toError(
          "Missing required field: key.",
          ctx.version,
          uptime_ms,
          Date.now() - start
        );
      }
      if (value === undefined) {
        return toError(
          "Missing required field: value.",
          ctx.version,
          uptime_ms,
          Date.now() - start
        );
      }

      // Build an updated config with the new key value applied (deep clone to
      // prevent shallow-clone aliasing bugs when setNestedValue mutates in-place)
      const current = ctx.getConfig();
      const updated = setNestedValue(
        JSON.parse(JSON.stringify(current)) as Record<string, unknown>,
        key,
        value
      ) as unknown as RuntimeConfig;

      saveConfig(ctx.projectRoot, updated);
      ctx.updateConfig(updated);
      logger.info('Config key set', { key, value });

      return toSuccess(
        { key, value, persisted: true },
        ctx.version,
        uptime_ms,
        Date.now() - start
      );
    }

    // ── reset ─────────────────────────────────────────────────────────────────
    if (action === 'reset') {
      saveConfig(ctx.projectRoot, DEFAULT_CONFIG);
      ctx.updateConfig(DEFAULT_CONFIG);
      logger.info('Config reset to defaults');
      return toSuccess(
        { config: DEFAULT_CONFIG, reset: true },
        ctx.version,
        uptime_ms,
        Date.now() - start
      );
    }

    return toError(
      `Unknown action: '${action}'. Use 'get', 'set', or 'reset'.`,
      ctx.version,
      uptime_ms,
      Date.now() - start
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('runtime_config failed', { error: message });
    return toError(message, ctx.version, ctx.getUptime(), Date.now() - start);
  }
};

// ─── Nested key helpers ────────────────────────────────────────────────────

/**
 * Read a dot-separated path from an object.
 *
 * @param obj  - Source object.
 * @param path - Dot-separated key path (e.g. 'server.port').
 * @returns The value at the path, or undefined if the path does not exist.
 */
function getNestedValue(
  obj: Record<string, unknown>,
  path: string
): unknown {
  const segments = path.split('.');
  let current: unknown = obj;

  for (const segment of segments) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

/**
 * Set a value at a dot-separated path within an object (mutates in-place).
 *
 * Intermediate objects are created automatically if missing.
 *
 * @param obj   - Target object.
 * @param path  - Dot-separated key path (e.g. 'server.port').
 * @param value - Value to assign.
 * @returns The mutated target object.
 */
function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown
): Record<string, unknown> {
  if (!path) {
    throw new Error('setNestedValue: path must not be empty');
  }
  const segments = path.split('.');
  if (segments.some((s) => s === '')) {
    throw new Error(`setNestedValue: path contains empty segment: "${path}"`);
  }
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (
      current[segment] === undefined ||
      current[segment] === null ||
      typeof current[segment] !== 'object'
    ) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }

  current[segments[segments.length - 1]] = value;
  return obj;
}

// ─── Tool schemas ─────────────────────────────────────────────────────────────

/**
 * MCP tool schema definitions for all Phase 1 runtime-engine tools.
 * Returned verbatim in response to ListToolsRequestSchema.
 */
export const allSchemas = [
  {
    name: 'runtime_status',
    description:
      'Get the current health, uptime, and operational status of the runtime engine. ' +
      'Returns process metrics, feature flags, and individual health check results.',
    inputSchema: {
      type: 'object',
      properties: {
        include: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['workflows', 'agents', 'queue', 'triggers', 'budget', 'health'],
          },
          description:
            'Subsystems to include in the response. Omit to return all available data.',
        },
        verbosity: {
          type: 'string',
          enum: ['count_only', 'minimal', 'standard', 'verbose'],
          default: 'standard',
          description: 'Response verbosity level.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'runtime_config',
    description:
      'Read or modify runtime-engine configuration. ' +
      'Use get to read (full config or a single dot-separated key), ' +
      'set to persist a single key-value pair, ' +
      'or reset to restore factory defaults.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['get', 'set', 'reset'],
          description: 'Operation to perform.',
        },
        key: {
          type: 'string',
          description:
            'Dot-separated configuration key (e.g. "server.log_level"). ' +
            'Required for set; optional for get (returns full config if omitted).',
        },
        value: {
          description:
            'Value to assign. Required for set. Accepts any JSON-serialisable value.',
        },
      },
      additionalProperties: false,
    },
  },
] as const;

// ─── Handler registry ─────────────────────────────────────────────────────────

/**
 * Central registry mapping tool names to handler functions.
 * Mirrors the pattern used by precision-engine's handlerRegistry.
 */
export const handlerRegistry = new Map<string, ToolHandler>([
  ['runtime_status', handleRuntimeStatus],
  ['runtime_config', handleRuntimeConfig],
]);

/**
 * Retrieve a registered handler by tool name.
 *
 * @param toolName - The MCP tool name.
 * @returns The handler function, or undefined if not registered.
 */
export function getHandler(toolName: string): ToolHandler | undefined {
  return handlerRegistry.get(toolName);
}

/**
 * Check whether a tool is registered.
 *
 * @param toolName - The MCP tool name.
 * @returns True if a handler is registered for the given name.
 */
export function hasHandler(toolName: string): boolean {
  return handlerRegistry.has(toolName);
}

/**
 * List all registered tool names.
 *
 * @returns Array of tool name strings.
 */
export function listHandlers(): string[] {
  return Array.from(handlerRegistry.keys());
}
