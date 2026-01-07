import { vi } from 'vitest';

const loadAnalytics = vi.fn();
const saveAnalytics = vi.fn();
const logToolUsage = vi.fn();

const analytics = {
  session_id: 'test-session',
  skills_recommended: [],
  issues_found: 5,
  validations_run: 2,
};
loadAnalytics.mockResolvedValue(analytics);

const input = {
  hook_name: 'post_tool_use',
  tool_input: {
    errors: [
      { file: 'test.ts', line: 10, message: 'Type error 1' },
      { file: 'test2.ts', line: 20, message: 'Type error 2' },
      { file: 'test3.ts', line: 30, message: 'Type error 3' },
    ],
  },
};

// Simulate the function
const toolInput = input.tool_input;
console.log('toolInput:', toolInput);
console.log('toolInput?.errors:', toolInput?.errors);
console.log(
  'Array.isArray(toolInput.errors):',
  Array.isArray(toolInput.errors)
);
console.log('analytics:', analytics);
console.log(
  'Condition result:',
  !!(toolInput?.errors && Array.isArray(toolInput.errors) && analytics)
);
