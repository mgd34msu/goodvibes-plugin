/**
 * Handler for the runtime_agents MCP tool.
 *
 * Actions:
 * - status  — coordinator stats (active, completed, budget summary)
 * - list    — list agents with optional filters
 * - get     — get single agent details
 * - spawn   — register a new coordinated agent
 * - cancel  — cancel an agent with a reason
 * - budget  — get detailed budget summary
 * - plan    — get execution plan for a workflow
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { createLogger } from '../../../shared/logger.js';
import { assertOptionalString, assertString, toErrorMessage } from '../../../shared/utils.js';
import type { CoordinatedSpawnOptions } from '../../../extensions/agents/types.js';
import type { HandlerContext } from './types.js';
import { toSuccess, toError } from './shared.js';

const logger = createLogger('tool-handlers:agents');

/**
 * Handle runtime_agents tool calls.
 */
export const handleRuntimeAgents = async (
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
        "Missing required field: action. Use 'status', 'list', 'get', 'spawn', 'cancel', 'budget', or 'plan'.",
        ctx.version, uptimeMs, Date.now() - start
      );
    }

    const coordinator = ctx.getAgentCoordinator() ?? null;

    if (action === 'status') {
      if (!coordinator) {
        return toSuccess(
          { stats: null, message: 'Agent coordinator is disabled (set features.agents_enabled = true)' },
          ctx.version, uptimeMs, Date.now() - start
        );
      }
      const stats = coordinator.getStats();
      const budget = coordinator.getBudgetSummary();
      return toSuccess({ stats, budget }, ctx.version, uptimeMs, Date.now() - start);
    }

    if (action === 'list') {
      if (!coordinator) {
        return toSuccess({ agents: [], count: 0 }, ctx.version, uptimeMs, Date.now() - start);
      }
      const filter = (params.filter as Record<string, unknown> | undefined) ?? {};
      const workflowId = assertOptionalString(params.workflow_id, 'workflow_id') ?? assertOptionalString(filter.workflow_id, 'filter.workflow_id');
      const statusFilter = assertOptionalString(filter.status, 'filter.status');
      const typeFilter = assertOptionalString(filter.type, 'filter.type');

      // Gather agents: if workflow specified, use listByWorkflow; otherwise listActive
      let agents: ReturnType<typeof coordinator.listActive> = workflowId
        ? coordinator.listByWorkflow(workflowId)
        : coordinator.listActive();

      if (statusFilter) {
        agents = agents.filter((a) => a.status === statusFilter);
      }
      if (typeFilter) {
        agents = agents.filter((a) => a.type === typeFilter);
      }
      return toSuccess({ agents, count: agents.length }, ctx.version, uptimeMs, Date.now() - start);
    }

    if (action === 'get') {
      const agentId = assertOptionalString(params.agent_id, 'agent_id');
      if (!agentId) {
        return toError('Missing required field: agent_id', ctx.version, uptimeMs, Date.now() - start);
      }
      if (!coordinator) {
        return toSuccess({ agent: null }, ctx.version, uptimeMs, Date.now() - start);
      }
      const agent = coordinator.getAgent(agentId);
      return toSuccess({ agent: agent ?? null }, ctx.version, uptimeMs, Date.now() - start);
    }

    if (action === 'spawn') {
      if (!coordinator) {
        return toError(
          'Agent coordinator is disabled (set features.agents_enabled = true to enable)',
          ctx.version, uptimeMs, Date.now() - start
        );
      }
      const spawnOpts = params.spawn as Record<string, unknown> | undefined;
      if (!spawnOpts) {
        return toError('Missing required field: spawn', ctx.version, uptimeMs, Date.now() - start);
      }
      if (!spawnOpts.type || !spawnOpts.task) {
        return toError('spawn.type and spawn.task are required', ctx.version, uptimeMs, Date.now() - start);
      }
      const options: CoordinatedSpawnOptions = {
        type: assertString(spawnOpts.type, 'spawn.type'),
        task: assertString(spawnOpts.task, 'spawn.task'),
        budget: spawnOpts.budget as number | undefined,
        priority: spawnOpts.priority as number | undefined,
        depends_on: spawnOpts.depends_on as string[] | undefined,
        workflow_id: assertOptionalString(spawnOpts.workflow_id, 'spawn.workflow_id'),
        wrfc_phase: spawnOpts.wrfc_phase as CoordinatedSpawnOptions['wrfc_phase'],
      };
      const agentId = coordinator.spawn(options);
      const agent = coordinator.getAgent(agentId);
      logger.info('runtime_agents: spawned', { agentId, type: options.type });
      return toSuccess({ agent_id: agentId, agent: agent ?? null }, ctx.version, uptimeMs, Date.now() - start);
    }

    if (action === 'cancel') {
      const agentId = assertOptionalString(params.agent_id, 'agent_id');
      if (!agentId) {
        return toError('Missing required field: agent_id', ctx.version, uptimeMs, Date.now() - start);
      }
      if (!coordinator) {
        return toError('Agent coordinator is disabled', ctx.version, uptimeMs, Date.now() - start);
      }
      const reason = (params.reason as string | undefined) ?? 'cancelled via MCP';
      coordinator.cancel(agentId, reason);
      const agent = coordinator.getAgent(agentId);
      return toSuccess({ cancelled: true, agent: agent ?? null }, ctx.version, uptimeMs, Date.now() - start);
    }

    if (action === 'budget') {
      if (!coordinator) {
        return toSuccess(
          { summary: null, message: 'Agent coordinator is disabled' },
          ctx.version, uptimeMs, Date.now() - start
        );
      }
      const summary = coordinator.getBudgetSummary();
      return toSuccess({ summary }, ctx.version, uptimeMs, Date.now() - start);
    }

    if (action === 'plan') {
      const workflowId = params.workflow_id as string | undefined;
      if (!workflowId) {
        return toError('Missing required field: workflow_id', ctx.version, uptimeMs, Date.now() - start);
      }
      if (!coordinator) {
        return toSuccess({ plan: null }, ctx.version, uptimeMs, Date.now() - start);
      }
      const plan = coordinator.getExecutionPlan(workflowId);
      return toSuccess({ plan }, ctx.version, uptimeMs, Date.now() - start);
    }

    return toError(
      `Unknown action: '${action}'. Use 'status', 'list', 'get', 'spawn', 'cancel', 'budget', or 'plan'.`,
      ctx.version, uptimeMs, Date.now() - start
    );
  } catch (err) {
    const message = toErrorMessage(err);
    logger.error('runtime_agents failed', { error: message });
    return toError(message, ctx.version, ctx.getUptime(), Date.now() - start);
  }
};
