#!/usr/bin/env node
/**
 * SessionStart hook (goodvibes-intel) — plan §8 SessionStart row, EXTRACT.
 *
 * Ported from `plugins/goodvibes/hooks/scripts/src/session-start/**` (v1,
 * read-only), cut down to what's honest to promise from a hook that must
 * answer inside its declared timeout:
 *  - Stack detection (package.json dependency scan) and git status — cheap,
 *    always computed fresh, bounded by FAST_DEADLINE_MS.
 *  - Code-TODO count and a couple of quick health checks — the expensive
 *    parts — are computed by a DETACHED background refresh this hook kicks
 *    off (never awaited) and served from `.goodvibes/v2/cache/session-context.json`
 *    on this and future invocations. This is the fix for the v1 bug where a
 *    slow synchronous gather could exceed the hook's timeout and lose the
 *    whole context injection silently: this hook now always answers inside
 *    FAST_DEADLINE_MS using cache + fresh cheap signals, never blocking on
 *    the expensive scan.
 *  - `hookSpecificOutput.additionalContext` (not top-level `additionalContext`
 *    — the v1 schema bug plan §8 calls out by name).
 *
 * Retired from v1: the CLAUDE.md/prompt-chain writing half (moved to the
 * explicit `/goodvibes-intel:plugin install-prompts` command — plan §8), crash
 * recovery, project file indexing, version/pricing fetch, and the runtime-engine
 * (automation) integration — automation was cut for v2.0-alpha (plan §11).
 */

import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runHook,
  createHookResponse,
  v2StatePath,
  readJsonSafe,
  writeJsonSafe,
  isTestEnvironment,
} from './lib/common.mjs';

const HOOK_EVENT = 'SessionStart';
const FAST_DEADLINE_MS = 4000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h; background refresh keeps it warm every session regardless
const BACKGROUND_DEADLINE_MS = 15000;
const TODO_FILE_CAP = 3000;

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt', '.goodvibes',
  'coverage', '.cache', '.turbo', 'out', 'vendor',
]);
const SOURCE_EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.java', '.rb', '.php', '.c', '.cpp', '.h']);
const TODO_RE = /\b(TODO|FIXME)\b/g;

const FRAMEWORK_MARKERS = [
  ['next', 'Next.js'], ['react', 'React'], ['vue', 'Vue'], ['svelte', 'Svelte'],
  ['@angular/core', 'Angular'], ['vite', 'Vite'], ['typescript', 'TypeScript'],
  ['express', 'Express'], ['fastify', 'Fastify'], ['hono', 'Hono'],
];

function safeExec(cmd, args, cwd) {
  try {
    return execFileSync(cmd, args, { cwd, encoding: 'utf-8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

/** Cheap signals: git branch/status + package.json dependency scan. Always fresh. */
function gatherFast(cwd) {
  const branch = safeExec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  const statusOut = safeExec('git', ['status', '--porcelain'], cwd);
  const uncommittedCount = statusOut ? statusOut.split('\n').filter(Boolean).length : 0;

  let frameworks = [];
  let packageManager = null;
  const pkgPath = path.join(cwd, 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = readJsonSafe(pkgPath, {});
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    frameworks = FRAMEWORK_MARKERS.filter(([dep]) => dep in deps).map(([, name]) => name);
    if (existsSync(path.join(cwd, 'package-lock.json'))) packageManager = 'npm';
    else if (existsSync(path.join(cwd, 'pnpm-lock.yaml'))) packageManager = 'pnpm';
    else if (existsSync(path.join(cwd, 'yarn.lock'))) packageManager = 'yarn';
    else if (existsSync(path.join(cwd, 'bun.lockb'))) packageManager = 'bun';
  }

  return { branch: branch || null, uncommittedCount, frameworks, packageManager };
}

/** Bounded directory walk counting TODO/FIXME occurrences in source files. */
function scanTodosBounded(cwd, deadlineAt, fileCap = TODO_FILE_CAP) {
  let count = 0;
  let filesVisited = 0;
  const stack = [cwd];
  while (stack.length && filesVisited < fileCap && Date.now() < deadlineAt) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (filesVisited >= fileCap || Date.now() >= deadlineAt) break;
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        stack.push(full);
      } else if (entry.isFile()) {
        filesVisited++;
        if (!SOURCE_EXT.has(path.extname(entry.name))) continue;
        try {
          const content = readFileSync(full, 'utf-8');
          const matches = content.match(TODO_RE);
          if (matches) count += matches.length;
        } catch {
          /* unreadable/binary — skip */
        }
      }
    }
  }
  return count;
}

function quickHealth(cwd) {
  const notes = [];
  if (existsSync(path.join(cwd, 'package.json')) && !existsSync(path.join(cwd, 'node_modules'))) {
    notes.push('dependencies not installed (no node_modules)');
  }
  if (existsSync(path.join(cwd, '.env.example')) && !existsSync(path.join(cwd, '.env'))) {
    notes.push('.env missing (.env.example present)');
  }
  return notes;
}

/** Entry point for the detached background-refresh child (`--background-refresh <cwd> <cachePath>`). */
async function runBackgroundRefresh(cwd, cachePath) {
  const deadlineAt = Date.now() + BACKGROUND_DEADLINE_MS;
  const fast = gatherFast(cwd);
  const todoCount = scanTodosBounded(cwd, deadlineAt);
  const healthNotes = quickHealth(cwd);
  writeJsonSafe(cachePath, {
    generatedAt: Date.now(),
    branch: fast.branch,
    frameworks: fast.frameworks,
    todoCount,
    healthNotes,
  });
}

/** Kick off the background refresh, detached, never awaited by the responding hook. */
function scheduleBackgroundRefresh(cwd, cachePath) {
  if (process.env.GOODVIBES_HOOK_NO_BACKGROUND === '1') return;
  try {
    const thisFile = fileURLToPath(import.meta.url);
    const child = spawn(process.execPath, [thisFile, '--background-refresh', cwd, cachePath], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  } catch {
    /* best effort — a failed background kick must never affect this response */
  }
}

async function handleSessionStart(input) {
  const cwd = input.cwd || process.cwd();
  const cachePath = v2StatePath(cwd, 'cache', 'session-context.json');
  const cache = readJsonSafe(cachePath, null);
  const cacheAgeMs = cache?.generatedAt ? Date.now() - cache.generatedAt : Infinity;
  const cacheFresh = Boolean(cache) && cacheAgeMs < CACHE_TTL_MS;

  const fast = await Promise.race([
    Promise.resolve().then(() => gatherFast(cwd)),
    new Promise((resolve) => setTimeout(() => resolve(null), FAST_DEADLINE_MS)),
  ]);
  const fastData = fast ?? { branch: null, uncommittedCount: 0, frameworks: [], packageManager: null };

  scheduleBackgroundRefresh(cwd, cachePath);

  const stackBits = [];
  if (fastData.frameworks.length) stackBits.push(fastData.frameworks.join(', '));
  if (fastData.packageManager) stackBits.push(fastData.packageManager);

  const lines = ['[goodvibes-intel] Session context'];
  if (stackBits.length) lines.push(`Stack: ${stackBits.join(' | ')}`);
  if (fastData.branch) {
    const uncommitted = fastData.uncommittedCount > 0 ? `, ${fastData.uncommittedCount} uncommitted` : '';
    lines.push(`Git: on ${fastData.branch}${uncommitted}`);
  }
  const todoCount = cache?.todoCount ?? null;
  if (todoCount !== null) {
    lines.push(`Code TODOs: ${todoCount}${cacheFresh ? '' : ' (refreshing in background)'}`);
  }
  if (cache?.healthNotes?.length) {
    lines.push(`Health: ${cache.healthNotes.join('; ')}`);
  }
  if (!cache) {
    lines.push('(First session seen for this project — TODO/health data is being gathered in the background for next time.)');
  }

  const summaryBits = [...stackBits];
  if (fastData.branch) summaryBits.push(`on ${fastData.branch}`);
  if (todoCount) summaryBits.push(`${todoCount} TODOs`);
  const systemMessage = `goodvibes-intel ready.${summaryBits.length ? ' ' + summaryBits.join(' | ') : ''}`;

  return createHookResponse({
    hookEventName: HOOK_EVENT,
    systemMessage,
    additionalContext: lines.join('\n'),
  });
}

if (process.argv[2] === '--background-refresh') {
  const [, , , cwd, cachePath] = process.argv;
  runBackgroundRefresh(cwd, cachePath)
    .then(() => process.exit(0))
    .catch(() => process.exit(0));
} else if (!isTestEnvironment()) {
  await runHook(HOOK_EVENT, handleSessionStart);
}

export { gatherFast, scanTodosBounded, quickHealth, handleSessionStart };
