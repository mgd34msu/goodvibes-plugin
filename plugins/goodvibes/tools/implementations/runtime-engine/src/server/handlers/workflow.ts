/**
 * Handler for the runtime_workflow MCP tool.
 *
 * Actions: create, get, list, advance, cancel, history
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { createLogger } from '../../shared/logger.js';
import { generateEventId, timestamp, toErrorMessage } from '../../shared/utils.js';
import type { EventType } from '../../events/types.js';
import type { HandlerContext } from './types.js';
import { toSuccess, toError } from './shared.js';

const logger = createLogger('tool-handlers:workflow');

/**
 * Handle runtime_workflow tool calls.
 */
export const handleRuntimeWorkflow = async (
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
    const action = params.action as string | undefined;

    if (!action) {
      return toError(
        "Missing required field: action. Use 'create', 'get', 'list', 'advance', 'cancel', or 'history'.",
        ctx.version, uptimeMs, Date.now() - start
      );
    }

    const engine = ctx.getWorkflowEngine();

    if (action === 'create') {
      if (!engine) {
        return toError('Workflow engine is disabled (set features.workflows_enabled = true to enable)', ctx.version, uptimeMs, Date.now() - start);
      }
      const workflowType = params.workflow_type as string | undefined;
      if (!workflowType) {
        return toError('Missing required field: workflow_type', ctx.version, uptimeMs, Date.now() - start);
      }
      const definitionId = workflowType === 'wrfc_loop' ? 'wrfc_loop'
        : workflowType === 'fix_loop' ? 'fix_loop'
        : workflowType;
      const context = (params.context as Record<string, unknown> | undefined) ?? {};
      const instance = engine.create(definitionId, context);
      logger.info('runtime_workflow: created', { id: instance.id, definition: definitionId });
      return toSuccess({ instance }, ctx.version, uptimeMs, Date.now() - start);
    }

    if (action === 'get') {
      if (!engine) {
        return toSuccess({ instance: null }, ctx.version, uptimeMs, Date.now() - start);
      }
      const workflowId = params.workflow_id as string | undefined;
      if (!workflowId) {
        return toError('Missing required field: workflow_id', ctx.version, uptimeMs, Date.now() - start);
      }
      const instance = engine.get(workflowId);
      return toSuccess({ instance: instance ?? null }, ctx.version, uptimeMs, Date.now() - start);
    }

    if (action === 'list') {
      if (!engine) {
        return toSuccess({ instances: [], count: 0 }, ctx.version, uptimeMs, Date.now() - start);
      }
      const filter = params.filter as Record<string, unknown> | undefined;
      const statusFilter = filter?.status as string | undefined;
      const instances = statusFilter
        ? engine.listAll().filter((i) => i.status === statusFilter)
        : engine.listActive();
      return toSuccess({ instances, count: instances.length }, ctx.version, uptimeMs, Date.now() - start);
    }

    if (action === 'advance') {
      if (!engine) {
        return toError('Workflow engine is disabled', ctx.version, uptimeMs, Date.now() - start);
      }
      const workflowId = params.workflow_id as string | undefined;
      const event = params.event as string | undefined;
      if (!workflowId) {
        return toError('Missing required field: workflow_id', ctx.version, uptimeMs, Date.now() - start);
      }
      if (!event) {
        return toError('Missing required field: event', ctx.version, uptimeMs, Date.now() - start);
      }
      const context = (params.context as Record<string, unknown> | undefined) ?? {};
      const transition = engine.sendEvent(workflowId, {
        id: generateEventId(),
        timestamp: timestamp(),
        type: event as EventType,
        source: { kind: 'mcp_tool', tool_name: 'runtime_workflow' } as import('../../events/types.js').EventSource,
        payload: { type: event as EventType, data: context } as import('../../events/types.js').EventPayload,
      });
      const instance = engine.get(workflowId);
      return toSuccess({ transition, instance: instance ?? null }, ctx.version, uptimeMs, Date.now() - start);
    }

    if (action === 'cancel') {
      if (!engine) {
        return toError('Workflow engine is disabled', ctx.version, uptimeMs, Date.now() - start);
      }
      const workflowId = params.workflow_id as string | undefined;
      if (!workflowId) {
        return toError('Missing required field: workflow_id', ctx.version, uptimeMs, Date.now() - start);
      }
      const reason = (params.reason as string | undefined) ?? 'cancelled via MCP';
      engine.cancel(workflowId, reason);
      const instance = engine.get(workflowId);
      return toSuccess({ cancelled: true, instance: instance ?? null }, ctx.version, uptimeMs, Date.now() - start);
    }

    if (action === 'history') {
      if (!engine) {
        return toSuccess({ history: [], count: 0 }, ctx.version, uptimeMs, Date.now() - start);
      }
      const workflowId = params.workflow_id as string | undefined;
      if (!workflowId) {
        return toError('Missing required field: workflow_id', ctx.version, uptimeMs, Date.now() - start);
      }
      const instance = engine.get(workflowId);
      if (!instance) {
        return toError(`Workflow not found: ${workflowId}`, ctx.version, uptimeMs, Date.now() - start);
      }
      return toSuccess({ history: instance.history, count: instance.history.length }, ctx.version, uptimeMs, Date.now() - start);
    }

    return toError(
      `Unknown action: '${action}'. Use 'create', 'get', 'list', 'advance', 'cancel', or 'history'.`,
      ctx.version, uptimeMs, Date.now() - start
    );
  } catch (err) {
    const message = toErrorMessage(err);
    logger.error('runtime_workflow failed', { error: message });
    return toError(message, ctx.version, ctx.getUptime(), Date.now() - start);
  }
};
