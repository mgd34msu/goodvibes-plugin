#!/usr/bin/env node
/**
 * check-versions.mjs
 *
 * Verifies that the goodvibes plugin version is consistent across the three
 * manifests that declare it:
 *
 *   1. plugins/goodvibes/.claude-plugin/plugin.json   -> version
 *   2. plugins/goodvibes/package.json                 -> version
 *   3. .claude-plugin/marketplace.json                -> plugins[name=goodvibes].version
 *
 * Prints every version found and exits non-zero when they disagree (or when a
 * manifest is missing/unreadable). Currently wired into CI as ADVISORY
 * (continue-on-error) because the drift is known -- see
 * docs/goodvibes-v2-plan.md section 10 (version drift / single source of truth).
 *
 * Usage: node scripts/check-versions.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(relPath) {
  return JSON.parse(readFileSync(resolve(repoRoot, relPath), 'utf8'));
}

const checks = [
  {
    source: 'plugins/goodvibes/.claude-plugin/plugin.json',
    extract: () => readJson('plugins/goodvibes/.claude-plugin/plugin.json').version,
  },
  {
    source: 'plugins/goodvibes/package.json',
    extract: () => readJson('plugins/goodvibes/package.json').version,
  },
  {
    source: '.claude-plugin/marketplace.json (plugins[name=goodvibes])',
    extract: () => {
      const manifest = readJson('.claude-plugin/marketplace.json');
      const entry = (manifest.plugins ?? []).find((p) => p.name === 'goodvibes');
      if (!entry) throw new Error('no plugins[] entry named "goodvibes"');
      return entry.version;
    },
  },
];

let hadError = false;
const results = [];

for (const { source, extract } of checks) {
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

const pad = Math.max(...results.map((r) => r.source.length));
for (const { source, version } of results) {
  console.log(`${source.padEnd(pad)}  ${version}`);
}

const versions = new Set(
  results
    .filter((r) => !String(r.version).startsWith('ERROR:'))
    .map((r) => r.version),
);

if (hadError) {
  console.error('\nFAIL: could not read every version source.');
  process.exit(1);
}
if (versions.size > 1) {
  console.error(`\nFAIL: version mismatch across manifests (${[...versions].join(' vs ')}).`);
  process.exit(1);
}
console.log(`\nOK: all manifests agree on version ${[...versions][0]}.`);
