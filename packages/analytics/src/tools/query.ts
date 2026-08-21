/** `query`, ad-hoc queries against the current session's analytics data. */
import type { ToolModule } from './types.js';

export const queryTool: ToolModule = {
  name: 'query',
  engineTool: 'analytics_query',
  description:
    'Ad-hoc queries against session data: tokens, cache, commands, agents, files, cost, health, ' +
    'or project metrics. Supports time ranges, grouping, filtering, and cross-project scoping via data_scope. ' +
    "Observability modes (mode=): 'live_cost' prices the live transcript per model (main-loop vs subagents), " +
    "'doctor' reports host load + orphaned busy-loop plugin processes with kill commands, " +
    "'agents' classifies background agents (thinking / executing / wedged).",
  inputSchema: {
    type: 'object',
    properties: {
      scope: {
        type: 'string',
        enum: ['tokens', 'cache', 'commands', 'agents', 'files', 'cost', 'health', 'project', 'all'],
        description: 'The data domain to query within the current session (default: all). Ignored when mode is set.',
      },
      mode: {
        type: 'string',
        enum: ['live_cost', 'doctor', 'agents'],
        description:
          'Observability mode; overrides scope. live_cost = live per-model transcript cost (main vs subagents); ' +
          'doctor = host health + orphan busy-loop detection with kill commands; agents = background-agent liveness.',
      },
      time_range: {
        type: 'string',
        enum: ['session', 'last_5m', 'last_30m', 'last_1h'],
        description: 'Time window to aggregate over (default: session).',
      },
      group_by: { type: 'string', enum: ['tool', 'agent', 'file', 'status'] },
      filters: {
        type: 'object',
        properties: {
          tool: { type: 'string' },
          status: { type: 'string', enum: ['success', 'failed', 'partial'] },
          agent: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
        },
      },
      format: { type: 'string', enum: ['standard', 'minimal', 'verbose'] },
      data_scope: {
        type: 'string',
        enum: ['current_session', 'current_project', 'all_projects', 'tagged'],
        description: 'Which set of sessions to include (default: current_session).',
      },
    },
    required: [],
  },
};
