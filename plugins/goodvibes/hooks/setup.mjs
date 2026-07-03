#!/usr/bin/env node
/**
 * Setup hook — plan §8 Setup row, REBUILD (tribunal 2026-07-02).
 *
 * v1's setup hook (`plugins/goodvibes/hooks/scripts/src/setup.ts`, read-only)
 * wrote CLAUDE.md import-chain files to the global home directory silently and
 * re-wrote differing files on every `claude init`. That behavior does not port.
 *
 * v2 behavior — run once, marker-guarded, consent-gated:
 *  - Fires on `claude init`. Writes ONE marker file inside the PROJECT's own
 *    `.goodvibes/` state directory (never the global home directory, never
 *    outside the project) the first time it runs, and does nothing on every
 *    subsequent `claude init` in the same project (marker-guarded / run-once).
 *  - It does not install anything itself. The intel server's native
 *    dependencies (ripgrep, ast-grep) have no postinstall chain by design
 *    (carve-out architecture §1.2) — first-run install requires the user to
 *    explicitly run `/goodvibes:setup`, which is the actual
 *    consent point (a human typed a command), not a hook silently acting on
 *    their behalf. This hook's only job is to point at that command once.
 */

import { existsSync } from 'node:fs';
import { runHook, createHookResponse, statePath, writeJsonSafe, isTestEnvironment } from './lib/common.mjs';

const HOOK_EVENT = 'Setup';

async function handleSetup(input) {
  const cwd = input.cwd || process.cwd();
  const markerPath = statePath(cwd, '.setup-marker.json');

  if (existsSync(markerPath)) {
    // Already run once for this project — stay silent.
    return createHookResponse({ hookEventName: HOOK_EVENT });
  }

  writeJsonSafe(markerPath, {
    ranAt: new Date().toISOString(),
    note: 'goodvibes Setup hook has run once for this project; see /goodvibes:setup for native-dependency install.',
  });

  return createHookResponse({
    hookEventName: HOOK_EVENT,
    systemMessage:
      'goodvibes: first-time setup for this project. Run /goodvibes:setup ' +
      'to install native dependencies (ripgrep, ast-grep) with your explicit consent — nothing ' +
      'is installed automatically.',
  });
}

if (!isTestEnvironment()) {
  await runHook(HOOK_EVENT, handleSetup);
}

export { handleSetup };
