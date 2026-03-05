/**
 * Handler for the runtime_workflow MCP tool.
 *
 * Actions: create, get, list, advance, cancel, history
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { createLogger } from '../../../shared/logger.js';
import { assertOptionalString, generateEventId, timestamp, toErrorMessage } from '../../../shared/utils.js';
import type { EventType, EventSource, EventPayload } from '../../../shared/events.js';
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
    const action = assertOptionalString(params.action, 'action');

    if (!action) {
      return toError(
        "Missing required field: action. Use 'create', 'get', 'list', 'advance', 'cancel', or 'history'.",
        ctx.version, uptimeMs, Date.now() - start
      );
    }

    if (action === 'create') {
      const workflowType = assertOptionalString(params.workflow_type, 'workflow_type');
      if (!workflowType) {
        return toError('Missing required field: workflow_type', ctx.version, uptimeMs, Date.now() - start);
      }
      const definitionId = workflowType === 'wrfc_loop' ? 'wrfc_loop'
        : workflowType === 'fix_loop' ? 'fix_loop'
        : workflowType;
      const context = (params.context as Record<string, unknown> | undefined) ?? {};

      if (ctx.transport) {
        const result = await ctx.transport.startWorkflow(definitionId, context);
        logger.info('runtime_workflow: created', { id: result.workflow_id, definition: definitionId });
        return toSuccess({ instance: { id: result.workflow_id, definition_id: definitionId, context } }, ctx.version, uptimeMs, Date.now() - start);
      }
      const engine = ctx.getWorkflowEngine();
      if (!engine) {
        return toError('Workflow engine is disabled (set features.workflows_enabled = true to enable)', ctx.version, uptimeMs, Date.now() - start);
      }
      const instance = engine.create(definitionId, context);
      logger.info('runtime_workflow: created', { id: instance.id, definition: definitionId });
      return toSuccess({ instance }, ctx.version, uptimeMs, Date.now() - start);
    }

    if (action === 'get') {
      const workflowId = assertOptionalString(params.workflow_id, 'workflow_id');
      if (!workflowId) {
        return toError('Missing required field: workflow_id', ctx.version, uptimeMs, Date.now() - start);
      }
      if (ctx.transport) {
        const instance = await ctx.transport.getWorkflow(workflowId);
        return toSuccess({ instance }, ctx.version, uptimeMs, Date.now() - start);
      }
      const engine = ctx.getWorkflowEngine();
      if (!engine) {
        return toSuccess({ instance: null }, ctx.version, uptimeMs, Date.now() - start);
      }
      const instance = engine.get(workflowId);
      return toSuccess({ instance: instance ?? null }, ctx.version, uptimeMs, Date.now() - start);
    }

    if (action === 'list') {
      const filter = params.filter as Record<string, unknown> | undefined;
      const statusFilter = assertOptionalString(filter?.status, 'filter.status');

      if (ctx.transport) {
        let instances = await ctx.transport.listWorkflows();
        if (statusFilter) {
          instances = instances.filter((i) => (i as Record<string, unknown>)['status'] === statusFilter);
        }
        return toSuccess({ instances, count: instances.length }, ctx.version, uptimeMs, Date.now() - start);
      }
      const engine = ctx.getWorkflowEngine();
      if (!engine) {
        return toSuccess({ instances: [], count: 0 }, ctx.version, uptimeMs, Date.now() - start);
      }
      const instances = statusFilter
        ? engine.listAll().filter((i) => i.status === statusFilter)
        : engine.listActive();
      return toSuccess({ instances, count: instances.length }, ctx.version, uptimeMs, Date.now() - start);
    }

    if (action === 'advance') {
      const workflowId = assertOptionalString(params.workflow_id, 'workflow_id');
      const event = assertOptionalString(params.event, 'event');
      if (!workflowId) {
        return toError('Missing required field: workflow_id', ctx.version, uptimeMs, Date.now() - start);
      }
      if (!event) {
        return toError('Missing required field: event', ctx.version, uptimeMs, Date.now() - start);
      }
      const context = (params.context as Record<string, unknown> | undefined) ?? {};

      if (ctx.transport) {
        const transition = await ctx.transport.transitionWorkflow(workflowId, event, context);
        const instance = await ctx.transport.getWorkflow(workflowId);
        return toSuccess({ transition, instance: instance ?? null }, ctx.version, uptimeMs, Date.now() - start);
      }
      const engine = ctx.getWorkflowEngine();
      if (!engine) {
        return toError('Workflow engine is disabled', ctx.version, uptimeMs, Date.now() - start);
      }
      const transition = await engine.sendEvent(workflowId, {
        id: generateEventId(),
        timestamp: timestamp(),
        type: event as EventType,
        source: { kind: 'mcp_tool', tool_name: 'runtime_workflow' } as EventSource,
        payload: { type: event as EventType, data: context } as EventPayload,
        priority: 0,
        metadata: { session_id: '', sequence: 0, version: 1 as const },
      });
      const instance = engine.get(workflowId);
      return toSuccess({ transition, instance: instance ?? null }, ctx.version, uptimeMs, Date.now() - start);
    }

    if (action === 'cancel') {
      const cancelWorkflowId = assertOptionalString(params.workflow_id, 'workflow_id');
      if (!cancelWorkflowId) {
        return toError('Missing required field: workflow_id', ctx.version, uptimeMs, Date.now() - start);
      }
      const reason = assertOptionalString(params.reason, 'reason') ?? 'cancelled via MCP';
      if (ctx.transport) {
        await ctx.transport.cancelWorkflow(cancelWorkflowId, reason);
        const cancelledInstance = await ctx.transport.getWorkflow(cancelWorkflowId);
        return toSuccess({ cancelled: true, instance: cancelledInstance ?? null }, ctx.version, uptimeMs, Date.now() - start);
      }
      const cancelEngine = ctx.getWorkflowEngine();
      if (!cancelEngine) {
        return toError('Workflow engine is disabled', ctx.version, uptimeMs, Date.now() - start);
      }
      cancelEngine.cancel(cancelWorkflowId, reason);
      const cancelledInstance = cancelEngine.get(cancelWorkflowId);
      return toSuccess({ cancelled: true, instance: cancelledInstance ?? null }, ctx.version, uptimeMs, Date.now() - start);
    }

    if (action === 'history') {
      const historyWorkflowId = assertOptionalString(params.workflow_id, 'workflow_id');
      if (!historyWorkflowId) {
        return toError('Missing required field: workflow_id', ctx.version, uptimeMs, Date.now() - start);
      }
      if (ctx.transport) {
        const historyInstance = await ctx.transport.getWorkflow(historyWorkflowId);
        if (!historyInstance) {
          return toError(`Workflow not found: ${historyWorkflowId}`, ctx.version, uptimeMs, Date.now() - start);
        }
        const history = (historyInstance['history'] as unknown[]) ?? [];
        return toSuccess({ history, count: history.length }, ctx.version, uptimeMs, Date.now() - start);
      }
      const historyEngine = ctx.getWorkflowEngine();
      if (!historyEngine) {
        return toSuccess({ history: [], count: 0 }, ctx.version, uptimeMs, Date.now() - start);
      }
      const historyInstance = historyEngine.get(historyWorkflowId);
      if (!historyInstance) {
        return toError(`Workflow not found: ${historyWorkflowId}`, ctx.version, uptimeMs, Date.now() - start);
      }
      return toSuccess({ history: historyInstance.history, count: historyInstance.history.length }, ctx.version, uptimeMs, Date.now() - start);
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
