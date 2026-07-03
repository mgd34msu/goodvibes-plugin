/**
 * deps-link — point a plugin server's node_modules at the durable install.
 *
 * Native dependencies live in the durable home `~/.claude/.goodvibes/deps/<server>/`
 * so they survive plugin-cache replacement on update. `linkDeps` makes
 * `<pluginRoot>/server/<server>/node_modules` reach that install, trying the
 * cheapest mechanism first:
 *
 *   1. directory symlink (POSIX, or Windows with Developer Mode)
 *   2. junction (Windows without symlink permission)
 *   3. recursive copy (last resort — always works, costs disk)
 *
 * Dependency-free plain .mjs. Also runnable directly:
 *   node deps-link.mjs <pluginRoot> <server>
 */

import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync, cpSync } from 'node:fs';
import { homedir } from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

/** One representative dependency per server proves that server's install. */
export const SERVER_PROBES = {
  intel: '@vscode/ripgrep',
  analytics: 'sql.js',
  connect: 'sql.js',
};

/** Root of the durable dependency home — survives plugin updates. */
export function durableDepsRoot() {
  return path.join(homedir(), '.claude', '.goodvibes', 'deps');
}

/** Durable per-server dependency directory. */
export function durableDepsDir(server) {
  return path.join(durableDepsRoot(), server);
}

/** True when `nodeModulesDir` contains the server's representative probe package. */
export function hasProbe(nodeModulesDir, server) {
  return existsSync(path.join(nodeModulesDir, ...SERVER_PROBES[server].split('/')));
}

/** True when the plugin copy of `server` can resolve its native deps. */
export function depsSatisfied(pluginRoot, server) {
  return hasProbe(path.join(pluginRoot, 'server', server, 'node_modules'), server);
}

/**
 * Make `<pluginRoot>/server/<server>/node_modules` reach the durable install.
 * Replaces whatever is there (a stale link or an incomplete directory).
 * Returns the mechanism used: 'symlink' | 'junction' | 'copy'.
 * Throws when even the copy fallback fails (e.g. the durable install is absent).
 */
export function linkDeps(pluginRoot, server) {
  const source = path.join(durableDepsDir(server), 'node_modules');
  const target = path.join(pluginRoot, 'server', server, 'node_modules');
  mkdirSync(path.dirname(target), { recursive: true });
  try {
    // rmSync on a symlink removes the link itself, never the durable install.
    if (lstatSync(target, { throwIfNoEntry: false })) {
      rmSync(target, { recursive: true, force: true });
    }
  } catch {
    /* fall through — the link attempts below surface any real problem */
  }
  try {
    symlinkSync(source, target, 'dir');
    return 'symlink';
  } catch {
    /* try junction next */
  }
  try {
    symlinkSync(source, target, 'junction');
    return 'junction';
  } catch {
    /* fall back to a full copy */
  }
  cpSync(source, target, { recursive: true });
  return 'copy';
}

// CLI: node deps-link.mjs <pluginRoot> <server>
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [pluginRoot, server] = process.argv.slice(2);
  if (!pluginRoot || !SERVER_PROBES[server]) {
    process.stderr.write('usage: node deps-link.mjs <pluginRoot> <intel|analytics|connect>\n');
    process.exit(2);
  }
  try {
    const how = linkDeps(pluginRoot, server);
    process.stdout.write(`linked ${server} node_modules to durable install (${how})\n`);
  } catch (err) {
    process.stderr.write(`failed to link ${server}: ${err?.message ?? err}\n`);
    process.exit(1);
  }
}
