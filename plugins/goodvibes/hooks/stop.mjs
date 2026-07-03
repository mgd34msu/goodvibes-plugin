#!/usr/bin/env node
/**
 * Stop hook (goodvibes-analytics) — plan §8 Stop row, KEEP (tribunal 2026-07-02).
 * "Session-close telemetry writer touching only its own cache namespace; no
 * changes needed."
 *
 * v1 (`plugins/goodvibes/hooks/scripts/src/lifecycle/stop.ts`, read-only)
 * derived duration from a global cross-hook `analytics.json` file populated by
 * PreToolUse/other hooks that do not port to v2. Stop can fire many times in a
 * session (once per turn the main loop stops), so v2's version stays
 * intentionally cheap: append one line per stop event to a per-session
 * telemetry log, silently, and prune it occasionally. No systemMessage, no
 * context injection — telemetry-only, matching the "no changes needed"
 * disposition in spirit (silent, own-namespace-only) even though the v1
 * source's specific data model (a global analytics.json) doesn't carry
 * forward under R15 project-state namespacing.
 */

import * as path from 'node:path';
import { readdirSync, statSync, unlinkSync } from 'node:fs';
import { runHook, createHookResponse, v2StatePath, appendJsonlSafe, isTestEnvironment } from './lib/common.mjs';

const HOOK_EVENT = 'Stop';
const TELEMETRY_PRUNE_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function telemetryFile(cwd) {
  const now = new Date();
  const fileName = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-stops.jsonl`;
  return v2StatePath(cwd, 'telemetry', fileName);
}

/** Best-effort removal of stop-telemetry files older than TELEMETRY_PRUNE_AGE_MS. */
function pruneOldTelemetryFiles(telemetryDir) {
  let entries;
  try {
    entries = readdirSync(telemetryDir);
  } catch {
    return;
  }
  const cutoff = Date.now() - TELEMETRY_PRUNE_AGE_MS;
  for (const name of entries) {
    if (!name.endsWith('-stops.jsonl')) continue;
    const full = path.join(telemetryDir, name);
    try {
      if (statSync(full).mtimeMs < cutoff) unlinkSync(full);
    } catch {
      /* best-effort */
    }
  }
}

async function handleStop(input) {
  const cwd = input.cwd || process.cwd();
  appendJsonlSafe(telemetryFile(cwd), {
    event: 'stop',
    session_id: input.session_id || 'unknown',
    at: new Date().toISOString(),
  });
  pruneOldTelemetryFiles(v2StatePath(cwd, 'telemetry'));
  return createHookResponse({ hookEventName: HOOK_EVENT });
}

if (!isTestEnvironment()) {
  await runHook(HOOK_EVENT, handleStop);
}

export { handleStop, telemetryFile, pruneOldTelemetryFiles };
