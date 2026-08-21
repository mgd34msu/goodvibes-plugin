/** `budget`, set/check/clear the session budget (per-model cache-aware cost). */
import type { ToolModule } from './types.js';

export const budgetTool: ToolModule = {
  name: 'budget',
  engineTool: 'analytics_budget',
  description:
    'Set, check, or clear a session budget (in dollars or tokens). Cost is computed from transcript ' +
    'actuals using the per-model, cache-aware pricing table. action="check" reports the amount set, ' +
    'used, remaining, and percent consumed.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['set', 'check', 'clear'] },
      amount: { type: 'number', description: 'Budget limit; required when action is "set".' },
      unit: { type: 'string', enum: ['dollars', 'tokens'] },
      warn_at: {
        type: 'array',
        items: { type: 'number', minimum: 0, maximum: 1 },
        description: 'Warning threshold fractions, e.g. [0.5, 0.8, 1.0].',
      },
    },
    required: ['action'],
  },
};
