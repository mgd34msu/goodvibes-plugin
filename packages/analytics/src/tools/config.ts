/** `config` — view/update/reload analytics engine settings. */
import type { ToolModule } from './types.js';

export const configTool: ToolModule = {
  name: 'config',
  engineTool: 'analytics_config',
  description:
    'View, update, or reload analytics engine settings. Supports dot-notation keys. Use action="reload" ' +
    'to hot-reload configuration from disk without restarting.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['get', 'set', 'reload'] },
      key: { type: 'string' },
      value: {},
    },
    required: ['action'],
  },
};
