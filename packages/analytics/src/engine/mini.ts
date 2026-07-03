#!/usr/bin/env node
/**
 * Entry point for the mini analytics dashboard (the always-on 4-line tmux pane).
 * Launched by the `dashboard` tool:
 *   tmux split-window -v -l 4 "GOODVIBES_DIR=… node …/server/mini.cjs"
 *
 * Reads GOODVIBES_DIR from env (the `dashboard` handler pins it to the
 * `.goodvibes/v2/` root), initialises the Aggregator, and starts the
 * MiniRenderer loop at the configured refresh rate.
 *
 * Field issue 9: the pane installs `@goodvibes/core/proc` so it exits with the
 * process the moment the parent Claude session dies (stdin close OR reparent),
 * instead of spinning its render/watcher loops forever as an orphan. The draw
 * loop notes activity on every frame so the idle-exit watchdog never kills a
 * pane that is actively rendering.
 */

import { resolve } from 'node:path';
import { installProcessHygiene } from '@goodvibes/core/proc';
import { Aggregator } from './daemon/aggregator.js';
import { MiniRenderer } from './tui/mini/renderer.js';
import { loadConfig } from './config.js';
import { initializeGlobalDb } from './data/db-init.js';

const goodvibesDir = resolve(process.env['GOODVIBES_DIR'] ?? '.goodvibes');

async function main(): Promise<void> {
  const config = loadConfig(goodvibesDir);
  const aggregator = new Aggregator(goodvibesDir, config);
  const globalDb = await initializeGlobalDb();
  aggregator.setGlobalDb(globalDb);
  await aggregator.initialize();

  const renderer = new MiniRenderer(config);

  let shuttingDown = false;
  const cleanup = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    renderer.stopLoop();
    await aggregator.shutdown();
  };

  // Parent-liveness watchdog + plain signal death from core/proc. Idle-exit is
  // set far out and refreshed on every frame below, so a live rendering pane
  // An orphaned pane is caught by the ppid poll; there is no idle exit.
  const hygiene = installProcessHygiene({
    onShutdown: cleanup,
  });

  renderer.startLoop(() => {
    hygiene.noteActivity();
    return aggregator.getState();
  }, config.refresh_rate_ms);
}

main().catch((err: unknown) => {
  console.error('[analytics-mini] Fatal:', err);
  process.exit(1);
});
