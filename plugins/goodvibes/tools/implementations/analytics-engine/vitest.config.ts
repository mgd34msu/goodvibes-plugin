import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/tui/full/**',
        'src/index.ts',
        'src/tui/mini/index.ts',
      ],
    },
  },
  resolve: {
    // Allow vitest to resolve .js imports as .ts during testing
    extensions: ['.ts', '.js'],
  },
});
