#!/usr/bin/env node
/**
 * EXP3 equivalent (deep-review Appendix A), structure extraction vs a native
 * full read. The claimed win ("outline = 7,027t, −65.6% vs native full read")
 * is the premise's proof point; this reruns it against the finished v2
 * `code_read` (extract: outline) instead of v1 `precision_read`.
 *
 * Usage: node packages/intel/bench/measure-outline.mjs [file...]
 * Requires: packages/intel built (`node packages/intel/build.mjs`) and a
 * working tree-sitter grammar set (see lib/tree-sitter.ts's
 * `treeSitterOutlineAvailable` doc if this reports parse failures).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withServer, estimateTokens } from './lib/server-client.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..', '..');

const DEFAULT_TARGETS = [
  'packages/intel/src/tools/code_grep.ts',
  'packages/intel/src/tools/code_read.ts',
  'packages/core/src/cache/index.ts',
];

async function measureOne(callTool, relPath) {
  const absPath = path.join(repoRoot, relPath);
  const raw = await fs.readFile(absPath, 'utf-8');
  const rawBytes = Buffer.byteLength(raw, 'utf8');
  const nativeTokens = estimateTokens(raw);

  const outlineEnv = await callTool('code_read', {
    files: [relPath],
    extract: 'outline',
    base_path: repoRoot,
  });

  const entry = outlineEnv?.data?.files?.[relPath];
  const outlineText = JSON.stringify(entry?.outline ?? entry?.error ?? null);
  const outlineTokens = estimateTokens(outlineText);
  const delta = ((outlineTokens - nativeTokens) / nativeTokens) * 100;

  return {
    file: relPath,
    lines: raw.split('\n').length,
    rawBytes,
    nativeTokens,
    outlineTokens,
    deltaPct: delta,
    error: entry?.error ?? null,
  };
}

async function main() {
  const targets = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_TARGETS;
  const rows = await withServer(async (callTool) => {
    const out = [];
    for (const t of targets) out.push(await measureOne(callTool, t));
    return out;
  });

  console.log('EXP3: outline vs native full read (tokens = bytes/3.5)\n');
  console.log('| File | Lines | Raw bytes | Native (full read) | code_read outline | Δ |');
  console.log('|---|---|---|---|---|---|');
  let anyError = false;
  let allBeatNative = true;
  for (const r of rows) {
    if (r.error) {
      anyError = true;
      console.log(`| ${r.file} | ${r.lines} | ${r.rawBytes} | ${r.nativeTokens}t | ERROR: ${r.error} | — |`);
      continue;
    }
    if (r.outlineTokens >= r.nativeTokens) allBeatNative = false;
    console.log(
      `| ${r.file} | ${r.lines} | ${r.rawBytes} | ${r.nativeTokens}t | ${r.outlineTokens}t | ${r.deltaPct.toFixed(1)}% |`,
    );
  }
  console.log('');
  if (anyError) {
    console.log(
      'VERDICT: inconclusive; one or more files failed outline extraction (see errors above; likely the ' +
        'tree-sitter grammar wasm ABI gap noted in test-utils.ts / the lane 1 report).',
    );
    process.exitCode = 2;
  } else {
    console.log(allBeatNative ? 'VERDICT: PASS; code_read outline beats native full read on every file.' : 'VERDICT: FAIL; code_read outline did not beat native full read on every file.');
    process.exitCode = allBeatNative ? 0 : 1;
  }
}

main().catch((err) => {
  console.error('Bench failed:', err);
  process.exit(1);
});
