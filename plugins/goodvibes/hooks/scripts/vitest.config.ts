import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    // Use threads pool for better coverage collection compatibility
    pool: 'threads',
    // Disable file parallelism to ensure accurate coverage merging
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/__tests__/**',
        // Type-only files have no runtime code to cover
        'src/types/memory.ts',
        'src/types/telemetry.ts',
        'src/post-tool-use-failure/recovery-types.ts',
        // Barrel index files that only re-export
        'src/types/index.ts',
        'src/automation/index.ts',
        'src/context/index.ts',
        'src/post-tool-use/index.ts',
        'src/post-tool-use-failure/index.ts',
        'src/pre-compact/index.ts',
        'src/pre-tool-use/index.ts',
        'src/session-start/index.ts',
        'src/shared/index.ts',
        'src/subagent-start/index.ts',
        'src/subagent-stop/index.ts',
        'src/telemetry/index.ts',
      ],
      // Include all source files in coverage even if not imported by tests
      all: true,
      // Report on failure so we can see coverage even when tests fail
      reportOnFailure: true,
      thresholds: {
        lines: 70,
        branches: 60,
        functions: 70,
        statements: 70,
      },
    },
  },
});
