#!/usr/bin/env node
/**
 * PreCompact hook — plan §8 PreCompact row, REBUILD
 * (tribunal 2026-07-02): "Session summary + analytics backup survive as
 * observe-only behavior; the automatic git checkpoint commit is removed —
 * hooks inform, never mutate."
 *
 * Ported from `plugins/goodvibes/hooks/scripts/src/pre-compact/**` (v1,
 * read-only) with `createPreCompactCheckpoint` (which ran `git commit` on the
 * user's behalf) deleted outright — that's a mutation a hook must never make
 * unattended, matching the "zero block/rewrite/steer" invariant plan §11
 * holds every v2 hook to. What's left is genuinely observe-only: write a
 * markdown summary of files touched this session (read from the shared
 * `.goodvibes/v2/state/agent-tracking.json`-adjacent transcript, best-effort)
 * to `.goodvibes/v2/state/last-session-summary.md` so context surviving
 * compaction is easy to find, and back up nothing beyond that.
 */

import { existsSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { promises as fsp } from 'node:fs';
import { runHook, createHookResponse, v2StatePath, ensureDir, writeJsonSafe, isTestEnvironment } from './lib/common.mjs';

const HOOK_EVENT = 'PreCompact';
const MAX_TRANSCRIPT_BYTES = 2_000_000; // bounded read — transcripts can be large

/** Best-effort: last assistant text block, used as a short "where we left off" note. */
function lastAssistantSummary(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) return '';
  let content;
  try {
    const stat = statSync(transcriptPath);
    const start = Math.max(0, stat.size - MAX_TRANSCRIPT_BYTES);
    const fd = openSync(transcriptPath, 'r');
    const buf = Buffer.alloc(stat.size - start);
    readSync(fd, buf, 0, buf.length, start);
    closeSync(fd);
    content = buf.toString('utf-8');
  } catch {
    return '';
  }
  const lines = content.split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry = JSON.parse(lines[i]);
      const blocks = entry?.message?.content;
      if (Array.isArray(blocks)) {
        const text = blocks.find((b) => b?.type === 'text')?.text;
        if (typeof text === 'string' && text.trim()) return text.trim().slice(0, 800);
      }
    } catch {
      /* skip malformed line */
    }
  }
  return '';
}

async function handlePreCompact(input) {
  const cwd = input.cwd || process.cwd();
  const stateDir = v2StatePath(cwd, 'state');
  ensureDir(stateDir);

  const summary = lastAssistantSummary(input.transcript_path);
  const timestamp = new Date().toISOString();

  const content = [
    '# Session Summary',
    '',
    `Generated: ${timestamp}`,
    '',
    '## Context Before Compaction',
    '',
    summary || '(no transcript context available)',
    '',
    '---',
    '*Observe-only: goodvibes does not commit or otherwise modify the working tree.*',
  ].join('\n');

  try {
    await fsp.writeFile(v2StatePath(cwd, 'state', 'last-session-summary.md'), content, 'utf-8');
  } catch {
    /* best-effort */
  }

  writeJsonSafe(v2StatePath(cwd, 'cache', 'pre-compact-backup.json'), {
    session_id: input.session_id || 'unknown',
    compacted_at: timestamp,
  });

  return createHookResponse({ hookEventName: HOOK_EVENT });
}

if (!isTestEnvironment()) {
  await runHook(HOOK_EVENT, handlePreCompact);
}

export { handlePreCompact, lastAssistantSummary };
