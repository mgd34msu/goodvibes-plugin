#!/usr/bin/env node
/**
 * check-versions.mjs
 *
 * Verifies every version-bearing manifest in the repo agrees with the single
 * source of truth, plugins/goodvibes/.claude-plugin/plugin.json.
 *
 *   node scripts/check-versions.mjs
 *
 * The set covered here is everything a release bump has to move together:
 *
 *   - the plugin manifest (source of truth) and its marketplace.json entry,
 *   - the root package.json (and the root package-lock.json that mirrors it),
 *   - the four workspace packages under packages/,
 *   - the three shipped runtime manifests under plugins/goodvibes/server/,
 *     and each of their committed package-lock.json files (npm records the
 *     version twice: at the top level and under packages[""]).
 *
 * Prints every version found and exits non-zero when they disagree (or when a
 * manifest is missing/unreadable).
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(relPath) {
  return JSON.parse(readFileSync(resolve(repoRoot, relPath), 'utf8'));
}

function printTable(rows) {
  const pad = Math.max(...rows.map((r) => r.source.length));
  for (const { source, version } of rows) {
    console.log(`${source.padEnd(pad)}  ${version}`);
  }
}

const PLUGIN_MANIFEST = 'plugins/goodvibes/.claude-plugin/plugin.json';
const SERVERS = ['intel', 'analytics', 'connect'];

/** Every place a version lives, as { source, extract } pairs. */
function versionSources() {
  const checks = [
    { source: PLUGIN_MANIFEST, extract: () => readJson(PLUGIN_MANIFEST).version },
    {
      source: '.claude-plugin/marketplace.json (plugins[name=goodvibes])',
      extract: () => {
        const manifest = readJson('.claude-plugin/marketplace.json');
        const entry = (manifest.plugins ?? []).find((p) => p.name === 'goodvibes');
        if (!entry) throw new Error('no plugins[] entry named "goodvibes"');
        return entry.version;
      },
    },
    { source: 'package.json', extract: () => readJson('package.json').version },
    { source: 'package-lock.json', extract: () => readJson('package-lock.json').version },
    {
      source: 'package-lock.json (packages[""])',
      extract: () => readJson('package-lock.json').packages['']?.version,
    },
  ];

  for (const pkg of ['core', 'intel', 'analytics', 'connect']) {
    const rel = `packages/${pkg}/package.json`;
    checks.push({ source: rel, extract: () => readJson(rel).version });
  }

  for (const server of SERVERS) {
    const manifest = `plugins/goodvibes/server/${server}/package.json`;
    const lock = `plugins/goodvibes/server/${server}/package-lock.json`;
    checks.push({ source: manifest, extract: () => readJson(manifest).version });
    checks.push({ source: lock, extract: () => readJson(lock).version });
    checks.push({
      source: `${lock} (packages[""])`,
      extract: () => readJson(lock).packages['']?.version,
    });
  }

  return checks;
}

/**
 * Each shipped runtime manifest must pin exact versions and agree with its
 * committed lockfile. This is the same pair the installer refuses to act on
 * when it disagrees (hooks/lib/deps-install.mjs), checked at build time so the
 * disagreement can never reach a user machine.
 */
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function checkRuntimePins() {
  const problems = [];
  for (const server of SERVERS) {
    const manifestPath = `plugins/goodvibes/server/${server}/package.json`;
    const lockPath = `plugins/goodvibes/server/${server}/package-lock.json`;
    let manifest;
    let lock;
    try {
      manifest = readJson(manifestPath);
      lock = readJson(lockPath);
    } catch (err) {
      problems.push(`${server}: ${err.message}`);
      continue;
    }
    const deps = manifest.dependencies ?? {};
    for (const [name, version] of Object.entries(deps)) {
      if (!EXACT_VERSION.test(String(version))) {
        problems.push(`${manifestPath}: ${name} is "${version}", expected an exact version`);
      }
    }
    const locked = lock.packages?.['']?.dependencies ?? {};
    const norm = (m) => JSON.stringify(Object.entries(m).sort(([a], [b]) => (a < b ? -1 : 1)));
    if (norm(deps) !== norm(locked)) {
      problems.push(`${lockPath}: root dependencies do not match ${manifestPath}`);
    }
    // The root dependency map agreeing is not enough: it is a restatement of
    // the manifest, and a bad merge can leave it saying 1.14.1 while the
    // resolved entry npm actually installs from says something else. That
    // lockfile passes a surface check and then installs the wrong version on
    // every user machine. Check what npm would really fetch.
    for (const [name, pinned] of Object.entries(deps)) {
      const resolved = lock.packages?.[`node_modules/${name}`];
      if (!resolved) {
        problems.push(`${lockPath}: no resolved entry for ${name}`);
      } else if (resolved.version !== pinned) {
        problems.push(
          `${lockPath}: ${name} resolves to ${resolved.version}, but ${manifestPath} pins ${pinned}`,
        );
      }
    }
    problems.push(...checkWorkspaceSkew(manifestPath, deps));
  }
  return problems;
}

/**
 * Every dependency in a runtime manifest is external to the bundle: the server
 * `require()`s it from the durable tree at runtime. The same package is also
 * present in the root workspace, where it is what the repo typechecks, tests,
 * benchmarks against, and (for sql.js and web-tree-sitter) copies WASM binaries
 * out of at build time. If the two versions drift apart, users run code that
 * was never exercised here: for the WASM pair that means a loader paired with a
 * binary from a different release, and for the native packages it means a
 * different ripgrep or ast-grep than CI ever ran.
 *
 * Both numbers come from committed lockfiles, so this needs no install.
 */
function checkWorkspaceSkew(manifestPath, runtimeDeps) {
  const problems = [];
  let rootLock;
  try {
    rootLock = readJson('package-lock.json');
  } catch (err) {
    return [`package-lock.json: ${err.message}`];
  }
  for (const [name, pinned] of Object.entries(runtimeDeps)) {
    const resolved = rootLock.packages?.[`node_modules/${name}`]?.version;
    if (!resolved) {
      problems.push(`package-lock.json: ${name} is pinned in ${manifestPath} but absent from the root lockfile`);
    } else if (resolved !== pinned) {
      problems.push(
        `${name} skew: the root workspace builds and tests against ${resolved}, ` +
          `${manifestPath} pins the runtime to ${pinned}`,
      );
    }
  }
  return problems;
}

function main() {
  let hadError = false;
  const results = [];
  for (const { source, extract } of versionSources()) {
    try {
      const version = extract();
      if (typeof version !== 'string' || version.length === 0) {
        throw new Error('version field missing or empty');
      }
      results.push({ source, version });
    } catch (err) {
      hadError = true;
      results.push({ source, version: `ERROR: ${err.message}` });
    }
  }

  printTable(results);
  const versions = new Set(
    results.filter((r) => !String(r.version).startsWith('ERROR:')).map((r) => r.version),
  );
  if (hadError) {
    console.error('\nFAIL: could not read every version source.');
    process.exit(1);
  }
  if (versions.size > 1) {
    console.error(`\nFAIL: version mismatch across manifests (${[...versions].join(' vs ')}).`);
    process.exit(1);
  }

  const pinProblems = checkRuntimePins();
  if (pinProblems.length > 0) {
    console.error('\nFAIL: shipped runtime dependency pins are not release-safe:');
    for (const problem of pinProblems) console.error(`  ${problem}`);
    process.exit(1);
  }

  console.log(
    `\nOK: ${results.length} manifests agree on version ${[...versions][0]}, ` +
      `and all ${SERVERS.length} runtime manifests are exactly pinned and lockfile-matched.`,
  );
}

main();
