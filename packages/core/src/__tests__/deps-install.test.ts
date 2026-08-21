/**
 * Durable dependency installer: upgrade safety.
 *
 * `plugins/goodvibes/hooks/lib/deps-install.mjs` is the code that runs on a
 * user's machine after a plugin update. Two properties matter more than
 * anything else it does, and both are about NOT breaking a working install:
 *
 *   1. When the durable tree already holds the pinned versions, the installer
 *      must not touch npm at all. The 2.3.3 release changed only the range
 *      STRINGS in the shipped manifests (carets became exact pins), so every
 *      existing user hits this path once. Running npm there would be a
 *      needless network round trip on a tree that is already correct.
 *
 *   2. When npm does have to run and it fails (registry unreachable, offline
 *      laptop), the previous durable tree must survive. `npm ci` deletes
 *      node_modules before it fetches, so running it against the live tree
 *      turns a working install into an empty one; the SessionStart hook's 24h
 *      failure latch then blocks the retry that would have fixed it.
 *
 * These run the installer as a real subprocess with HOME redirected, so the
 * durable home lands in a temp directory and never touches the developer's own
 * ~/.claude. npm is pointed at a closed port so any attempt to reach the
 * registry fails fast and visibly rather than silently succeeding.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEPS_INSTALL = path.resolve(
  __dirname,
  '../../../../plugins/goodvibes/hooks/lib/deps-install.mjs',
);

/** Probe package per server, mirroring SERVER_PROBES in deps-link.mjs. */
const PROBES: Record<string, string> = {
  intel: '@vscode/ripgrep',
  analytics: 'sql.js',
  connect: 'sql.js',
};

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) {
    fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true });
  }
});

interface Fixture {
  home: string;
  pluginRoot: string;
  depsRoot: string;
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** A plugin tree whose three servers each pin their probe package at `pin`. */
function makeFixture(pin: string, options: { breakLock?: boolean } = {}): Fixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-deps-install-'));
  tmpDirs.push(root);
  const home = path.join(root, 'home');
  const pluginRoot = path.join(root, 'plugin');
  for (const [server, probe] of Object.entries(PROBES)) {
    const dir = path.join(pluginRoot, 'server', server);
    writeJson(path.join(dir, 'package.json'), {
      name: `goodvibes-${server}-server`,
      version: '2.3.3',
      private: true,
      dependencies: { [probe]: pin },
    });
    writeJson(path.join(dir, 'package-lock.json'), {
      name: `goodvibes-${server}-server`,
      version: '2.3.3',
      lockfileVersion: 3,
      packages: {
        // A deliberately disagreeing lock exercises the refusal path.
        '': { dependencies: { [probe]: options.breakLock ? '9.9.9' : pin } },
      },
    });
  }
  return { home, pluginRoot, depsRoot: path.join(home, '.claude', '.goodvibes', 'deps') };
}

/** Populate the durable tree for every server as if a previous release installed it. */
function seedDurable(fixture: Fixture, installedVersion: string): void {
  for (const [server, probe] of Object.entries(PROBES)) {
    const durable = path.join(fixture.depsRoot, server);
    writeJson(path.join(durable, 'node_modules', ...probe.split('/'), 'package.json'), {
      name: probe,
      version: installedVersion,
    });
    // A previous release's fingerprint, still carrying the old caret range.
    writeJson(path.join(durable, 'package.json'), {
      name: `goodvibes-${server}-server`,
      dependencies: { [probe]: `^${installedVersion}` },
    });
  }
}

interface RunResult {
  outcome: { ok: boolean; failed: string[]; skipped: string[] };
  log: string;
  elapsedMs: number;
}

/**
 * Run installMissingDeps in a subprocess. HOME is redirected so the durable
 * home is the fixture's; npm is aimed at a closed port so a real fetch cannot
 * quietly succeed and make the assertions meaningless.
 */
function runInstaller(fixture: Fixture): RunResult {
  const resultFile = path.join(fixture.home, 'outcome.json');
  fs.mkdirSync(fixture.home, { recursive: true });
  const script = `
    import { writeFileSync } from 'node:fs';
    const { installMissingDeps } = await import(${JSON.stringify(DEPS_INSTALL)});
    const outcome = installMissingDeps(${JSON.stringify(fixture.pluginRoot)});
    writeFileSync(${JSON.stringify(resultFile)}, JSON.stringify(outcome));
  `;
  const started = Date.now();
  const log = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      HOME: fixture.home,
      USERPROFILE: fixture.home,
      npm_config_registry: 'http://127.0.0.1:1/',
      npm_config_fetch_retries: '0',
      npm_config_fetch_retry_maxtimeout: '1000',
      npm_config_audit: 'false',
      npm_config_fund: 'false',
    },
    timeout: 120_000,
  });
  return {
    outcome: JSON.parse(fs.readFileSync(resultFile, 'utf-8')),
    log,
    elapsedMs: Date.now() - started,
  };
}

function installedProbeVersion(fixture: Fixture, server: string): string | null {
  const file = path.join(
    fixture.depsRoot,
    server,
    'node_modules',
    ...PROBES[server].split('/'),
    'package.json',
  );
  if (!fs.existsSync(file)) {return null;}
  return JSON.parse(fs.readFileSync(file, 'utf-8')).version;
}

describe('deps-install: upgrading an existing install', () => {
  it('relinks without calling npm when the durable tree already matches the pins', () => {
    // The 2.3.3 shape: the manifest now says "1.0.0" where it used to say
    // "^1.0.0", and 1.0.0 is exactly what is already on disk.
    const fixture = makeFixture('1.0.0');
    seedDurable(fixture, '1.0.0');

    const { outcome, log } = runInstaller(fixture);

    expect(outcome.ok).toBe(true);
    expect(outcome.failed).toEqual([]);
    expect(outcome.skipped.sort()).toEqual(['analytics', 'connect', 'intel']);
    // npm was never invoked: it would have failed against the closed port.
    expect(log).toContain('no npm needed');
    expect(log).not.toContain('installing native deps into');
    for (const server of Object.keys(PROBES)) {
      expect(installedProbeVersion(fixture, server)).toBe('1.0.0');
      // The plugin copy now resolves its deps through the durable tree.
      const linked = path.join(
        fixture.pluginRoot,
        'server',
        server,
        'node_modules',
        ...PROBES[server].split('/'),
      );
      expect(fs.existsSync(linked)).toBe(true);
    }
  });

  it('leaves the previous durable tree working when npm cannot reach the registry', () => {
    // The pin moved to a version that is NOT on disk, so npm has to run, and
    // it cannot: the registry is a closed port.
    const fixture = makeFixture('2.0.0');
    seedDurable(fixture, '1.0.0');

    const { outcome, log } = runInstaller(fixture);

    expect(outcome.ok).toBe(false);
    expect(outcome.failed.sort()).toEqual(['analytics', 'connect', 'intel']);
    for (const server of Object.keys(PROBES)) {
      // The whole point: npm ci did not get to delete the working tree.
      expect(installedProbeVersion(fixture, server)).toBe('1.0.0');
    }
    expect(log).toContain('left intact');
    // No staging or retired scratch directories survive a failed run.
    const leftovers = fs
      .readdirSync(fixture.depsRoot)
      .filter((name) => name.startsWith('.staging-') || name.startsWith('.retired-'));
    expect(leftovers).toEqual([]);
  });

  it('still links a healthy durable tree when the shipped manifest and lockfile disagree', () => {
    const fixture = makeFixture('1.0.0', { breakLock: true });
    seedDurable(fixture, '1.0.0');

    const { outcome, log } = runInstaller(fixture);

    // The refusal stands, but the server is not left dead.
    expect(outcome.ok).toBe(false);
    expect(outcome.failed.sort()).toEqual(['analytics', 'connect', 'intel']);
    expect(log).toContain('refusing to install');
    expect(log).toContain("previous release's");
    for (const server of Object.keys(PROBES)) {
      const linked = path.join(
        fixture.pluginRoot,
        'server',
        server,
        'node_modules',
        ...PROBES[server].split('/'),
      );
      expect(fs.existsSync(linked)).toBe(true);
    }
  });
});
