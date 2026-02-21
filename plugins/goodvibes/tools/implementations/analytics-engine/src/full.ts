#!/usr/bin/env node
/**
 * Full TUI entry point — backward-compatibility re-export.
 * The canonical entry point is dashboard.ts. This file is kept so that
 * any existing references to dist/full.js or dist/full.mjs continue to work.
 *
 * Built as dist/full.mjs and dist/full.js by build.mjs.
 *
 * Usage:
 *   GOODVIBES_DIR=.goodvibes node dist/full.mjs
 *   GOODVIBES_DIR=.goodvibes node dist/dashboard.mjs
 */
import { main } from './dashboard.js';

// Re-export for any consumers that import main from full
export { main };

// Auto-run if executed directly
main().catch((err: unknown) => {
  console.error('[analytics-full] Fatal:', err);
  process.exit(1);
});
