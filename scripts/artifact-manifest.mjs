#!/usr/bin/env node
/**
 * artifact-manifest.mjs
 *
 * Hash every file under plugins/goodvibes/ into plugins/goodvibes/ARTIFACTS.json.
 *
 *   node scripts/artifact-manifest.mjs           write the manifest
 *   node scripts/artifact-manifest.mjs --check   fail if it is stale
 *
 * Why the whole tree and not just the build output: users install this plugin
 * by pulling the repo's main branch, so every committed file under
 * plugins/goodvibes/ is shipped product, not just the three bundles the build
 * writes. The dist-match CI gate can only diff what a rebuild regenerates; a
 * hand-edit to a hook, a skill, a command, or a server package.json would sail
 * through it. Hashing the tree here and diffing ARTIFACTS.json in CI closes
 * that gap: any change to any shipped file has to arrive with a regenerated
 * manifest.
 *
 * Exclusions: node_modules/ and .goodvibes/ (never shipped), ARTIFACTS.json
 * itself (it cannot hash its own output), and *.map (source maps are opt-in
 * local debugging output and must not ship, see the build scripts).
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pluginRoot = path.join(root, 'plugins', 'goodvibes');
const output = path.join(pluginRoot, 'ARTIFACTS.json');
const check = process.argv.includes('--check');

function filesBelow(directory, prefix = '') {
  const found = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    // The symlink check runs BEFORE the node_modules skip on purpose. The one
    // symlink this plugin creates at runtime is server/<name>/node_modules
    // pointing into the user's home, and .gitignore's "node_modules/" rule
    // (trailing slash: directories only) does not ignore a symlink, so a
    // `git add -A` would happily stage it as a mode 120000 entry. Skipping the
    // name first would hide exactly the case worth catching.
    if (entry.isSymbolicLink()) {
      throw new Error(`Plugin artifact may not contain a symlink: ${relative}`);
    }
    if (entry.name === 'node_modules' || entry.name === '.goodvibes') continue;
    const absolute = path.join(directory, entry.name);
    if (relative === 'ARTIFACTS.json' || relative.endsWith('.map')) continue;
    if (entry.isDirectory()) found.push(...filesBelow(absolute, relative));
    else if (entry.isFile()) found.push(relative);
  }
  return found;
}

const plugin = JSON.parse(
  fs.readFileSync(path.join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8'),
);
const files = filesBelow(pluginRoot)
  .sort()
  .map((relative) => {
    const content = fs.readFileSync(path.join(pluginRoot, relative));
    return {
      path: relative,
      bytes: content.byteLength,
      sha256: crypto.createHash('sha256').update(content).digest('hex'),
    };
  });
const manifest = `${JSON.stringify(
  {
    schema_version: 1,
    plugin: plugin.name,
    version: plugin.version,
    algorithm: 'sha256',
    files,
  },
  null,
  2,
)}\n`;

if (check) {
  const existing = fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '';
  if (existing !== manifest) {
    console.error('plugins/goodvibes/ARTIFACTS.json is stale; run npm run build.');
    process.exit(1);
  }
  process.stdout.write(`Verified ${files.length} plugin artifact hashes.\n`);
} else {
  fs.writeFileSync(output, manifest, 'utf8');
  process.stdout.write(`Recorded ${files.length} plugin artifact hashes.\n`);
}
