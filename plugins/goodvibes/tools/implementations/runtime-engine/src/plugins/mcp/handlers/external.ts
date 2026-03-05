/**
 * Handler for the runtime_external MCP tool.
 *
 * Provides observability and control for the ExternalPlugin:
 * HTTP listener status, normalizer registry, payload testing, ingestion stats.
 *
 * Actions: status, normalizers, test_normalize, stats, queue
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createLogger } from '../../../shared/logger.js';
import { toErrorMessage } from '../../../shared/utils.js';
import type { HandlerContext } from './types.js';
import { toSuccess, toError } from './shared.js';

const logger = createLogger('tool-handlers:external');

const VALID_ACTIONS = ['status', 'normalizers', 'test_normalize', 'stats', 'queue'] as const;
type ExternalAction = typeof VALID_ACTIONS[number];

export const handleRuntimeExternal = async (
  args: unknown,
  ctx: HandlerContext,
): Promise<CallToolResult> => {
  const start = Date.now();
  const version = ctx.version;
  const uptime = ctx.getUptime();

  const params = (args ?? {}) as Record<string, unknown>;
  const action = params.action as ExternalAction | undefined;

  if (!action) {
    return toError('Missing required parameter: action', version, uptime, Date.now() - start);
  }
  if (!VALID_ACTIONS.includes(action)) {
    return toError(
      `Unknown action: ${action}. Valid: ${VALID_ACTIONS.join(', ')}`,
      version,
      uptime,
      Date.now() - start,
    );
  }

  const externalPlugin = ctx.getExternalPlugin?.();
  if (!externalPlugin && !ctx.transport) {
    return toError(
      'ExternalPlugin is not available (engine may not be running in local mode)',
      version,
      uptime,
      Date.now() - start,
    );
  }

  try {
    // Non-status actions require local ExternalPlugin access
    if (action !== 'status' && !externalPlugin) {
      return toError(
        'ExternalPlugin is not available — operations other than status are not yet supported in daemon mode',
        version,
        uptime,
        Date.now() - start,
      );
    }

    switch (action) {
      case 'status': {
        if (ctx.transport) {
          const status = await ctx.transport.getExternalStatus();
          return toSuccess(status, version, uptime, Date.now() - start);
        }
        const httpRunning = externalPlugin!.isHttpListenerRunning();
        const normalizerSources = externalPlugin!.getNormalizerRegistry().sources();
        return toSuccess(
          {
            http_listener: {
              running: httpRunning,
              port: externalPlugin!.getHttpPort(),
              address: externalPlugin!.getHttpAddress(),
            },
            normalizer_count: normalizerSources.length,
            normalizer_sources: normalizerSources,
          },
          version,
          uptime,
          Date.now() - start,
        );
      }

      case 'normalizers': {
        const registry = externalPlugin!.getNormalizerRegistry();
        const sources = registry.sources();
        return toSuccess(
          { sources, count: sources.length },
          version,
          uptime,
          Date.now() - start,
        );
      }

      case 'test_normalize': {
        const source = params.source as string | undefined;
        const payload = params.payload as Record<string, unknown> | undefined;
        const headers = params.headers as Record<string, string> | undefined;

        if (!source) {
          return toError(
            'Missing required parameter: source',
            version,
            uptime,
            Date.now() - start,
          );
        }
        if (payload === undefined) {
          return toError(
            'Missing required parameter: payload',
            version,
            uptime,
            Date.now() - start,
          );
        }

        const registry = externalPlugin!.getNormalizerRegistry();
        try {
          const normalized = registry.normalize(source, payload, headers);
          return toSuccess(
            { normalized, source },
            version,
            uptime,
            Date.now() - start,
          );
        } catch (normErr) {
          return toError(
            `Normalization failed for source '${source}': ${toErrorMessage(normErr)}`,
            version,
            uptime,
            Date.now() - start,
          );
        }
      }

      case 'stats': {
        const since = params.since ? new Date(params.since as string).getTime() : 0;
        const normalizerRegistry = externalPlugin!.getNormalizerRegistry();
        return toSuccess(
          {
            action: 'stats',
            since: since > 0 ? new Date(since).toISOString() : 'all_time',
            normalizers: normalizerRegistry ? normalizerRegistry.sources() : [],
            http_listener: {
              running: externalPlugin!.isHttpListenerRunning(),
            },
            note: 'Detailed webhook receive/error counts require ExternalPlugin stats tracking (not yet implemented)',
          },
          version,
          uptime,
          Date.now() - start,
        );
      }

      case 'queue': {
        // Surface event queue depth via the EventQueue.depth() API and any
        // persisted external plugin stats from the state store.
        const stateStore = ctx.getCoreStateStore();
        const eventQueue = ctx.getEventQueue();
        // EventQueue.depth() returns the number of pending (non-cancelled) items.
        const queueDepth = eventQueue != null ? eventQueue.depth() : null;
        const queueStats = stateStore?.get?.('external_plugin.stats') ?? null;
        return toSuccess(
          {
            queue_depth: queueDepth,
            external_stats: queueStats,
          },
          version,
          uptime,
          Date.now() - start,
        );
      }
    }
  } catch (err) {
    const message = toErrorMessage(err);
    logger.error('runtime_external failed', { action, error: message });
    return toError(message, version, uptime, Date.now() - start);
  }
}
