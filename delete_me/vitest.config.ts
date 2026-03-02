import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/circular-a.ts',
        'src/circular-b.ts',
      ],
      thresholds: {
        lines: 40,
        functions: 25,
        branches: 25,
        statements: 40,
      },
    },
  },
});
