/**
 * Handler for the runtime_events MCP tool.
 *
 * Actions:
 * - query: filter the persistent event log using the provided filter
 * - tail: retrieve last N events from the in-memory EventBus history
 * - stats: return EventLog stats + event queue depth
 * - directives: query the DirectiveQueue for pending orchestrator directives
 *
 * Input schema: { action: 'query'|'tail'|'stats'|'directives', filter?: {...}, mode?: string, target?: string, verbosity?: string }
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { createLogger } from '../../../shared/logger.js';
import { assertOptionalString, parseRelativeTime, toErrorMessage } from '../../../shared/utils.js';
import { DEFAULT_EVENT_QUERY_LIMIT } from '../../../shared/constants.js';
import type { EventFilter } from '../../../shared/events.js';
import type { EventType, RuntimeEvent } from '../../../shared/events.js';
import type { Directive } from '../../../shared/ipc/protocol.js';
import type { HandlerContext } from './types.js';
import { toSuccess, toError } from './shared.js';

const logger = createLogger('tool-handlers:events');

/**
 * Checks whether an event type matches a pattern.
 * Supports exact match, namespace wildcard ('hook:*'), and global wildcard ('*').
 *
 * @param eventType - The event type string to test (e.g. 'hook:pre_tool_use').
 * @param pattern   - The pattern to match against. '*' matches all types;
 *   'ns:*' matches any type in the 'ns' namespace; otherwise exact match.
 * @returns True if the event type matches the pattern.
 */
export function matchesTypePattern(eventType: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith(':*')) {
    const ns = pattern.slice(0, -2);
    return eventType.startsWith(`${ns}:`);
  }
  return eventType === pattern;
}

/**
 * Resolves a time string to an ISO 8601 timestamp.
 * Supports ISO strings directly, or relative strings like '5m', '1h', '30s'.
 *
 * @param value - ISO timestamp string, epoch ms number string, or relative duration (e.g. '5m', '1h', '30s').
 * @returns Epoch ms number representing the resolved point in time.
 */
export function resolveTimestamp(value: string): number {
  // If it looks like an ISO timestamp, convert to epoch ms
  if (value.includes('T') || value.includes('-')) return new Date(value).getTime();
  // If it looks like a number (epoch ms), parse it directly
  const asNumber = Number(value);
  if (!isNaN(asNumber) && asNumber > 0) return asNumber;
  // parseRelativeTime returns a future Date (throws on invalid input)
  try {
    const futureDate = parseRelativeTime(value);
    const durationMs = futureDate.getTime() - Date.now();
    return Date.now() - durationMs;
  } catch {
    return Date.now();
  }
}

/**
 * Applies verbosity to an events array for response shaping.
 *
 * @param events    - Array of RuntimeEvents to shape.
 * @param verbosity - Verbosity level: 'count_only' returns only a count,
 *   'minimal' returns id/type/timestamp/source_kind per event,
 *   'standard' or 'verbose' returns the full event objects.
 * @returns A shaped response object appropriate for the requested verbosity.
 */
export function applyVerbosity(
  events: RuntimeEvent[],
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

/**
 * Handle runtime_events tool calls.
 *
 * Actions:
 * - query: filter the persistent event log using the provided filter
 * - tail: retrieve last N events from the in-memory EventBus history
 * - stats: return EventLog stats + event queue depth
 * - directives: query the DirectiveQueue (peek or drain)
 */
export const handleRuntimeEvents = async (
  args: unknown,
  ctx: HandlerContext
): Promise<CallToolResult> => {
  const start = Date.now();
  const uptimeMs = ctx.getUptime();

  try {
    if (args === null || args === undefined || typeof args !== 'object') {
      return toError('Invalid arguments: expected an object', ctx.version, uptimeMs, Date.now() - start);
    }
    const params = args as Record<string, unknown>;
    const action = assertOptionalString(params.action, 'action');

    if (!action) {
      return toError(
        "Missing required field: action. Use 'query', 'tail', 'stats', or 'directives'.",
        ctx.version, uptimeMs, Date.now() - start
      );
    }

    const verbosity = assertOptionalString(params.verbosity, 'verbosity') ?? 'standard';
    const filterRaw = (params.filter ?? {}) as Record<string, unknown>;

    // ── stats ─────────────────────────────────────────────────────────────────
    // stats: not covered by transport — EventLog stats and EventBus history
    // are not part of the RuntimeTransport interface
    if (action === 'stats') {
      const logStats = ctx.getEventLog().getStats();
      const queueStats = ctx.getEventQueue().getStats();
      const data = verbosity === 'count_only'
        ? { event_count: logStats.total_events, queue_pending: queueStats.pending }
        : { log: logStats, queue: queueStats };
      return toSuccess(data, ctx.version, uptimeMs, Date.now() - start);
    }

    // ── tail ──────────────────────────────────────────────────────────────────
    // tail: not covered by transport — EventBus in-memory history
    // is not part of the RuntimeTransport interface
    if (action === 'tail') {
      const limit = typeof filterRaw.limit === 'number' ? filterRaw.limit : DEFAULT_EVENT_QUERY_LIMIT;
      const typePatterns = Array.isArray(filterRaw.types)
        ? (filterRaw.types as string[])
        : undefined;

      // Build an EventFilter for getHistory — only exact types supported there
      // We apply pattern filtering after the fact if glob patterns are present
      const historyFilter: EventFilter = {
        correlation_id: assertOptionalString(filterRaw.correlation_id, 'filter.correlation_id'),
        since: filterRaw.since ? resolveTimestamp(assertOptionalString(filterRaw.since, 'filter.since') ?? '') : undefined,
        until: filterRaw.until ? resolveTimestamp(assertOptionalString(filterRaw.until, 'filter.until') ?? '') : undefined,
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
      return toSuccess(data, ctx.version, uptimeMs, Date.now() - start);
    }

    // ── query ─────────────────────────────────────────────────────────────────
    if (action === 'query') {
      const typePatterns = Array.isArray(filterRaw.types)
        ? (filterRaw.types as string[])
        : undefined;

      // Separate exact types from wildcard patterns for the log query
      let exactTypes: import('../../../shared/events.js').EventType[] | undefined;
      let hasWildcards = false;
      if (typePatterns && typePatterns.length > 0) {
        const exact: import('../../../shared/events.js').EventType[] = [];
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
        correlation_id: assertOptionalString(filterRaw.correlation_id, 'filter.correlation_id'),
        since: filterRaw.since ? resolveTimestamp(assertOptionalString(filterRaw.since, 'filter.since') ?? '') : undefined,
        until: filterRaw.until ? resolveTimestamp(assertOptionalString(filterRaw.until, 'filter.until') ?? '') : undefined,
        limit: typeof filterRaw.limit === 'number' ? filterRaw.limit : DEFAULT_EVENT_QUERY_LIMIT,
      };

      let events = ctx.transport
        ? await ctx.transport.queryEvents(logFilter)
        : await ctx.getEventLog().query(logFilter);

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
      return toSuccess(data, ctx.version, uptimeMs, Date.now() - start);
    }

    // ── directives ──────────────────────────────────────────────────────────────────────────────
    if (action === 'directives') {
      const mode = (params.mode as string | undefined) ?? 'peek';
      const target = (params.target as string | undefined) ?? 'subagent_stop';

      let directives: unknown[];
      if (ctx.transport && mode === 'drain') {
        const result = await ctx.transport.drainDirectives(target);
        directives = result.directives;
      } else {
        const queue = ctx.getDirectiveQueue();
        if (!queue) {
          return toError(
            'Directive queue not initialized',
            ctx.version, uptimeMs, Date.now() - start
          );
        }
        directives = mode === 'drain' ? queue.drain(target) : queue.peek(target);
      }
      const count = directives.length;

      let data: unknown;
      if (verbosity === 'count_only') {
        data = { count, target, mode };
      } else if (verbosity === 'minimal') {
        data = {
          count,
          target,
          mode,
          directives: (directives as Directive[]).map((d) => ({
            type: d.type,
            priority: d.priority,
            source: d.source,
          })),
        };
      } else {
        data = { count, target, mode, directives };
      }

      return toSuccess(data, ctx.version, uptimeMs, Date.now() - start);
    }

    return toError(
      `Unknown action: '${action}'. Use 'query', 'tail', 'stats', or 'directives'.`,
      ctx.version, uptimeMs, Date.now() - start
    );
  } catch (err) {
    const message = toErrorMessage(err);
    logger.error('runtime_events failed', { error: message });
    return toError(message, ctx.version, ctx.getUptime(), Date.now() - start);
  }
};
