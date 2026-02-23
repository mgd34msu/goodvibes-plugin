/**
 * Tool handler implementations for the runtime-engine MCP server.
 *
 * Phase 1 tools:
 * - runtime_status  — health, uptime, and runtime diagnostics
 * - runtime_config  — configuration management (get/set/reset)
 *
 * Phase 2 tools:
 * - runtime_events  — query/tail the event log and queue statistics
 * - runtime_emit    — emit a custom event into the event bus
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
import type { EventBus } from '../events/event-bus.js';
import type { EventLog } from '../events/event-log.js';
import type { EventQueue } from '../events/event-queue.js';
import type { EventType, EventFilter } from '../events/types.js';
import { generateEventId, timestamp, parseRelativeTime } from '../shared/utils.js';

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
  /** The runtime event bus (in-memory pub/sub). */
  getEventBus: () => EventBus;
  /** The persistent JSONL event log. */
  getEventLog: () => EventLog;
  /** The priority event queue. */
  getEventQueue: () => EventQueue;
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

// ─── runtime_events handler ───────────────────────────────────────────────

/**
 * Checks whether an event type matches a pattern.
 * Supports exact match, namespace wildcard ('hook:*'), and global wildcard ('*').
 */
function matchesTypePattern(eventType: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith(':*')) {
    const ns = pattern.slice(0, -2);
    return eventType.startsWith(`${ns}:`);
  }
  return eventType === pattern;
}

/**
 * Handle runtime_events tool calls.
 *
 * Actions:
 * - query: filter the persistent event log using the provided filter
 * - tail: retrieve last N events from the in-memory EventBus history
 * - stats: return EventLog stats + EventQueue stats
 *
 * Input schema: { action: 'query'|'tail'|'stats', filter?: {...}, verbosity?: string }
 */
export const handleRuntimeEvents: ToolHandler = async (
  args: unknown,
  ctx: HandlerContext
): Promise<CallToolResult> => {
  const start = Date.now();
  const uptime_ms = ctx.getUptime();

  try {
    if (args === null || args === undefined || typeof args !== 'object') {
      return toError('Invalid arguments: expected an object', ctx.version, uptime_ms, Date.now() - start);
    }
    const params = args as Record<string, unknown>;
    const action = params.action as string | undefined;

    if (!action) {
      return toError(
        "Missing required field: action. Use 'query', 'tail', or 'stats'.",
        ctx.version, uptime_ms, Date.now() - start
      );
    }

    const verbosity = (params.verbosity as string | undefined) ?? 'standard';
    const filterRaw = (params.filter ?? {}) as Record<string, unknown>;

    // ── stats ─────────────────────────────────────────────────────────────────
    if (action === 'stats') {
      const logStats = ctx.getEventLog().getStats();
      const queueStats = ctx.getEventQueue().getStats();
      const data = verbosity === 'count_only'
        ? { event_count: logStats.total_events, queue_pending: queueStats.pending }
        : { log: logStats, queue: queueStats };
      return toSuccess(data, ctx.version, uptime_ms, Date.now() - start);
    }

    // ── tail ──────────────────────────────────────────────────────────────────
    if (action === 'tail') {
      const limit = typeof filterRaw.limit === 'number' ? filterRaw.limit : 50;
      const typePatterns = Array.isArray(filterRaw.types)
        ? (filterRaw.types as string[])
        : undefined;

      // Build an EventFilter for getHistory — only exact types supported there
      // We apply pattern filtering after the fact if glob patterns are present
      const historyFilter: EventFilter = {
        correlation_id: filterRaw.correlation_id as string | undefined,
        since: filterRaw.since ? resolveTimestamp(filterRaw.since as string) : undefined,
        until: filterRaw.until as string | undefined,
        limit,
      };

      let events = ctx.getEventBus().getHistory(historyFilter);

      // Apply type pattern filtering (supports 'hook:*', 'agent:spawned', '*')
      if (typePatterns && typePatterns.length > 0) {
        events = events.filter((e) =>
          typePatterns.some((p) => matchesTypePattern(e.type, p))
        );
      }

      // Apply source_kind filter
      if (filterRaw.source_kind) {
        events = events.filter((e) => e.source.kind === filterRaw.source_kind);
      }

      const data = applyVerbosity(events, verbosity);
      return toSuccess(data, ctx.version, uptime_ms, Date.now() - start);
    }

    // ── query ─────────────────────────────────────────────────────────────────
    if (action === 'query') {
      const typePatterns = Array.isArray(filterRaw.types)
        ? (filterRaw.types as string[])
        : undefined;

      // Separate exact types from wildcard patterns for the log query
      let exactTypes: EventType[] | undefined;
      let hasWildcards = false;
      if (typePatterns && typePatterns.length > 0) {
        const exact: EventType[] = [];
        for (const p of typePatterns) {
          if (p === '*' || p.endsWith(':*')) {
            hasWildcards = true;
          } else {
            exact.push(p as EventType);
          }
        }
        // If only exact types (no wildcards), pass them to the log filter for efficiency
        if (!hasWildcards) {
          exactTypes = exact;
        }
      }

      const logFilter: EventFilter = {
        types: exactTypes,
        correlation_id: filterRaw.correlation_id as string | undefined,
        since: filterRaw.since ? resolveTimestamp(filterRaw.since as string) : undefined,
        until: filterRaw.until as string | undefined,
        limit: typeof filterRaw.limit === 'number' ? filterRaw.limit : 50,
      };

      let events = await ctx.getEventLog().query(logFilter);

      // Apply wildcard type patterns post-query
      if (hasWildcards && typePatterns) {
        events = events.filter((e) =>
          typePatterns.some((p) => matchesTypePattern(e.type, p))
        );
      }

      // Apply source_kind filter
      if (filterRaw.source_kind) {
        events = events.filter((e) => e.source.kind === filterRaw.source_kind);
      }

      const data = applyVerbosity(events, verbosity);
      return toSuccess(data, ctx.version, uptime_ms, Date.now() - start);
    }

    return toError(
      `Unknown action: '${action}'. Use 'query', 'tail', or 'stats'.`,
      ctx.version, uptime_ms, Date.now() - start
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('runtime_events failed', { error: message });
    return toError(message, ctx.version, ctx.getUptime(), Date.now() - start);
  }
};

/**
 * Resolves a time string to an ISO 8601 timestamp.
 * Supports ISO strings directly, or relative strings like '5m', '1h', '30s'.
 */
function resolveTimestamp(value: string): string {
  // If it already looks like an ISO timestamp, pass through
  if (value.includes('T') || value.includes('-')) return value;
  // parseRelativeTime returns a future Date (throws on invalid input)
  try {
    const futureDate = parseRelativeTime(value);
    const durationMs = futureDate.getTime() - Date.now();
    return new Date(Date.now() - durationMs).toISOString();
  } catch {
    return value;
  }
}

/**
 * Applies verbosity to an events array for response shaping.
 */
function applyVerbosity(
  events: import('../events/types.js').RuntimeEvent[],
  verbosity: string
): unknown {
  if (verbosity === 'count_only') {
    return { count: events.length };
  }
  if (verbosity === 'minimal') {
    return {
      count: events.length,
      events: events.map((e) => ({
        id: e.id,
        type: e.type,
        timestamp: e.timestamp,
        source_kind: e.source.kind,
      })),
    };
  }
  // standard / verbose
  return { count: events.length, events };
}

// ─── runtime_emit handler ─────────────────────────────────────────────────

/**
 * Handle runtime_emit tool calls.
 *
 * Emits a custom event into the EventBus with source kind 'mcp_tool'.
 *
 * Input schema: { event_type: string, payload?: object, correlation_id?: string }
 */
export const handleRuntimeEmit: ToolHandler = async (
  args: unknown,
  ctx: HandlerContext
): Promise<CallToolResult> => {
  const start = Date.now();
  const uptime_ms = ctx.getUptime();

  try {
    if (args === null || args === undefined || typeof args !== 'object') {
      return toError('Invalid arguments: expected an object', ctx.version, uptime_ms, Date.now() - start);
    }
    const params = args as Record<string, unknown>;
    const eventType = params.event_type as string | undefined;

    if (!eventType) {
      return toError(
        'Missing required field: event_type.',
        ctx.version, uptime_ms, Date.now() - start
      );
    }

    const payload = (params.payload as Record<string, unknown> | undefined) ?? {};
    const correlationId = params.correlation_id as string | undefined;

    // Validate event_type prefix — custom types are accepted but unknown prefixes are flagged
    const knownPrefixes = ['session:', 'hook:', 'workflow:', 'wrfc:', 'fix:', 'agent:', 'trigger:', 'file:', 'build:', 'test:', 'devserver:', 'engine:', 'system:'];
    const isKnownPrefix = knownPrefixes.some((p) => eventType.startsWith(p));
    if (!isKnownPrefix) {
      logger.warn('runtime_emit: unknown event type prefix', { event_type: eventType });
    }

    const emitted = ctx.getEventBus().emit({
      id: generateEventId(),
      timestamp: timestamp(),
      type: eventType as EventType,
      source: { kind: 'mcp_tool', tool_name: 'runtime_emit' },
      payload: { type: eventType as EventType, data: payload } as import('../events/types.js').EventPayload,
      metadata: correlationId ? { correlation_id: correlationId } : undefined,
    });

    logger.info('runtime_emit: event emitted', { type: eventType, id: emitted.id });
    return toSuccess({ emitted }, ctx.version, uptime_ms, Date.now() - start);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('runtime_emit failed', { error: message });
    return toError(message, ctx.version, ctx.getUptime(), Date.now() - start);
  }
};

// ─── Tool schemas ─────────────────────────────────────────────────────────────

/**
 * MCP tool schema definitions for all runtime-engine tools (Phase 1 + Phase 2).
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
  {
    name: 'runtime_events',
    description:
      'Query the runtime event log: filter by type, source, time range. ' +
      'Inspect event history and queue statistics.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['query', 'tail', 'stats'],
          description:
            'query: filter event log (persistent), ' +
            'tail: recent events from in-memory bus history, ' +
            'stats: log and queue statistics.',
        },
        filter: {
          type: 'object',
          properties: {
            types: {
              type: 'array',
              items: { type: 'string' },
              description: "Event type patterns to filter (supports glob: 'hook:*', '*').",
            },
            source_kind: {
              type: 'string',
              description: 'Filter by event source kind (e.g. hook, agent, system).',
            },
            since: {
              type: 'string',
              description: "Start time (ISO timestamp or relative: '5m', '1h', '30s').",
            },
            until: {
              type: 'string',
              description: 'End time (ISO timestamp).',
            },
            correlation_id: {
              type: 'string',
              description: 'Filter by correlation ID.',
            },
            limit: {
              type: 'number',
              default: 50,
              description: 'Maximum number of events to return.',
            },
          },
          additionalProperties: false,
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
    name: 'runtime_emit',
    description:
      'Emit a custom event into the runtime event bus. ' +
      'Useful for manual workflow advancement, trigger testing, or custom automation.',
    inputSchema: {
      type: 'object',
      required: ['event_type'],
      properties: {
        event_type: {
          type: 'string',
          description: "Event type to emit (e.g. 'system:health_check', 'trigger:fired').",
        },
        payload: {
          type: 'object',
          description: 'Event payload data.',
        },
        correlation_id: {
          type: 'string',
          description: 'Link to a related event chain.',
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
  ['runtime_events', handleRuntimeEvents],
  ['runtime_emit', handleRuntimeEmit],
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
