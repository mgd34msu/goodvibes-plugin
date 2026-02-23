/**
 * Handler for the runtime_status MCP tool.
 *
 * Returns a RuntimeResult<HealthStatus> containing uptime, memory,
 * PID, stub counts for Phase 1 (workflows/agents/queue), feature flags,
 * and individual health check results.
 *
 * Input schema: { include?: string[], verbosity?: string }
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { createLogger } from '../../shared/logger.js';
import { toErrorMessage } from '../../shared/utils.js';
import type { HandlerContext } from './types.js';
import { toSuccess, toError } from './shared.js';

const logger = createLogger('tool-handlers:status');

/**
 * Handle runtime_status tool calls.
 */
export const handleRuntimeStatus = async (
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
    const uptimeMs = ctx.getUptime();
    // Delegate to HealthChecker via context to avoid duplicated logic
    const statusData = ctx.getHealth();

    logger.debug('runtime_status computed', { status: statusData.status });
    return toSuccess(statusData, ctx.version, uptimeMs, Date.now() - start);
  } catch (err) {
    const message = toErrorMessage(err);
    logger.error('runtime_status failed', { error: message });
    return toError(message, ctx.version, ctx.getUptime(), Date.now() - start);
  }
};
