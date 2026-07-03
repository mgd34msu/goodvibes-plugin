#!/usr/bin/env node
/**
 * PostToolUseFailure hook — silent failure bookkeeping.
 *
 * 2.1.0: the conversational "Fix Loop" banner is gone (Mike's direction,
 * 2026-07-02 — nothing may clutter the conversation). This hook now emits
 * NOTHING, ever. Its only job is bookkeeping: count repeated failures per
 * stable (tool, error) signature in `.goodvibes/state/retries.json`, and when
 * the same failure keeps recurring, record it ONCE to
 * `.goodvibes/memory/failures.json` — the goodvibes-memory skill's
 * documented-failures file — so a later session can read what didn't work.
 * Fail-open like every goodvibes hook: any internal error yields a bare
 * `{ continue: true }`.
 *
 * (The v1-ported 3-phase suggestion/research-hint machinery was deleted with
 * the banner — with no conversational surface it was dead weight.)
 */

import {
  runHook,
  createHookResponse,
  statePath,
  ensureDir,
  readJsonSafe,
  writeJsonSafe,
  isTestEnvironment,
} from './lib/common.mjs';

const HOOK_EVENT = 'PostToolUseFailure';

/** Same-signature failures before the failure is documented to memory. */
const DOCUMENT_AFTER_ATTEMPTS = 6;
/** Retry entries older than this are pruned on load. */
const RETRY_MAX_AGE_HOURS = 24;

/** Stable per-(tool,error) signature: normalizes variable parts before hashing. */
function generateErrorSignature(toolName, errorMessage) {
  const normalized = errorMessage
    .replace(/[A-Z]:\\[^\s:]+/gi, '<PATH>')
    .replace(/\/[^\s:]+/g, '<PATH>')
    .replace(/:\d+:\d+/g, ':<LINE>:<COL>')
    .replace(/line \d+/gi, 'line <LINE>')
    .replace(/\d+/g, 'N')
    .replace(/(['"])[^'"]*\1/g, 'STR')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^\s]*/g, '<TIMESTAMP>')
    .replace(/0x[a-f0-9]+/gi, '<ADDR>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
    .toLowerCase();
  return `${toolName}:${Buffer.from(normalized).toString('base64').slice(0, 20)}`;
}

function retriesPath(cwd) {
  return statePath(cwd, 'state', 'retries.json');
}

function loadRetries(cwd) {
  const all = readJsonSafe(retriesPath(cwd), {});
  const cutoff = Date.now() - RETRY_MAX_AGE_HOURS * 60 * 60 * 1000;
  for (const [sig, entry] of Object.entries(all)) {
    if (entry?.lastAttempt && new Date(entry.lastAttempt).getTime() < cutoff) {
      delete all[sig];
    }
  }
  return all;
}

/** Appends to the JSON-array `failures.json` memory file (goodvibes-memory skill's shape). */
function writeFailureToMemory(cwd, failure) {
  try {
    const file = statePath(cwd, 'memory', 'failures.json');
    ensureDir(statePath(cwd, 'memory'));
    const failures = readJsonSafe(file, []);
    failures.push(failure);
    writeJsonSafe(file, failures);
  } catch {
    /* best-effort — a memory write failure must never break the hook */
  }
}

async function handlePostToolUseFailure(input) {
  const cwd = input.cwd || process.cwd();
  const toolName = input.tool_name || 'unknown';
  const errorMessage = typeof input.error === 'string' ? input.error : 'Unknown error';

  const signature = generateErrorSignature(toolName, errorMessage);
  const retries = loadRetries(cwd);
  const entry = retries[signature] ?? { signature, totalAttempts: 0, documented: false };

  entry.totalAttempts += 1;
  entry.lastAttempt = new Date().toISOString();

  if (!entry.documented && entry.totalAttempts >= DOCUMENT_AFTER_ATTEMPTS) {
    entry.documented = true;
    writeFailureToMemory(cwd, {
      date: new Date().toISOString().slice(0, 10),
      tool: toolName,
      approach: `${toolName} failed: ${errorMessage.slice(0, 100)}`,
      reason: `Same failure recurred ${entry.totalAttempts} times within ${RETRY_MAX_AGE_HOURS}h`,
      suggestion: 'Manual intervention required',
    });
  }

  retries[signature] = entry;
  writeJsonSafe(retriesPath(cwd), retries);

  // Silent by contract: no systemMessage, no additionalContext, ever.
  return createHookResponse({ hookEventName: HOOK_EVENT });
}

if (!isTestEnvironment()) {
  await runHook(HOOK_EVENT, handlePostToolUseFailure);
}

export { generateErrorSignature, handlePostToolUseFailure };
