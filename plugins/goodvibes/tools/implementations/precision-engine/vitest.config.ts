import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/handlers/**/*.ts', 'src/utils/**/*.ts'],
      exclude: ['src/__tests__/**', 'node_modules/**'],
    },
    testTimeout: 30000,
    setupFiles: ['src/__tests__/setup.ts'],
  },
  resolve: {
    alias: {
      '@': './src',
    },
  },
});
