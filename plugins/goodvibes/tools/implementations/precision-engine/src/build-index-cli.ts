/**
 * CLI entry point for the project indexer.
 * Usage: node dist/build-index.cjs [projectDir]
 *
 * All output goes to stderr — stdout is reserved for JSON consumed by hooks.
 */
import { buildProjectIndex } from './state/project-indexer.js';

const projectDir = process.argv[2] ?? process.cwd();

const logger = {
  debug: (msg: string) => process.stderr.write(`[build-index] ${msg}\n`),
  error: (msg: string) => process.stderr.write(`[build-index] ERROR: ${msg}\n`),
};

buildProjectIndex(projectDir, logger)
  .then(() => {
    process.stderr.write(`[build-index] Done.\n`);
    process.exit(0);
  })
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[build-index] Failed: ${message}\n`);
    process.exit(1);
  });
