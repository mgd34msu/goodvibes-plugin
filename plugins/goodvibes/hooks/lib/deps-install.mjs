#!/usr/bin/env node
/**
 * deps-install, install the servers' native dependencies into the durable home.
 *
 * For each server (intel, analytics, connect) whose representative probe is
 * missing from the plugin copy: create `~/.claude/.goodvibes/deps/<server>/`,
 * copy the server's package.json AND package-lock.json there, run
 * `npm ci --omit=dev --no-audit --no-fund` in that directory, then link
 * the plugin copy's node_modules to the durable install (see deps-link.mjs).
 *
 * The shipped manifest/lockfile pair is verified before npm runs and the
 * installed tree is verified after it: every dependency version in the server
 * manifest must be exact, the manifest's dependency map must equal the
 * lockfile's root dependency map, and after `npm ci` every dependency's
 * installed package.json must report exactly the pinned version. A user
 * machine that would otherwise silently resolve something newer than the
 * version CI tested fails loudly here instead.
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
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
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

/** A lock file older than this is a leftover from a dead run, ignore it. */
const LOCK_STALE_MS = 10 * 60 * 1000;

/**
 * A dependency version the installer accepts: a bare semver, no range operator.
 * `^1.2.3` would let every user machine resolve a different tree than the one
 * CI built and tested against, which is the whole point of pinning.
 */
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/** Compare two dependency maps by their sorted name/version pairs. */
function sameDependencyMap(left, right) {
  const norm = (m) =>
    JSON.stringify(Object.entries(m ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return norm(left) === norm(right);
}

/**
 * Read and cross-check one server's shipped manifest/lockfile pair.
 * Returns `{ dependencies }` or throws with the reason the pair is unusable.
 */
function readVerifiedSpec(pluginRoot, server) {
  const source = path.join(pluginRoot, 'server', server);
  const manifestFile = path.join(source, 'package.json');
  const lockFilePath = path.join(source, 'package-lock.json');
  if (!existsSync(lockFilePath)) {
    throw new Error(`server/${server}/package-lock.json is missing; the shipped tree is incomplete`);
  }
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf-8'));
  const lock = JSON.parse(readFileSync(lockFilePath, 'utf-8'));
  const dependencies = manifest.dependencies ?? {};

  for (const [name, version] of Object.entries(dependencies)) {
    if (typeof version !== 'string' || !EXACT_VERSION.test(version)) {
      throw new Error(`${name} must be pinned to an exact version, found ${version}`);
    }
  }
  const locked = lock.packages?.['']?.dependencies ?? {};
  if (!sameDependencyMap(dependencies, locked)) {
    throw new Error('package.json and package-lock.json dependencies disagree');
  }
  return { manifestFile, lockFilePath, dependencies };
}

/**
 * After npm finishes: every pinned dependency must be present in the durable
 * install at exactly the pinned version. Returns a list of problems (empty when
 * the tree matches the pins).
 */
function verifyInstalledVersions(durable, dependencies) {
  const nodeModules = path.join(durable, 'node_modules');
  const problems = [];
  for (const [name, expected] of Object.entries(dependencies)) {
    const file = path.join(nodeModules, ...name.split('/'), 'package.json');
    if (!existsSync(file)) {
      problems.push(`${name} is missing`);
      continue;
    }
    try {
      const actual = JSON.parse(readFileSync(file, 'utf-8')).version;
      if (actual !== expected) {problems.push(`${name} installed ${actual}, expected ${expected}`);}
    } catch (err) {
      problems.push(`${name} has an unreadable package.json (${err?.message ?? err})`);
    }
  }
  return problems;
}

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
 *   'acquired', this process owns the lock;
 *   'held'    , a live run owns a fresh lock;
 *   'error'   , the lock file cannot be created at all (e.g. unwritable dir).
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

/**
 * Run `npm ci` in one durable directory. Returns { ok, detail }.
 * `ci` rather than `install` so the committed lockfile is authoritative: npm
 * refuses outright when the copied manifest and lockfile disagree, and it never
 * silently re-resolves a dependency to a newer version.
 */
function runNpmInstall(prefix) {
  const args = ['ci', '--omit=dev', '--no-audit', '--no-fund'];
  let result;
  if (process.platform === 'win32') {
    // npm is a .cmd shim on Windows and must go through the shell.
    result = spawnSync(`npm ${args.join(' ')}`, {
      shell: true,
      cwd: prefix,
      timeout: NPM_TIMEOUT_MS,
      encoding: 'utf-8',
    });
  } else {
    result = spawnSync('npm', args, { cwd: prefix, timeout: NPM_TIMEOUT_MS, encoding: 'utf-8' });
  }
  if (result.error) {
    const timedOut = result.error.code === 'ETIMEDOUT';
    return { ok: false, detail: timedOut ? `npm ci timed out after ${NPM_TIMEOUT_MS}ms` : String(result.error.message ?? result.error) };
  }
  if (result.status !== 0) {
    const tail = (result.stderr ?? '').trim().split('\n').slice(-5).join('\n');
    return { ok: false, detail: `npm ci exited ${result.status}${tail ? `\n${tail}` : ''}` };
  }
  return { ok: true, detail: 'installed' };
}

/**
 * True when the durable tree for `server` already holds exactly the pinned
 * dependency set, so nothing needs to be fetched and the plugin copy only needs
 * relinking. This is the fast path for an upgrade that changed only the RANGE
 * STRINGS in the shipped manifest (2.3.3 replaced carets with exact pins): the
 * bytes on disk are already the right versions, and running npm would be a
 * pointless network round trip that also risks destroying a working tree.
 */
function durableAlreadySatisfies(durable, server, dependencies) {
  if (!hasProbe(path.join(durable, 'node_modules'), server)) return false;
  return verifyInstalledVersions(durable, dependencies).length === 0;
}

/**
 * Install into a sibling staging directory and swap the result into place, so a
 * failure can never leave the durable tree empty.
 *
 * `npm ci` deletes node_modules before it fetches anything. Run against the live
 * durable directory, a registry outage midway through turns a working install
 * into an empty one, and the SessionStart hook's 24h failure latch then blocks
 * the retry that would fix it. Staging keeps the previous tree untouched until a
 * verified replacement exists; the swap is two renames on one filesystem.
 *
 * Returns { ok, detail }.
 */
function stagedInstall(durable, spec, server) {
  const staging = path.join(durableDepsRoot(), `.staging-${server}-${process.pid}`);
  const live = path.join(durable, 'node_modules');
  const retired = path.join(durableDepsRoot(), `.retired-${server}-${Date.now()}`);
  try {
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(staging, { recursive: true });
    copyFileSync(spec.manifestFile, path.join(staging, 'package.json'));
    copyFileSync(spec.lockFilePath, path.join(staging, 'package-lock.json'));

    const npm = runNpmInstall(staging);
    if (!npm.ok) return { ok: false, detail: npm.detail };
    if (!hasProbe(path.join(staging, 'node_modules'), server)) {
      return { ok: false, detail: `npm ci finished but ${SERVER_PROBES[server]} is missing` };
    }
    const drift = verifyInstalledVersions(staging, spec.dependencies);
    if (drift.length > 0) {
      return { ok: false, detail: `installed versions do not match the pins: ${drift.join('; ')}` };
    }

    // Promote. Move the old tree aside rather than deleting it, so a failed
    // second rename can put it back.
    mkdirSync(durable, { recursive: true });
    const hadPrevious = lstatSync(live, { throwIfNoEntry: false }) !== undefined;
    if (hadPrevious) renameSync(live, retired);
    try {
      renameSync(path.join(staging, 'node_modules'), live);
    } catch (err) {
      if (hadPrevious) renameSync(retired, live);
      throw err;
    }
    // The manifest/lock fingerprint is written last: if this process dies
    // between the two, the fingerprint still describes the older tree and the
    // next run reinstalls rather than trusting a half-applied upgrade.
    copyFileSync(spec.manifestFile, path.join(durable, 'package.json'));
    copyFileSync(spec.lockFilePath, path.join(durable, 'package-lock.json'));
    return { ok: true, detail: 'installed' };
  } finally {
    rmSync(staging, { recursive: true, force: true });
    rmSync(retired, { recursive: true, force: true });
  }
}

/**
 * Install every missing server's deps into the durable home and link the
 * plugin copy to it. Returns { ok, failed, skipped }, `failed` is the list of
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
    try {
      let spec;
      try {
        spec = readVerifiedSpec(pluginRoot, server);
      } catch (err) {
        // Refusing here is the point: an unpinned or lock-disagreeing manifest
        // would install something other than what this release was tested with.
        // The durable bytes are still fine though, so relink to them and keep
        // the server running on the previous release's dependencies.
        const reason = err?.message ?? err;
        if (hasProbe(path.join(durable, 'node_modules'), server)) {
          try {
            const how = linkDeps(pluginRoot, server);
            if (depsSatisfied(pluginRoot, server)) {
              log(
                `${server}: FAILED - refusing to install, ${reason}. Relinked (${how}) to the ` +
                  `existing durable install, so ${server} is running the previous release's ` +
                  `dependencies until the shipped manifest and lockfile agree.`,
              );
              failed.push(server);
              continue;
            }
          } catch {
            /* fall through to the plain refusal below */
          }
        }
        log(`${server}: FAILED - refusing to install, ${reason}`);
        failed.push(server);
        continue;
      }

      // Fast path: the durable tree is already exactly the pinned set.
      if (durableAlreadySatisfies(durable, server, spec.dependencies)) {
        const how = linkDeps(pluginRoot, server);
        if (!depsSatisfied(pluginRoot, server)) {
          log(`${server}: FAILED - linked (${how}) but the plugin copy still cannot resolve deps`);
          failed.push(server);
          continue;
        }
        // Refresh the fingerprint so SessionStart's relink check matches too.
        mkdirSync(durable, { recursive: true });
        copyFileSync(spec.manifestFile, path.join(durable, 'package.json'));
        copyFileSync(spec.lockFilePath, path.join(durable, 'package-lock.json'));
        log(`${server}: durable install already matches the pins, relinked (${how}), no npm needed`);
        skipped.push(server);
        continue;
      }

      log(`${server}: installing native deps into ${durable}`);
      const npm = stagedInstall(durable, spec, server);
      if (!npm.ok) {
        // The staged install never touched the live tree. If a previous
        // install is still sitting there, relink to it: a server running last
        // release's dependency versions beats a server that cannot start,
        // and the next session retries the upgrade.
        let recovered = '';
        if (hasProbe(path.join(durable, 'node_modules'), server)) {
          try {
            const how = linkDeps(pluginRoot, server);
            if (depsSatisfied(pluginRoot, server)) {
              recovered =
                ` The previous durable install was left intact and relinked (${how}), so ` +
                `${server} still runs on the dependency versions it had before this upgrade.`;
            }
          } catch {
            /* the plain failure below is still accurate */
          }
        }
        log(`${server}: FAILED - ${npm.detail}.${recovered}`);
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
 * Called on every exit path, including failures before any install starts,
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
