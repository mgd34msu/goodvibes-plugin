/**
 * Handler for the runtime_emit MCP tool.
 *
 * Emits a custom event into the EventBus with source kind 'mcp_tool'.
 *
 * Input schema: { event_type: string, payload?: object, correlation_id?: string }
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { createLogger } from '../../shared/logger.js';
import { generateEventId, timestamp, toErrorMessage } from '../../shared/utils.js';
import type { EventType, EventPayload } from '../../events/types.js';
import type { HandlerContext } from './types.js';
import { toSuccess, toError } from './shared.js';

const logger = createLogger('tool-handlers:emit');

/**
 * Handle runtime_emit tool calls.
 */
export const handleRuntimeEmit = async (
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
    const eventType = params.event_type as string | undefined;

    if (!eventType) {
      return toError(
        'Missing required field: event_type.',
        ctx.version, uptimeMs, Date.now() - start
      );
    }

    const payload = (params.payload as Record<string, unknown> | undefined) ?? {};
    const correlationId = params.correlation_id as string | undefined;

    // Block privileged system:* events — these must only originate from internal sources (FIND-009)
    if (eventType.startsWith('system:')) {
      return toError(
        `Emitting system:* events via MCP tool is not permitted. Event type '${eventType}' is reserved for internal use.`,
        ctx.version, uptimeMs, Date.now() - start
      );
    }

    // Validate event_type prefix — custom types are accepted but unknown prefixes are flagged.
    // Sanitize before logging to guard against log injection: truncate to 100 chars and
    // strip ASCII control characters (0x00-0x1F, 0x7F) that could corrupt log output.
    const safeEventType = eventType.slice(0, 100).replace(/[\x00-\x1F\x7F]/g, '');
    const knownPrefixes = ['session:', 'hook:', 'workflow:', 'wrfc:', 'fix:', 'agent:', 'trigger:', 'file:', 'build:', 'test:', 'devserver:', 'engine:'];
    const isKnownPrefix = knownPrefixes.some((p) => eventType.startsWith(p));
    if (!isKnownPrefix) {
      logger.warn('runtime_emit: unknown event type prefix', { event_type: safeEventType });
    }

    const emitted = ctx.getEventBus().emit({
      id: generateEventId(),
      timestamp: timestamp(),
      type: eventType as EventType,
      source: { kind: 'mcp_tool', tool_name: 'runtime_emit' },
      payload: { type: eventType as EventType, data: payload } as EventPayload,
      metadata: correlationId ? { correlation_id: correlationId } : undefined,
    });

    logger.info('runtime_emit: event emitted', { type: eventType, id: emitted.id });
    return toSuccess({ emitted }, ctx.version, uptimeMs, Date.now() - start);
  } catch (err) {
    const message = toErrorMessage(err);
    logger.error('runtime_emit failed', { error: message });
    return toError(message, ctx.version, ctx.getUptime(), Date.now() - start);
  }
};
