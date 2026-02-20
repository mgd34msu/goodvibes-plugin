#!/usr/bin/env node
/**
 * Full TUI entry point.
 * Launches the interactive analytics dashboard in a terminal pane.
 * Built as dist/full.mjs, intended to run inside a tmux pane.
 *
 * Usage:
 *   GOODVIBES_DIR=.goodvibes node dist/full.mjs
 */
import React from 'react';
import { render } from 'ink';
import { Aggregator } from './daemon/aggregator.js';
import { App } from './tui/full/app.js';
import { loadConfig } from './config.js';

const goodvibesDir = process.env['GOODVIBES_DIR'] ?? '.goodvibes';

/**
 * Bootstrap the aggregator, perform initial render, then subscribe
 * to state changes for live re-rendering.
 */
async function main(): Promise<void> {
  const config = loadConfig(goodvibesDir);
  const aggregator = new Aggregator(goodvibesDir, config);
  await aggregator.initialize();

  let inkInstance: ReturnType<typeof render> | null = null;

  const shutdown = async (): Promise<void> => {
    if (inkInstance) inkInstance.unmount();
    await aggregator.shutdown();
    process.exit(0);
  };

  /** Re-render the app with the latest aggregated state. */
  const renderApp = (): void => {
    const state = aggregator.getState();
    if (inkInstance) {
      inkInstance.rerender(
        React.createElement(App, { state, onQuit: shutdown }),
      );
    }
  };

  // Initial render
  inkInstance = render(
    React.createElement(App, {
      state: aggregator.getState(),
      onQuit: shutdown,
    }),
  );

  // Subscribe to state changes — re-render on each update
  aggregator.onStateChange(renderApp);

  process.on('SIGINT', () => { shutdown().catch((err) => console.error('[shutdown]', err)); });
  process.on('SIGTERM', () => { shutdown().catch((err) => console.error('[shutdown]', err)); });
}

main().catch((err: unknown) => {
  console.error('[analytics-full] Fatal:', err);
  process.exit(1);
});
