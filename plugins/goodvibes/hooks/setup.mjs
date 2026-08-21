#!/usr/bin/env node
/**
 * Setup hook, fires on `claude init`.
 *
 * Native dependencies install themselves: when any server's probe is missing
 * from the plugin copy, this hook kicks `lib/deps-install.mjs` as a DETACHED
 * background process (stdio ignored, unref'd, init never waits on npm) and
 * says nothing. The installer is single-instance (lock file) and a no-op when
 * everything is already installed, so firing on every init is harmless.
 * SessionStart owns the user-visible line about install progress or failure;
 * /goodvibes:setup is the manual foreground repair path.
 */

import { runHook, createHookResponse, isTestEnvironment } from './lib/common.mjs';
import { SERVER_PROBES, depsSatisfied } from './lib/deps-link.mjs';
import { spawnDetachedInstall } from './lib/deps-install.mjs';

const HOOK_EVENT = 'Setup';

async function handleSetup() {
  const root = process.env.CLAUDE_PLUGIN_ROOT;
  if (root && process.env.GOODVIBES_NO_BG_INSTALL !== '1') {
    const missing = Object.keys(SERVER_PROBES).some((server) => !depsSatisfied(root, server));
    if (missing) spawnDetachedInstall(root);
  }
  return createHookResponse({ hookEventName: HOOK_EVENT });
}

if (!isTestEnvironment()) {
  await runHook(HOOK_EVENT, handleSetup);
}

export { handleSetup };
