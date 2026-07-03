/**
 * Shared helpers for the goodvibes plugin's plain .mjs hooks (§2.4, §7 R8).
 *
 * The single goodvibes plugin ships all lifecycle hooks side by side under
 * hooks/, so they share this one dependency-free helper module (no build step,
 * no import from @goodvibes/core). Hooks that touch project state use
 * `statePath()` (`.goodvibes/...`), mirroring core/config's getStatePath
 * convention — including its one-time migration of the pre-2.1.0
 * `.goodvibes/v2/` layout.
 */

import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  existsSync,
  readdirSync,
  statSync,
  rmSync,
  rmdirSync,
} from 'node:fs';
import * as path from 'node:path';

/** Read and JSON-parse stdin. Never throws — malformed/empty input becomes `{}`. */
export async function readHookInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf-8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Write the hook response JSON to stdout and exit 0. */
export function respond(response) {
  process.stdout.write(JSON.stringify(response ?? { continue: true }));
  process.exit(0);
}

/**
 * Build a hook response with the CORRECT schema: `additionalContext` lives
 * under `hookSpecificOutput`, not at the top level (v1 bug — plan §8
 * SessionStart row; applied consistently across all v2 hooks here too).
 */
export function createHookResponse({ hookEventName, systemMessage, additionalContext } = {}) {
  const out = { continue: true };
  if (systemMessage) out.systemMessage = systemMessage;
  if (additionalContext) {
    out.hookSpecificOutput = { hookEventName, additionalContext };
  }
  return out;
}

/** Roots already checked for a legacy `v2/` subdirectory this process. */
const migratedRoots = new Set();

/** Merge-move `src` into `dst`; on conflict the legacy-`v2` copy wins (live state). */
function mergeMoveDir(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src)) {
    const s = path.join(src, entry);
    const d = path.join(dst, entry);
    try {
      if (!existsSync(d)) {
        renameSync(s, d);
      } else if (statSync(s).isDirectory() && statSync(d).isDirectory()) {
        mergeMoveDir(s, d);
      } else {
        rmSync(d, { recursive: true, force: true });
        renameSync(s, d);
      }
    } catch {
      /* skip the entry — migration is best-effort */
    }
  }
  try {
    rmdirSync(src);
  } catch {
    /* not empty — harmless, retried next process */
  }
}

/** One-time migration of the pre-2.1.0 `.goodvibes/v2/` layout up into `.goodvibes/`. */
function migrateLegacyStateDir(root) {
  if (migratedRoots.has(root)) return;
  migratedRoots.add(root);
  try {
    const legacy = path.join(root, 'v2');
    if (existsSync(legacy) && statSync(legacy).isDirectory()) {
      mergeMoveDir(legacy, root);
    }
  } catch {
    /* fail-open */
  }
}

/** `.goodvibes/<segments>` — mirrors core/config's getStatePath. */
export function statePath(cwd, ...segments) {
  const root = path.join(cwd, '.goodvibes');
  migrateLegacyStateDir(root);
  return path.join(root, ...segments);
}

export function ensureDir(dir) {
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    /* best-effort */
  }
}

export function readJsonSafe(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return fallback;
  }
}

export function writeJsonSafe(file, data) {
  try {
    ensureDir(path.dirname(file));
    writeFileSync(file, JSON.stringify(data, null, 2));
  } catch {
    /* best-effort — a hook must never throw over a state write */
  }
}

/**
 * Atomic JSON write: temp file in the same directory, then rename over the
 * target (rename is atomic on one filesystem). A crash mid-write leaves the
 * previous file intact instead of a half-written one — used for the session
 * cost recap that SessionStart reads. Best-effort: never throws.
 */
export function writeJsonAtomic(file, data) {
  try {
    ensureDir(path.dirname(file));
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2));
    try {
      renameSync(tmp, file);
    } catch (err) {
      try {
        unlinkSync(tmp);
      } catch {
        /* ignore */
      }
      throw err;
    }
  } catch {
    /* best-effort — a hook must never throw over a state write */
  }
}

export function appendJsonlSafe(file, entry) {
  try {
    ensureDir(path.dirname(file));
    writeFileSync(file, JSON.stringify(entry) + '\n', { flag: 'a' });
  } catch {
    /* best-effort */
  }
}

/**
 * Fail-open hook runner: reads stdin, calls `handler(input)`, and always emits
 * SOME valid response — a bug in the handler still yields `{ continue: true }`.
 */
export async function runHook(hookEventName, handler) {
  try {
    const input = await readHookInput();
    const result = await handler(input);
    respond(result ?? createHookResponse({ hookEventName }));
  } catch {
    respond({ continue: true });
  }
}

/** True when running under vitest/node test harnesses (skip auto-invocation). */
export function isTestEnvironment() {
  return (
    process.env.NODE_ENV === 'test' ||
    process.env.VITEST === 'true' ||
    process.env.GOODVIBES_HOOK_TEST === '1'
  );
}
