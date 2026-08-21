#!/usr/bin/env node
/**
 * check-versions.mjs
 *
 * Verifies the single goodvibes plugin's version is in lockstep across its
 * plugin.json and its marketplace.json entry.
 *
 *   node scripts/check-versions.mjs
 *
 * (The 2.0 carve-out consolidated three plugins into one named "goodvibes" at
 * plugins/goodvibes/. The plugin ships no root package.json, its runtime
 * manifests live under server/<name>/package.json, so only plugin.json ↔
 * marketplace.json are compared.)
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

function checkGoodvibes() {
  const checks = [
    {
      source: 'plugins/goodvibes/.claude-plugin/plugin.json',
      extract: () => readJson('plugins/goodvibes/.claude-plugin/plugin.json').version,
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
  console.log(`\nOK: plugin.json and marketplace.json agree on version ${[...versions][0]}.`);
}

checkGoodvibes();
