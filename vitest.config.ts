/**
 * Root Vitest config for the workspace packages.
 *
 * Vitest 4 removed the standalone `vitest.workspace.ts` file; the multi-project
 * workspace is now declared here via `test.projects`. Each package's own
 * `vitest.config.ts` sets `test.name` (core / intel / analytics / connect), so
 * CI can target one with `vitest run --project <name>` while a bare `vitest run`
 * at the root exercises them all. The v1 engine suites keep their own per-engine
 * invocation until the retire sweep.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*'],
  },
});
