#!/usr/bin/env node
/**
 * check-versions.mjs
 *
 * Default mode (v1): verifies the single goodvibes v1 plugin version agrees
 * across its plugin.json, package.json, and the marketplace entry.
 *
 *   node scripts/check-versions.mjs
 *
 * --v2 mode: verifies the three v2 plugins are in lockstep — each
 * plugins/goodvibes-<name>/.claude-plugin/plugin.json matches its
 * .claude-plugin/marketplace.json entry, AND all three plugin.json versions
 * agree with each other.
 *
 *   node scripts/check-versions.mjs --v2
 *
 * Prints every version found and exits non-zero when any disagree (or when a
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

function checkV1() {
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
  console.log(`\nOK: all manifests agree on version ${[...versions][0]}.`);
}

function checkV2() {
  const names = ['goodvibes-intel', 'goodvibes-analytics', 'goodvibes-connect'];
  let hadError = false;
  const rows = [];
  const pluginVersions = [];

  let marketplace;
  try {
    marketplace = readJson('.claude-plugin/marketplace.json');
  } catch (err) {
    console.error(`FAIL: cannot read marketplace.json: ${err.message}`);
    process.exit(1);
  }

  for (const name of names) {
    let pluginVersion;
    try {
      pluginVersion = readJson(`plugins/${name}/.claude-plugin/plugin.json`).version;
      if (typeof pluginVersion !== 'string' || pluginVersion.length === 0) {
        throw new Error('version field missing or empty');
      }
    } catch (err) {
      hadError = true;
      pluginVersion = `ERROR: ${err.message}`;
    }
    rows.push({ source: `plugins/${name}/.claude-plugin/plugin.json`, version: pluginVersion });

    const entry = (marketplace.plugins ?? []).find((p) => p.name === name);
    const marketVersion = entry ? entry.version : `ERROR: no marketplace entry for ${name}`;
    if (!entry) hadError = true;
    rows.push({ source: `.claude-plugin/marketplace.json (${name})`, version: marketVersion });

    if (!String(pluginVersion).startsWith('ERROR:') && !String(marketVersion).startsWith('ERROR:')) {
      if (pluginVersion !== marketVersion) {
        hadError = true;
        console.error(
          `MISMATCH: ${name} plugin.json ${pluginVersion} != marketplace ${marketVersion}`,
        );
      }
      pluginVersions.push(pluginVersion);
    }
  }

  printTable(rows);

  const distinct = new Set(pluginVersions);
  if (hadError) {
    console.error('\nFAIL: v2 manifest versions are not in lockstep.');
    process.exit(1);
  }
  if (distinct.size > 1) {
    console.error(`\nFAIL: the three v2 plugins disagree (${[...distinct].join(' vs ')}).`);
    process.exit(1);
  }
  console.log(`\nOK: all three v2 plugins lockstep at ${[...distinct][0]}.`);
}

if (process.argv.includes('--v2')) {
  checkV2();
} else {
  checkV1();
}
