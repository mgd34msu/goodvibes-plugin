#!/usr/bin/env node
/**
 * SessionEnd hook — plan §8 SessionEnd row, KEEP (slim).
 *
 * v1 (`plugins/goodvibes/hooks/scripts/src/session-end/index.ts`, read-only)
 * mixed session-summary writing with tmux dashboard-pane teardown and a
 * runtime-engine (automation) IPC call. Automation is cut for v2.0-alpha
 * (plan §11) and the dashboard TUI's own state lives with lane 6's engine
 * port, not this hook. What's left is slim: flush a session-close marker,
 * prune old ones, and write the session cost recap.
 *
 * 2.0.5: after the flush duties, compute a compact recap of the session that
 * just ended (priced from its transcript JSONL, dependency-free) and write it
 * to `.goodvibes/cache/last-session-summary.json`, maintaining a running
 * project total. SessionStart reads that file to surface one value line every
 * session. The recap is fully fail-open — any error skips it, never blocking
 * the marker write or the hook response.
 */

import { readdirSync, statSync, unlinkSync } from 'node:fs';
import * as path from 'node:path';
import { runHook, createHookResponse, statePath, writeJsonSafe, writeJsonAtomic, readJsonSafe, isTestEnvironment } from './lib/common.mjs';
import { computeSessionRecap, round2 } from './lib/session-cost.mjs';

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

/**
 * Compute the just-ended session's cost recap and write it (atomically) to
 * `last-session-summary.json`, adding this session's cost onto the running
 * project total already in that file. Fail-open: any error skips the summary.
 */
function writeSessionRecap(cacheDir, input, cwd, sessionId) {
  try {
    const summaryPath = path.join(cacheDir, 'last-session-summary.json');
    const prev = readJsonSafe(summaryPath, null);
    const prevTotal = prev && typeof prev.project_total_usd === 'number' ? prev.project_total_usd : 0;

    const recap = computeSessionRecap({
      transcriptPath: input.transcript_path || null,
      sessionId,
      cwd,
    });
    recap.ended_at = new Date().toISOString();
    recap.project_total_usd = round2(prevTotal + recap.cost_usd);

    writeJsonAtomic(summaryPath, recap);
  } catch {
    /* fail-open — a missing recap must never break the hook */
  }
}

async function handleSessionEnd(input) {
  const cwd = input.cwd || process.cwd();
  const sessionId = input.session_id || 'unknown';
  const cacheDir = statePath(cwd, 'cache');

  writeJsonSafe(path.join(cacheDir, `session-${sessionId}.json`), {
    session_id: sessionId,
    ended_at: new Date().toISOString(),
  });
  pruneOldSessionFiles(cacheDir);

  writeSessionRecap(cacheDir, input, cwd, sessionId);

  return createHookResponse({ hookEventName: HOOK_EVENT });
}

if (!isTestEnvironment()) {
  await runHook(HOOK_EVENT, handleSessionEnd);
}

export { handleSessionEnd, pruneOldSessionFiles };
