#!/usr/bin/env node
/**
 * SessionEnd hook (goodvibes-analytics) — plan §8 SessionEnd row, KEEP (slim).
 *
 * v1 (`plugins/goodvibes/hooks/scripts/src/session-end/index.ts`, read-only)
 * mixed session-summary writing with tmux dashboard-pane teardown and a
 * runtime-engine (automation) IPC call. Automation is cut for v2.0-alpha
 * (plan §11) and the dashboard TUI's own state lives with lane 6's engine
 * port, not this hook. What's left, and what plan §8 asks this hook to keep,
 * is genuinely slim: flush a session-close marker and prune old ones. Nothing
 * else — no context injection, no cleanup outside `.goodvibes/v2/`.
 */

import { readdirSync, statSync, unlinkSync } from 'node:fs';
import * as path from 'node:path';
import { runHook, createHookResponse, v2StatePath, writeJsonSafe, isTestEnvironment } from './lib/common.mjs';

const HOOK_EVENT = 'SessionEnd';
const CACHE_PRUNE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Best-effort removal of session-* cache files older than CACHE_PRUNE_AGE_MS. */
function pruneOldSessionFiles(cacheDir) {
  let entries;
  try {
    entries = readdirSync(cacheDir);
  } catch {
    return;
  }
  const cutoff = Date.now() - CACHE_PRUNE_AGE_MS;
  for (const name of entries) {
    if (!name.startsWith('session-') || !name.endsWith('.json')) continue;
    const full = path.join(cacheDir, name);
    try {
      if (statSync(full).mtimeMs < cutoff) unlinkSync(full);
    } catch {
      /* best-effort */
    }
  }
}

async function handleSessionEnd(input) {
  const cwd = input.cwd || process.cwd();
  const sessionId = input.session_id || 'unknown';
  const cacheDir = v2StatePath(cwd, 'cache');

  writeJsonSafe(path.join(cacheDir, `session-${sessionId}.json`), {
    session_id: sessionId,
    ended_at: new Date().toISOString(),
  });
  pruneOldSessionFiles(cacheDir);

  return createHookResponse({ hookEventName: HOOK_EVENT });
}

if (!isTestEnvironment()) {
  await runHook(HOOK_EVENT, handleSessionEnd);
}

export { handleSessionEnd, pruneOldSessionFiles };
