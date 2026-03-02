/**
 * Handler for the runtime_triggers MCP tool.
 *
 * Actions: list, get, create, update, delete, enable, disable, test
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { createLogger } from '../../../shared/logger.js';
import { assertOptionalString, generateEventId, timestamp, toErrorMessage } from '../../../shared/utils.js';
import type { EventType, EventSource, EventPayload } from '../../../shared/events.js';
import type { TriggerDefinition } from '../../../extensions/triggers/types.js';
import type { HandlerContext } from './types.js';
import { toSuccess, toError } from './shared.js';

const logger = createLogger('tool-handlers:triggers');

// ─── Trigger definition validation ──────────────────────────────────────────

/** Valid action type values for trigger definitions. */
export const VALID_TRIGGER_ACTION_TYPES: ReadonlySet<string> = new Set([
  'emit_event',
  'spawn_agent',
  'invoke_handler',
  'start_workflow',
  'send_workflow_event',
  'parallel',
  'sequence',
]);

/**
 * Validates an incoming trigger definition before registration.
 * Returns null on success or an error message string on failure.
 *
 * @param def - The raw trigger definition value to validate (untyped input).
 * @returns `null` if the definition is valid; a human-readable error string otherwise.
 */
export function validateTriggerDefinition(def: unknown): string | null {
  if (def === null || def === undefined || typeof def !== 'object') {
    return 'Trigger definition must be an object.';
  }
  const d = def as Record<string, unknown>;

  if (typeof d['id'] !== 'string' || d['id'].trim() === '') {
    return "Trigger definition must have a non-empty string field 'id'.";
  }
  if (typeof d['name'] !== 'string' || d['name'].trim() === '') {
    return "Trigger definition must have a non-empty string field 'name'.";
  }

  const condition = d['condition'];
  if (condition === null || condition === undefined || typeof condition !== 'object') {
    return "Trigger definition must have a 'condition' object.";
  }
  const cond = condition as Record<string, unknown>;
  if (typeof cond['type'] !== 'string') {
    return "Trigger 'condition' must have a string 'type' field.";
  }

  const action = d['action'];
  if (action === null || action === undefined || typeof action !== 'object') {
    return "Trigger definition must have an 'action' object.";
  }
  const act = action as Record<string, unknown>;
  if (typeof act['type'] !== 'string') {
    return "Trigger 'action' must have a string 'type' field.";
  }
  if (!VALID_TRIGGER_ACTION_TYPES.has(act['type'] as string)) {
    return `Trigger 'action.type' must be one of: ${[...VALID_TRIGGER_ACTION_TYPES].join(', ')}. Got: '${act['type']}'.`;
  }

  return null;
}

// ─── runtime_triggers handler ─────────────────────────────────────────────────

/**
 * Handle runtime_triggers tool calls.
 */
export const handleRuntimeTriggers = async (
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
        "Missing required field: action. Use 'list', 'get', 'create', 'update', 'delete', 'enable', 'disable', or 'test'.",
        ctx.version, uptimeMs, Date.now() - start
      );
    }

    const registry = ctx.getTriggerRegistry();

    if (action === 'list') {
      const triggers = registry ? registry.list() : [];
      return toSuccess({ triggers, count: triggers.length }, ctx.version, uptimeMs, Date.now() - start);
    }

    if (action === 'get') {
      const triggerId = assertOptionalString(params.trigger_id, 'trigger_id');
      if (!triggerId) {
        return toError('Missing required field: trigger_id', ctx.version, uptimeMs, Date.now() - start);
      }
      const trigger = registry?.get(triggerId) ?? null;
      return toSuccess({ trigger }, ctx.version, uptimeMs, Date.now() - start);
    }

    if (action === 'create') {
      if (!registry) {
        return toError('Trigger registry is unavailable', ctx.version, uptimeMs, Date.now() - start);
      }
      const triggerDef = params.trigger as TriggerDefinition | undefined;
      if (!triggerDef) {
        return toError('Missing required field: trigger', ctx.version, uptimeMs, Date.now() - start);
      }
      const validationError = validateTriggerDefinition(triggerDef);
      if (validationError !== null) {
        return toError(validationError, ctx.version, uptimeMs, Date.now() - start);
      }
      registry.register(triggerDef);
      logger.info('runtime_triggers: registered', { id: triggerDef.id });
      return toSuccess({ registered: true, id: triggerDef.id }, ctx.version, uptimeMs, Date.now() - start);
    }

    if (action === 'update') {
      if (!registry) {
        return toError('Trigger registry is unavailable', ctx.version, uptimeMs, Date.now() - start);
      }
      const triggerDef = params.trigger as TriggerDefinition | undefined;
      if (!triggerDef) {
        return toError('Missing required field: trigger', ctx.version, uptimeMs, Date.now() - start);
      }
      const validationError = validateTriggerDefinition(triggerDef);
      if (validationError !== null) {
        return toError(validationError, ctx.version, uptimeMs, Date.now() - start);
      }
      registry.replace(triggerDef);
      logger.info('runtime_triggers: updated', { id: triggerDef.id });
      return toSuccess({ updated: true, id: triggerDef.id }, ctx.version, uptimeMs, Date.now() - start);
    }

    if (action === 'delete') {
      if (!registry) {
        return toError('Trigger registry is unavailable', ctx.version, uptimeMs, Date.now() - start);
      }
      const triggerId = assertOptionalString(params.trigger_id, 'trigger_id');
      if (!triggerId) {
        return toError('Missing required field: trigger_id', ctx.version, uptimeMs, Date.now() - start);
      }
      registry.unregister(triggerId);
      logger.info('runtime_triggers: unregistered', { id: triggerId });
      return toSuccess({ deleted: true, id: triggerId }, ctx.version, uptimeMs, Date.now() - start);
    }

    if (action === 'enable' || action === 'disable') {
      if (!registry) {
        return toError('Trigger registry is unavailable', ctx.version, uptimeMs, Date.now() - start);
      }
      const triggerId = assertOptionalString(params.trigger_id, 'trigger_id');
      if (!triggerId) {
        return toError('Missing required field: trigger_id', ctx.version, uptimeMs, Date.now() - start);
      }
      const enabled = action === 'enable';
      registry.setEnabled(triggerId, enabled);
      logger.info(`runtime_triggers: ${action}d`, { id: triggerId });
      return toSuccess({ [action + 'd']: true, id: triggerId }, ctx.version, uptimeMs, Date.now() - start);
    }

    if (action === 'test') {
      if (!registry) {
        return toError('Trigger registry is unavailable', ctx.version, uptimeMs, Date.now() - start);
      }
      const triggerId = assertOptionalString(params.trigger_id, 'trigger_id');
      const testEvent = params.test_event as Record<string, unknown> | undefined;
      if (!triggerId) {
        return toError('Missing required field: trigger_id', ctx.version, uptimeMs, Date.now() - start);
      }
      if (!testEvent) {
        return toError('Missing required field: test_event', ctx.version, uptimeMs, Date.now() - start);
      }
      const mockEvent = {
        id: generateEventId(),
        timestamp: timestamp(),
        type: (testEvent.type as EventType) ?? 'test:mock' as EventType,
        source: (testEvent.source as EventSource) ?? { kind: 'mcp_tool', tool_name: 'runtime_triggers' } as EventSource,
        payload: (testEvent.payload as EventPayload) ?? { type: 'test:mock' as EventType, data: {} } as EventPayload,
        metadata: { session_id: '', sequence: 0, version: 1 as const },
      };
      const results = await registry.evaluate(mockEvent);
      const result = results.find((r) => r.trigger_id === triggerId);
      return toSuccess({ result: result ?? null, all_results: results }, ctx.version, uptimeMs, Date.now() - start);
    }

    return toError(
      `Unknown action: '${action}'. Use 'list', 'get', 'create', 'update', 'delete', 'enable', 'disable', or 'test'.`,
      ctx.version, uptimeMs, Date.now() - start
    );
  } catch (err) {
    const message = toErrorMessage(err);
    logger.error('runtime_triggers failed', { error: message });
    return toError(message, ctx.version, ctx.getUptime(), Date.now() - start);
  }
};
