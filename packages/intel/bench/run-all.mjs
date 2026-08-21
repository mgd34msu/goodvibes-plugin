#!/usr/bin/env node
/**
 * Runs the full EXP measurement suite (gate 5: "intel beats native on kept
 * operations at defaults, or the README claim comes off", plan §5.3).
 * Ported from the deep-review-2026-07-01.md Appendix A methodology; scoped
 * to the operations code_read/code_grep actually kept (outline + search,
 * content/symbols/ast retired, so EXP1/EXP2/EXP5-7 do not port).
 *
 * Runnable standalone; no CI wiring (lane 8 reruns this after the full v2
 * build, per the carve-out spec §5.3/§6 lane 8).
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function run(script, args = []) {
  console.log(`\n${'='.repeat(72)}\n${script} ${args.join(' ')}\n${'='.repeat(72)}`);
  const result = spawnSync('node', [path.join(__dirname, script), ...args], { stdio: 'inherit' });
  return result.status ?? 1;
}

const outlineStatus = run('measure-outline.mjs');
const grepStatus = run('measure-grep.mjs');

console.log(`\n${'='.repeat(72)}`);
console.log('SUMMARY');
console.log('='.repeat(72));
console.log(`measure-outline.mjs: ${outlineStatus === 0 ? 'PASS' : outlineStatus === 2 ? 'INCONCLUSIVE' : 'FAIL'}`);
console.log(`measure-grep.mjs:    ${grepStatus === 0 ? 'PASS' : 'FAIL'}`);

process.exit(outlineStatus === 0 && grepStatus === 0 ? 0 : 1);
