#!/usr/bin/env node
/**
 * deps-install — install the servers' native dependencies into the durable home.
 *
 * For each server (intel, analytics, connect) whose representative probe is
 * missing from the plugin copy: create `~/.claude/.goodvibes/deps/<server>/`,
 * copy the server's package.json there, run
 * `npm install --omit=dev --no-audit --no-fund --prefix <durable>`, then link
 * the plugin copy's node_modules to the durable install (see deps-link.mjs).
 *
 * Never prompts; safe to run repeatedly (installed servers are skipped). A
 * lock file `~/.claude/.goodvibes/deps/.install.lock` keeps concurrent runs
 * single-instance (a lock older than 10 minutes is treated as stale and
 * ignored). Progress appends to `~/.claude/.goodvibes/deps/install.log`;
 * the outcome lands in `~/.claude/.goodvibes/deps/.last-result.json` as
 * `{ ok, failed: [servers], finished_at }` for the SessionStart hook to read.
 *
 * Dependency-free plain .mjs. CLI:
 *   node deps-install.mjs <pluginRoot>
 *
 * The SessionStart and Setup hooks spawn this file detached (stdio ignored);
 * /goodvibes:setup runs it in the foreground for visible output.
 */

import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  SERVER_PROBES,
  depsSatisfied,
  durableDepsDir,
  durableDepsRoot,
  hasProbe,
  linkDeps,
} from './deps-link.mjs';

/** Hard cap per server's npm install; the lock refreshes between servers. */
const NPM_TIMEOUT_MS = 5 * 60 * 1000;

/** A lock file older than this is a leftover from a dead run — ignore it. */
const LOCK_STALE_MS = 10 * 60 * 1000;

function lockFile() {
  return path.join(durableDepsRoot(), '.install.lock');
}

function logFile() {
  return path.join(durableDepsRoot(), 'install.log');
}

function resultFile() {
  return path.join(durableDepsRoot(), '.last-result.json');
}

/** Append one timestamped line to the install log; echo to stdout when visible. */
function log(line) {
  const stamped = `${new Date().toISOString()} ${line}`;
  try {
    appendFileSync(logFile(), `${stamped}\n`);
  } catch {
    /* logging must never break the install */
  }
  try {
    process.stdout.write(`${stamped}\n`);
  } catch {
    /* stdout is 'ignore' when spawned detached */
  }
}

/**
 * Take the single-instance lock with an exclusive create ('wx'), so two
 * installers racing at the same moment can never both acquire it. Returns:
 *   'acquired' — this process owns the lock;
 *   'held'     — a live run owns a fresh lock;
 *   'error'    — the lock file cannot be created at all (e.g. unwritable dir).
 */
function acquireLock() {
  const file = lockFile();
  const payload = JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      writeFileSync(file, payload, { flag: 'wx' });
      return 'acquired';
    } catch (err) {
      if (err?.code !== 'EEXIST') return 'error';
      let stat;
      try {
        stat = statSync(file, { throwIfNoEntry: false });
      } catch {
        return 'error';
      }
      if (stat && Date.now() - stat.mtimeMs < LOCK_STALE_MS) return 'held';
      // Stale leftover from a dead run: remove it and retry the exclusive
      // create once. A racing process may win that retry, in which case the
      // second attempt sees a fresh lock and reports 'held'.
      try {
        rmSync(file, { force: true });
      } catch {
        return 'error';
      }
    }
  }
  return 'held';
}

/** Refresh the lock's mtime so a long multi-server run is not read as stale. */
function touchLock() {
  try {
    const now = new Date();
    utimesSync(lockFile(), now, now);
  } catch {
    /* best-effort */
  }
}

/**
 * Remove the lock only when this process still owns it. A run whose lock went
 * stale may have had it taken over by a newer installer; deleting that
 * installer's lock here would let yet another run start beside it.
 */
function releaseLock() {
  try {
    const owner = JSON.parse(readFileSync(lockFile(), 'utf-8'));
    if (owner?.pid === process.pid) rmSync(lockFile(), { force: true });
  } catch {
    /* best-effort */
  }
}

/** Run npm install for one durable prefix. Returns { ok, detail }. */
function runNpmInstall(prefix) {
  const args = ['install', '--omit=dev', '--no-audit', '--no-fund', '--prefix', prefix];
  let result;
  if (process.platform === 'win32') {
    // npm is a .cmd shim on Windows and must go through the shell; quote
    // arguments so a prefix path with spaces survives the join.
    const quoted = args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ');
    result = spawnSync(`npm ${quoted}`, { shell: true, timeout: NPM_TIMEOUT_MS, encoding: 'utf-8' });
  } else {
    result = spawnSync('npm', args, { timeout: NPM_TIMEOUT_MS, encoding: 'utf-8' });
  }
  if (result.error) {
    const timedOut = result.error.code === 'ETIMEDOUT';
    return { ok: false, detail: timedOut ? `npm install timed out after ${NPM_TIMEOUT_MS}ms` : String(result.error.message ?? result.error) };
  }
  if (result.status !== 0) {
    const tail = (result.stderr ?? '').trim().split('\n').slice(-5).join('\n');
    return { ok: false, detail: `npm install exited ${result.status}${tail ? `\n${tail}` : ''}` };
  }
  return { ok: true, detail: 'installed' };
}

/**
 * Install every missing server's deps into the durable home and link the
 * plugin copy to it. Returns { ok, failed, skipped } — `failed` is the list of
 * servers whose deps are still missing afterwards.
 */
export function installMissingDeps(pluginRoot) {
  const failed = [];
  const skipped = [];
  for (const server of Object.keys(SERVER_PROBES)) {
    if (depsSatisfied(pluginRoot, server)) {
      skipped.push(server);
      continue;
    }
    touchLock();
    const durable = durableDepsDir(server);
    log(`${server}: installing native deps into ${durable}`);
    try {
      mkdirSync(durable, { recursive: true });
      copyFileSync(
        path.join(pluginRoot, 'server', server, 'package.json'),
        path.join(durable, 'package.json'),
      );
      const npm = runNpmInstall(durable);
      if (!npm.ok) {
        log(`${server}: FAILED - ${npm.detail}`);
        failed.push(server);
        continue;
      }
      if (!hasProbe(path.join(durable, 'node_modules'), server)) {
        log(`${server}: FAILED - npm install finished but ${SERVER_PROBES[server]} is missing`);
        failed.push(server);
        continue;
      }
      const how = linkDeps(pluginRoot, server);
      if (!depsSatisfied(pluginRoot, server)) {
        log(`${server}: FAILED - linked (${how}) but the plugin copy still cannot resolve deps`);
        failed.push(server);
        continue;
      }
      log(`${server}: installed and linked (${how})`);
    } catch (err) {
      log(`${server}: FAILED - ${err?.message ?? err}`);
      failed.push(server);
    }
  }
  return { ok: failed.length === 0, failed, skipped };
}

/**
 * Kick this installer as a detached background process (stdio ignored, no
 * waiting). Used by the SessionStart and Setup hooks, which must never block
 * on npm. Best-effort: returns true when the spawn call succeeded.
 */
export function spawnDetachedInstall(pluginRoot) {
  try {
    const self = fileURLToPath(import.meta.url);
    const child = spawn(process.execPath, [self, pluginRoot], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

/**
 * Record the run's outcome to `.last-result.json` for the SessionStart hook.
 * Called on every exit path, including failures before any install starts —
 * without a record, SessionStart sees missing deps with no recent failure and
 * re-spawns this installer every session. Never throws; when the durable root
 * itself is unwritable there is nowhere to record the failure.
 */
function writeResult(ok, failed) {
  try {
    mkdirSync(durableDepsRoot(), { recursive: true });
    writeFileSync(
      resultFile(),
      JSON.stringify({ ok, failed, finished_at: new Date().toISOString() }, null, 2),
    );
  } catch {
    /* best-effort */
  }
}

function main() {
  const pluginRoot = process.argv[2];
  if (!pluginRoot || !existsSync(path.join(pluginRoot, 'server'))) {
    process.stderr.write('usage: node deps-install.mjs <pluginRoot>\n');
    writeResult(false, Object.keys(SERVER_PROBES));
    process.exit(2);
  }
  try {
    mkdirSync(durableDepsRoot(), { recursive: true });
  } catch (err) {
    log(`FAILED - cannot create ${durableDepsRoot()}: ${err?.message ?? err}`);
    writeResult(false, Object.keys(SERVER_PROBES));
    process.exit(1);
  }
  const lock = acquireLock();
  if (lock === 'held') {
    log('another install is already running (lock is fresh) - exiting');
    process.exit(0);
  }
  if (lock === 'error') {
    log(`FAILED - cannot create the lock file ${lockFile()}`);
    writeResult(false, Object.keys(SERVER_PROBES));
    process.exit(1);
  }
  let outcome = { ok: false, failed: Object.keys(SERVER_PROBES), skipped: [] };
  try {
    outcome = installMissingDeps(pluginRoot);
  } finally {
    writeResult(outcome.ok, outcome.failed);
    releaseLock();
  }
  if (outcome.ok) {
    log(`done - all servers ready (${outcome.skipped.length} already installed)`);
    process.exit(0);
  }
  log(`done - install failed for: ${outcome.failed.join(', ')}`);
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
