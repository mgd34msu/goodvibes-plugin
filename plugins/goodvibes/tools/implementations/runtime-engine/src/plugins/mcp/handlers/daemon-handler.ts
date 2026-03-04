/**
 * MCP handler for daemon management.
 * Provides start/stop/status/sessions actions.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { HandlerContext } from './types.js';
import { DaemonLifecycle } from '../../../transport/daemon-lifecycle.js';
import { RemoteTransport } from '../../../transport/remote-transport.js';
import { toSuccess, toError } from './shared.js';
import { toErrorMessage } from '../../../shared/utils.js';
import { createLogger } from '../../../shared/logger.js';

const logger = createLogger('daemon-handler');

export async function handleDaemon(
  args: unknown,
  ctx: HandlerContext,
): Promise<CallToolResult> {
  const startTime = Date.now();
  const version = ctx.version;
  const uptime = ctx.getUptime();

  // Validate args
  const params = (args ?? {}) as Record<string, unknown>;
  const { action } = params;
  if (!action) {
    return toError(
      'Missing required parameter: action',
      version,
      uptime,
      Date.now() - startTime,
    );
  }

  const projectRoot = ctx.projectRoot;
  const lifecycle = new DaemonLifecycle(projectRoot);

  switch (action) {
    case 'start': {
      try {
        logger.info('Starting daemon');
        await lifecycle.start();
        const status = await lifecycle.getStatus();
        return toSuccess(
          { message: 'Daemon started', ...status },
          version,
          uptime,
          Date.now() - startTime,
        );
      } catch (err) {
        return toError(
          `Failed to start daemon: ${toErrorMessage(err)}`,
          version,
          uptime,
          Date.now() - startTime,
        );
      }
    }

    case 'stop': {
      try {
        logger.info('Stopping daemon');
        await lifecycle.stop();
        return toSuccess(
          { message: 'Daemon stopped' },
          version,
          uptime,
          Date.now() - startTime,
        );
      } catch (err) {
        return toError(
          `Failed to stop daemon: ${toErrorMessage(err)}`,
          version,
          uptime,
          Date.now() - startTime,
        );
      }
    }

    case 'status': {
      try {
        const status = await lifecycle.getStatus();

        // If running and we have a transport, enrich with uptime
        if (status.running && ctx.transport) {
          try {
            status.uptime = await ctx.transport.getUptime();
          } catch { /* ignore */ }
        }

        return toSuccess(
          status,
          version,
          uptime,
          Date.now() - startTime,
        );
      } catch (err) {
        return toError(
          `Failed to get daemon status: ${toErrorMessage(err)}`,
          version,
          uptime,
          Date.now() - startTime,
        );
      }
    }

    case 'sessions': {
      // Session list requires daemon RPC
      if (!ctx.transport || ctx.transport.mode !== 'remote') {
        return toError(
          'Sessions query requires an active daemon connection',
          version,
          uptime,
          Date.now() - startTime,
        );
      }
      try {
        const remote = ctx.transport as RemoteTransport;
        const sessions = await remote.rpc('listSessions');
        return toSuccess(
          { sessions },
          version,
          uptime,
          Date.now() - startTime,
        );
      } catch (err) {
        return toError(
          `Failed to query sessions: ${toErrorMessage(err)}`,
          version,
          uptime,
          Date.now() - startTime,
        );
      }
    }

    default:
      return toError(
        `Unknown daemon action: ${action}. Valid: start, stop, status, sessions`,
        version,
        uptime,
        Date.now() - startTime,
      );
  }
}
