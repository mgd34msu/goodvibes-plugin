/**
 * Handler for the runtime_state MCP tool.
 *
 * Queries the runtime engine's in-memory state store.
 *
 * Actions:
 * - get       — return state[key] for a dot-separated key
 * - list      — list keys under a namespace prefix
 * - namespaces — list top-level namespace prefixes
 * - snapshot  — return a full snapshot of all state (use with care)
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createLogger } from '../../../shared/logger.js';
import { assertOptionalString, toErrorMessage } from '../../../shared/utils.js';
import type { HandlerContext } from './types.js';
import { toSuccess, toError } from './shared.js';

const logger = createLogger('tool-handlers:state');

export const handleRuntimeState = async (
  args: unknown,
  ctx: HandlerContext,
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
        "Missing required field: action. Use 'get', 'list', 'namespaces', or 'snapshot'.",
        ctx.version, uptimeMs, Date.now() - start
      );
    }

    // ── get ──
    if (action === 'get') {
      const key = assertOptionalString(params.key, 'key');
      if (!key) {
        return toError('Missing required field: key.', ctx.version, uptimeMs, Date.now() - start);
      }
      if (ctx.transport) {
        const value = await ctx.transport.getState(key);
        return toSuccess({ key, value }, ctx.version, uptimeMs, Date.now() - start);
      }
      const stateStore = ctx.getCoreStateStore();
      if (!stateStore) {
        return toError('State store not available (engine not started)', ctx.version, uptimeMs, Date.now() - start);
      }
      // CoreStateStore.get() internally validates dot-path (prototype pollution guard)
      const value = stateStore.get(key);
      return toSuccess({ key, value }, ctx.version, uptimeMs, Date.now() - start);
    }

    // ── list ──
    if (action === 'list') {
      const prefix =
        assertOptionalString(params.namespace, 'namespace') ??
        assertOptionalString(params.prefix, 'prefix');
      let allKeys: string[];
      if (ctx.transport) {
        allKeys = await ctx.transport.listStateKeys(prefix);
      } else {
        const stateStore = ctx.getCoreStateStore();
        if (!stateStore) {
          return toError('State store not available (engine not started)', ctx.version, uptimeMs, Date.now() - start);
        }
        allKeys = stateStore.keys(prefix);
      }

      if (prefix) {
        const stripped = allKeys.map(k =>
          k.startsWith(prefix + '.') ? k.slice(prefix.length + 1) : k
        );
        return toSuccess(
          { namespace: prefix, count: allKeys.length, keys: stripped, full_keys: allKeys },
          ctx.version, uptimeMs, Date.now() - start
        );
      }

      return toSuccess({ count: allKeys.length, keys: allKeys }, ctx.version, uptimeMs, Date.now() - start);
    }

    // ── namespaces ──
    if (action === 'namespaces') {
      let allKeys: string[];
      if (ctx.transport) {
        allKeys = await ctx.transport.listStateKeys();
      } else {
        const stateStore = ctx.getCoreStateStore();
        if (!stateStore) {
          return toError('State store not available (engine not started)', ctx.version, uptimeMs, Date.now() - start);
        }
        allKeys = stateStore.keys();
      }
      const namespaces = new Set<string>();
      for (const key of allKeys) {
        const firstDot = key.indexOf('.');
        if (firstDot > 0) {
          namespaces.add(key.slice(0, firstDot));
        } else {
          namespaces.add(key);
        }
      }
      const sorted = Array.from(namespaces).sort();
      return toSuccess({ count: sorted.length, namespaces: sorted }, ctx.version, uptimeMs, Date.now() - start);
    }

    // ── snapshot ──
    if (action === 'snapshot') {
      const namespace = assertOptionalString(params.namespace, 'namespace') ?? assertOptionalString(params.prefix, 'prefix');
      let fullSnapshot: Record<string, unknown>;
      if (ctx.transport) {
        fullSnapshot = await ctx.transport.getStateSnapshot();
      } else {
        const stateStore = ctx.getCoreStateStore();
        if (!stateStore) {
          return toError('State store not available (engine not started)', ctx.version, uptimeMs, Date.now() - start);
        }
        fullSnapshot = stateStore.snapshot();
      }

      if (namespace) {
        const filtered: Record<string, unknown> = {};
        const pfx = namespace + '.';
        const MAX_WALK_DEPTH = 20;
        const walk = (obj: Record<string, unknown>, path: string, depth = 0) => {
          if (depth >= MAX_WALK_DEPTH) return;
          for (const [k, v] of Object.entries(obj)) {
            const full = path ? `${path}.${k}` : k;
            if (full === namespace || full.startsWith(pfx)) {
              filtered[full] = v;
            } else if (
              typeof v === 'object' &&
              v !== null &&
              !Array.isArray(v) &&
              namespace.startsWith(full)
            ) {
              walk(v as Record<string, unknown>, full, depth + 1);
            }
          }
        };
        walk(fullSnapshot, '');
        return toSuccess({ namespace, snapshot: filtered }, ctx.version, uptimeMs, Date.now() - start);
      }

      return toSuccess({ snapshot: fullSnapshot }, ctx.version, uptimeMs, Date.now() - start);
    }

    return toError(
      `Unknown action: '${action}'. Use 'get', 'list', 'namespaces', or 'snapshot'.`,
      ctx.version, uptimeMs, Date.now() - start
    );
  } catch (err) {
    const message = toErrorMessage(err);
    logger.error('runtime_state failed', { error: message });
    return toError(message, ctx.version, ctx.getUptime(), Date.now() - start);
  }
};
