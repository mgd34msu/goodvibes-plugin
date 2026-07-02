import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'analytics',
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    testTimeout: 30000,
  },
});
