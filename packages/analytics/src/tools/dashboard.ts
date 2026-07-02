/** `dashboard` — launch/stop/status of the tmux analytics panes. */
import type { ToolModule } from './types.js';

export const dashboardTool: ToolModule = {
  name: 'dashboard',
  engineTool: 'analytics_dashboard',
  description:
    'Launch, stop, or check status of the analytics tmux panes. The mini dashboard is an always-on ' +
    '4-line pane showing live session metrics. (The full interactive TUI is deferred in the alpha.) ' +
    'Calling start on a running target toggles it off; stop on a stopped target is a no-op. ' +
    'action="doctor" prints a read-only host-health + agent-liveness report (load, session children, ' +
    'orphaned busy-loop plugin processes with ready-to-run kill commands, background-agent states) ' +
    'without launching a pane and never killing anything.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['start', 'stop', 'status', 'doctor'] },
      target: {
        type: 'string',
        enum: ['mini', 'full', 'dashboard', 'both'],
        description: 'Which pane to operate on (default: both).',
      },
      options: {
        type: 'object',
        properties: {
          pane_position: { type: 'string', enum: ['bottom', 'top', 'left', 'right'] },
          pane_size: { type: ['number', 'string'] },
        },
      },
    },
    required: ['action'],
  },
};
