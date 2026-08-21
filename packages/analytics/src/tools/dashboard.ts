/** `dashboard`, HTML analytics report, host-health doctor, or engine status. */
import type { ToolModule } from './types.js';

export const dashboardTool: ToolModule = {
  name: 'dashboard',
  engineTool: 'analytics_dashboard',
  description:
    'Generate an analytics report or check engine health. action="report" writes a fully ' +
    'self-contained HTML report (session overview, per-model cost, tool usage, agents, files ' +
    'touched, plus historical and cross-project sections when the global DB has data) to ' +
    '.goodvibes/reports/analytics-report.html and returns the path with a short summary. ' +
    'action="doctor" prints a read-only host-health + agent-liveness report (load, session ' +
    'children, orphaned busy-loop plugin processes with ready-to-run kill commands, ' +
    'background-agent states) and never kills anything. action="status" returns brief ' +
    'engine/server status text.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['report', 'doctor', 'status'] },
      scope: {
        type: 'string',
        enum: ['session', 'project', 'all_projects'],
        description:
          'Report scope: session-only, this project with history, or all projects (default).',
      },
    },
    required: ['action'],
  },
};
