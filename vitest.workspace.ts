import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'plugins/goodvibes/vitest.config.ts',
  'plugins/goodvibes/hooks/scripts/vitest.config.ts',
  'plugins/goodvibes/tools/implementations/runtime-engine/vitest.config.ts',
  'plugins/goodvibes/tools/implementations/precision-engine/vitest.config.ts',
  'plugins/goodvibes/tools/implementations/analytics-engine/vitest.config.ts',
  'plugins/goodvibes/tools/implementations/registry-engine/vitest.config.ts',
]);
