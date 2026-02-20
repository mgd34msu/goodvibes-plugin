#!/usr/bin/env node
/**
 * Entry point for the mini analytics dashboard.
 * Launched by: tmux split-window -v -l 4 "node analytics-engine/dist/mini.js"
 *
 * Reads GOODVIBES_DIR from env (default: ".goodvibes"), initialises the
 * Aggregator, and starts the MiniRenderer loop at the configured refresh rate.
 * Handles SIGINT/SIGTERM for graceful shutdown.
 */

import { Aggregator } from './daemon/aggregator.js';
import { MiniRenderer } from './tui/mini/renderer.js';
import { DEFAULT_CONFIG } from './types.js';

const goodvibesDir = process.env['GOODVIBES_DIR'] ?? '.goodvibes';

async function main(): Promise<void> {
  const aggregator = new Aggregator(goodvibesDir, DEFAULT_CONFIG);
  await aggregator.initialize();

  const renderer = new MiniRenderer();
  renderer.startLoop(
    () => aggregator.getState(),
    DEFAULT_CONFIG.refresh_rate_ms,
  );

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    renderer.stopLoop();
    await aggregator.shutdown();
    process.exit(0);
  };

  process.on('SIGINT', () => { shutdown().catch(console.error); });
  process.on('SIGTERM', () => { shutdown().catch(console.error); });
}

main().catch((err: unknown) => {
  console.error('[analytics-mini] Fatal:', err);
  process.exit(1);
});
